import { enableDragScroll } from "../../../utils/dragScroll";
import { saveBlob } from "../../../utils/download";
import { isCompactLayout } from "../../../utils/compactLayout";
import { alignTexts } from "./alignTexts";
import type { PreviewSession } from "./session";

export interface RawViewsHandle {
  updateTarget(rawTarget: string): void;
}

function mirrorHorizontalScroll(first: HTMLElement, second: HTMLElement): void {
  let driver: HTMLElement | null = null;
  const follow = (leader: HTMLElement, follower: HTMLElement): void => {
    leader.addEventListener("scroll", () => {
      if (isCompactLayout() || (driver && driver !== leader)) return;
      driver = leader;
      follower.scrollLeft = leader.scrollLeft;
      requestAnimationFrame(() => {
        if (driver === leader) driver = null;
      });
    }, { passive: true });
  };
  follow(first, second);
  follow(second, first);
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
  [sourcePre, targetPre, compareSource, compareTarget].forEach(enableDragScroll);
  mirrorHorizontalScroll(compareSource, compareTarget);

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
