import { createNerHost } from "./host";
import type { NerRequest, NerResponse } from "./protocol";

const scope = self as unknown as { postMessage(message: NerResponse): void };
const handle = createNerHost((message) => scope.postMessage(message));

self.addEventListener("message", (event: MessageEvent<NerRequest>) => handle(event.data));
