const RIGHT_TO_LEFT_LETTER = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;
const STRONG_LETTER = /\p{L}/u;
const TEXT_FIELD_SELECTOR = 'textarea, input:is([type="text"], [type="search"]):not([inputmode="numeric"])';
const FIELD_FRAME_SELECTOR = ".input-with-clear, .preview-search-wrap, .search-field";

export function textDirectionOf(text: string): "rtl" | "ltr" | null {
  for (const character of text) {
    if (RIGHT_TO_LEFT_LETTER.test(character)) return "rtl";
    if (STRONG_LETTER.test(character)) return "ltr";
  }
  return null;
}

function alignFieldToContent(field: HTMLInputElement | HTMLTextAreaElement): void {
  const frame = field.closest<HTMLElement>(FIELD_FRAME_SELECTOR) ?? field;
  const direction = textDirectionOf(field.value);
  if (direction) frame.dir = direction;
  else frame.removeAttribute("dir");
}

export function installInputDirection(): void {
  const handle = (event: Event): void => {
    const field = (event.target as Element | null)?.closest<HTMLInputElement | HTMLTextAreaElement>(TEXT_FIELD_SELECTOR);
    if (field) alignFieldToContent(field);
  };
  document.addEventListener("input", handle, { passive: true });
  document.addEventListener("focusin", handle, { passive: true });
}
