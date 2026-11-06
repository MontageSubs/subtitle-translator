import { enableDragScroll } from "../../../utils/dragScroll";
import { saveBlob } from "../../../utils/download";
import { mountCompareView } from "./compareView";
import type { PreviewSession } from "./session";

export interface RawViewsHandle {
  updateTarget(rawTarget: string): void;
}

export function mountRawViews(session: PreviewSession, rawSource: string, initialTarget: string): RawViewsHandle {
  const { options } = session;
  const sourcePre = session.query<HTMLElement>("#preview-raw-source");
  const targetPre = session.query<HTMLElement>("#preview-raw-target");
  const compareView = mountCompareView(session);
  const originalSource = options.trueOriginalSourceText ?? rawSource;
  let rawTarget = initialTarget;

  function render(): void {
    targetPre.textContent = rawTarget;
    compareView.update(rawSource, rawTarget);
  }

  sourcePre.textContent = originalSource;
  render();
  [sourcePre, targetPre].forEach(enableDragScroll);

  session.backdrop.querySelectorAll<HTMLButtonElement>(".preview-download-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.target === "target") {
        saveBlob(new Blob([rawTarget], { type: "text/plain;charset=utf-8" }), options.translatedFilename || "translated.srt");
        return;
      }
      const content: BlobPart = options.trueOriginalSourceBytes ? (options.trueOriginalSourceBytes as BlobPart) : originalSource;
      saveBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), options.sourceFilename || "source.srt");
    });
  });

  return {
    updateTarget(next) {
      rawTarget = next;
      render();
    },
  };
}
