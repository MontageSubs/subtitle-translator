import { buildPath, getRoute } from "../../../router/router";
import { enableDragScroll } from "../../../utils/dragScroll";
import { saveBlob } from "../../../utils/download";
import { openModal } from "../../modal";
import type { PreviewModalHandle } from "../types";
import { renderSourceOnlyModal } from "./markup";
import { mountWindowState } from "./windowState";

export interface SourceViewInput {
  bytes: Uint8Array;
  filename: string;
}

export function openSourcePreview({ bytes, filename }: SourceViewInput): PreviewModalHandle {
  const guideHref = buildPath(getRoute().locale, "docs", ["subtitle-editor"]);
  const modal = openModal({ html: renderSourceOnlyModal(guideHref), onClosed: () => windowState.dispose() });
  const { backdrop, query } = modal;
  const windowState = mountWindowState(backdrop, query(".preview-modal-box"));
  const pre = query<HTMLElement>("#preview-raw-source");
  pre.textContent = new TextDecoder().decode(bytes);
  enableDragScroll(pre);
  query(".preview-download-btn").addEventListener("click", () => saveBlob(new Blob([bytes as BlobPart], { type: "text/plain;charset=utf-8" }), filename));
  query(".modal__maximize").addEventListener("click", windowState.toggleMaximized);
  query<HTMLElement>(".modal__tab").focus();
  return { close: modal.close };
}
