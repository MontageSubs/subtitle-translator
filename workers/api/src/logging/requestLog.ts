import { ipTag, resolveMessage, type LogMessage } from "./trace";

interface Settlement {
  status: number;
  detail?: LogMessage;
  ipHash?: string;
  fault?: boolean;
}

export class RequestLog {
  private settled = false;

  constructor(private readonly method: string, private readonly path: string, private readonly startedAt: number) {}

  settle({ status, detail, ipHash, fault = false }: Settlement): void {
    if (this.settled) return;
    this.settled = true;
    const severe = fault || status >= 500;
    const tag = severe || status >= 400 ? ipTag(ipHash) : null;
    const text = detail === undefined ? "" : resolveMessage(detail);
    const line = `[http] ${this.method} ${this.path} -> ${status} (${Date.now() - this.startedAt}ms${tag ? `, ipHash: ${tag}` : ""})${text ? ` - ${text}` : ""}`;
    (severe ? console.error : console.log)(line);
  }
}
