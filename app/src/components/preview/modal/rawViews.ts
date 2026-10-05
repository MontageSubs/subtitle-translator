import { enableDragScroll } from "../../../utils/dragScroll";
import { saveBlob } from "../../../utils/download";
import { alignTexts } from "./alignTexts";
import type { PreviewSession } from "./session";

export interface RawViewsHandle {
  updateTarget(rawTarget: string): void;
}

function linkScroll(first: HTMLElement, second: HTMLElement): void {
  let syncing: HTMLElement | null = null;
  const forward = (from: HTMLElement, to: HTMLElement) => {
    from.addEventListener("scroll", () => {
      if (syncing === from) return;
      syncing = to;
      to.scrollLeft = from.scrollLeft;
      to.scrollTop = from.scrollTop;
      requestAnimationFrame(() => { syncing = null; });
    }, { passive: true });
  };
  forward(first, second);
  forward(second, first);
}

export function mountRawViews(session: PreviewSession, rawSource: string, initialTarget: string): RawViewsHandle {
  const { options } = session;
  const sourcePre = session.query<HTMLElement>("#preview-raw-source");
  const targetPre = session.query<HTMLElement>("#preview-raw-target");
  const compareSource = session.query<HTMLElement>("#preview-compare-source");
  const compareTarget = session.query<HTMLElement>("#preview-compare-target");
  const originalSource = options.trueOriginalSourceText ?? rawSource;
  let rawTarget = initialTarget;

  function render(): void {
    targetPre.textContent = rawTarget;
    const [alignedSource, alignedTarget] = alignTexts(rawSource, rawTarget);
    compareSource.textContent = alignedSource;
    compareTarget.textContent = alignedTarget;
  }

  sourcePre.textContent = originalSource;
  render();
  linkScroll(compareSource, compareTarget);
  [sourcePre, targetPre, compareSource, compareTarget].forEach(enableDragScroll);

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
