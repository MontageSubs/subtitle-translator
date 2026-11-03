import { enableDragScroll } from "../../../utils/dragScroll";
import { saveBlob } from "../../../utils/download";
import { escapeHtml } from "../../../utils/escapeHtml";
import { alignTexts } from "./alignTexts";
import type { PreviewSession } from "./session";

export interface RawViewsHandle {
  updateTarget(rawTarget: string): void;
}

function renderCompareCells(source: string, target: string): string {
  const targetLines = target.split("\n");
  return source.split("\n").map((line, index) => `<span class="preview-compare-cell" dir="auto">${escapeHtml(line)}</span><span class="preview-compare-cell" dir="auto">${escapeHtml(targetLines[index] ?? "")}</span>`).join("");
}

export function mountRawViews(session: PreviewSession, rawSource: string, initialTarget: string): RawViewsHandle {
  const { options } = session;
  const sourcePre = session.query<HTMLElement>("#preview-raw-source");
  const targetPre = session.query<HTMLElement>("#preview-raw-target");
  const compareScroller = session.query<HTMLElement>("#preview-compare-scroller");
  const compareGrid = session.query<HTMLElement>("#preview-compare-grid");
  const originalSource = options.trueOriginalSourceText ?? rawSource;
  let rawTarget = initialTarget;

  function render(): void {
    targetPre.textContent = rawTarget;
    const [alignedSource, alignedTarget] = alignTexts(rawSource, rawTarget);
    compareGrid.innerHTML = renderCompareCells(alignedSource, alignedTarget);
  }

  sourcePre.textContent = originalSource;
  render();
  [sourcePre, targetPre, compareScroller].forEach(enableDragScroll);

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
