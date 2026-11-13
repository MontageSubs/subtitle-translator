import { endsTextSelection } from "../utils/textSelection";

const GUARDED_SURFACES = ".toggle-row__text, .more__summary";
const DOUBLE_CLICK = 2;

export function mountSelectionClickGuard(root: HTMLElement, signal: AbortSignal): void {
  root.addEventListener("click", (event) => {
    const surface = (event.target as HTMLElement).closest<HTMLElement>(GUARDED_SURFACES);
    if (!surface || event.detail === 0 || (event.detail < DOUBLE_CLICK && !endsTextSelection(event))) return;
    event.preventDefault();
    if (event.detail === DOUBLE_CLICK) surface.closest<HTMLElement>(".toggle-row")?.querySelector<HTMLInputElement>("input")?.click();
  }, { signal });
}
