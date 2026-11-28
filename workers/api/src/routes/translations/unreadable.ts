import type { RequestContext } from "../../http/context";
import { jsonResponse } from "../../http/responses";
import { joinFields } from "../../logging/fields";
import { logRequest } from "../../logging/requestLog";
import { trace } from "../../logging/trace";
import type { ReputationLedger } from "../../security/reputation/ledger";
import { DEFAULT_SCENE_CHANGE_SECONDS, sceneIndexes } from "../../subtitle/common/sceneThreads";
import { attemptFields, type ParsedRequest } from "./request";

const UNREADABLE_SUBTITLE_STATUS = 422;

function longestCueChars(request: ParsedRequest): number {
  let longest = 0;
  for (const { text } of request.cues) if (text.length > longest) longest = text.length;
  return longest;
}

function sceneCount({ cues, sceneSeconds }: ParsedRequest): number {
  const sceneChangeMs = (sceneSeconds ?? DEFAULT_SCENE_CHANGE_SECONDS) * 1000;
  const scenes = sceneIndexes(cues, sceneChangeMs, ({ start_ms, end_ms }) => ({ kind: "dialogue", start_ms, end_ms }));
  return scenes[scenes.length - 1]! + 1;
}

export function rejectUnreadableSubtitle(rc: RequestContext, ledger: ReputationLedger, ipHash: string, request: ParsedRequest, languagePair: string): Response {
  ledger.penalize();
  const { cues, chars, shape } = request;
  const longest = longestCueChars(request);
  trace(1, "security", "UNREADABLE_SUBTITLE", () => `Cue shape rejected (${shape}: cues=${cues.length}, chars=${chars}, longest=${longest})`, ipHash);
  const fields = joinFields([
    ["status", UNREADABLE_SUBTITLE_STATUS],
    ["reason", "unreadable_subtitle"],
    ["cause", shape],
    ["cues", cues.length],
    ["chars", chars],
    ["longest", longest],
    ["mean", Math.round(chars / cues.length)],
    ["scenes", sceneCount(request)],
    ["scene_sec", request.sceneSeconds],
    ["lang", languagePair],
    ...attemptFields(request),
  ]);
  logRequest(rc, "rejected", fields, ipHash);
  return jsonResponse(rc, { error: "unreadable_subtitle" }, UNREADABLE_SUBTITLE_STATUS);
}
