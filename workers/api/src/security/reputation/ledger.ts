import type { Env } from "../../config/env";
import { DAY_MS, settingsFor, type Settings } from "../../config/settings";
import { reportFault } from "../../logging/fault";
import { trace } from "../../logging/trace";
import { cachedPaSessionToken, prefetchPaSessionToken, selectPaSessionToken } from "../../upstream/paSessionStore";
import {
  blankReputation, budgetUsedToday, dayBucket, evaluateGate, isBudgetEnforced, nextEscalationDays, todaysCaptchaCount, windowBucket,
  type BudgetRow, type Gate, type ReputationRow,
} from "./policy";
import { chargeBudget, insertSeal, selectBudget, selectReputation, selectSeal, upsertReputation, type ShieldColumn } from "./store";

export interface LedgerReadOptions {
  sealVersion?: string;
  paSessionToken?: boolean;
}

export interface LedgerOpening {
  gate: Gate;
  storedSeal: string | null;
}

interface PendingEffects {
  malformedPoints: number;
  quarantine: boolean;
  captcha: boolean;
  block: boolean;
  budgetCharge: boolean;
  seals: (readonly [version: string, seal: string])[];
}

const noPendingEffects = (): PendingEffects => ({ malformedPoints: 0, quarantine: false, captcha: false, block: false, budgetCharge: false, seals: [] });

export class ReputationLedger {
  private readonly settings: Settings;
  private readonly budgetEnforced: boolean;
  private row: ReputationRow = blankReputation();
  private budgetUsed = 0;
  private opening: Promise<LedgerOpening> | null = null;
  private pending = noPendingEffects();

  constructor(private readonly env: Env, readonly ipHash: string, private readonly now: number) {
    this.settings = settingsFor(env);
    this.budgetEnforced = isBudgetEnforced(this.settings);
  }

  open(options: LedgerReadOptions = {}): Promise<LedgerOpening> {
    return (this.opening ??= this.read(options));
  }

  private async read({ sealVersion, paSessionToken }: LedgerReadOptions): Promise<LedgerOpening> {
    const { DB: db } = this.env;
    const queries = [selectReputation(db, this.ipHash)];
    const budgetSlot = this.budgetEnforced ? queries.push(selectBudget(db)) - 1 : -1;
    const sealSlot = sealVersion ? queries.push(selectSeal(db, sealVersion)) - 1 : -1;
    const tokenSlot = paSessionToken && cachedPaSessionToken() === null ? queries.push(selectPaSessionToken(db)) - 1 : -1;
    const results = await db.batch(queries);
    this.row = (results[0]!.results[0] as ReputationRow | undefined) ?? blankReputation();
    if (budgetSlot >= 0) this.budgetUsed = budgetUsedToday(results[budgetSlot]!.results[0] as BudgetRow | undefined, this.now);
    if (tokenSlot >= 0) prefetchPaSessionToken(results[tokenSlot]!.results[0] as { value: string } | undefined);
    const storedSeal = sealSlot >= 0 ? ((results[sealSlot]!.results[0] as { seal: string } | undefined)?.seal ?? null) : null;
    return { gate: evaluateGate(this.settings, this.row, this.now), storedSeal };
  }

  penalize(): void {
    const bucket = windowBucket(this.settings, this.now);
    const before = this.row.window_bucket === bucket ? this.row.malformed_count : 0;
    this.row.window_bucket = bucket;
    this.row.malformed_count = before + 1;
    this.pending.malformedPoints++;
    if (before === this.settings.malformedThreshold) this.quarantine("malformed_request_threshold");
  }

  quarantine(reason: string): void {
    if (this.row.quarantine_until > this.now) return;
    const days = nextEscalationDays(this.settings, this.row.quarantine_days);
    this.row.quarantine_until = this.now + days * DAY_MS;
    this.row.quarantine_days = days;
    this.pending.quarantine = true;
    trace(1, "security", "IP_ESCALATED", `reason: ${reason} -> quarantined for ${days}d in D1 ip_shield`, this.ipHash);
  }

  recordCaptchaSolved(): void {
    const count = todaysCaptchaCount(this.row, this.now) + 1;
    this.row.day_bucket = dayBucket(this.now);
    this.pending.captcha = true;
    if (count <= this.settings.dailyCaptchaCap) {
      this.row.captcha_count = count;
      return;
    }
    const days = nextEscalationDays(this.settings, this.row.quarantine_days);
    this.row.captcha_count = 0;
    this.row.quarantine_days = days;
    this.row.quarantine_until = this.now + days * DAY_MS;
    this.row.blocked_until = this.now + this.settings.blockDurationMs;
    this.pending.quarantine = true;
    this.pending.block = true;
    trace(1, "security", "IP_ESCALATED", "reason: daily captcha solve limit -> blocked and quarantined in D1 ip_shield", this.ipHash);
  }

  chargeBudget(): boolean {
    if (!this.budgetEnforced) return true;
    if (this.budgetUsed >= this.settings.globalDailyBudget) return false;
    this.budgetUsed++;
    this.pending.budgetCharge = true;
    return true;
  }

  persistSeal(version: string, seal: string): void {
    this.pending.seals.push([version, seal]);
  }

  applyInBackground(ctx: ExecutionContext, effect: () => void): void {
    ctx.waitUntil(
      this.open()
        .then(() => {
          effect();
          return this.flush();
        })
        .catch((error) => reportFault("ledger_background_failed", error, this.ipHash))
    );
  }

  settle(ctx: ExecutionContext): void {
    ctx.waitUntil(this.flush());
  }

  private drain(): D1PreparedStatement[] {
    const { pending, row } = this;
    this.pending = noPendingEffects();
    const values: Partial<Record<ShieldColumn, number>> = {
      ...(pending.malformedPoints && { window_bucket: row.window_bucket, malformed_count: pending.malformedPoints }),
      ...(pending.quarantine && { quarantine_until: row.quarantine_until, quarantine_days: row.quarantine_days }),
      ...(pending.captcha && { day_bucket: row.day_bucket, captcha_count: row.captcha_count }),
      ...(pending.block && { blocked_until: row.blocked_until }),
    };
    const { DB: db } = this.env;
    const statements = Object.keys(values).length ? [upsertReputation(db, this.ipHash, this.now, values)] : [];
    if (pending.budgetCharge) statements.push(chargeBudget(db, dayBucket(this.now)));
    for (const [version, seal] of pending.seals) statements.push(insertSeal(db, version, seal));
    return statements;
  }

  private async flush(): Promise<void> {
    const statements = this.drain();
    if (!statements.length) return;
    try {
      await this.env.DB.batch(statements);
    } catch (error) {
      reportFault("ledger_commit_failed", error, this.ipHash);
    }
  }
}
