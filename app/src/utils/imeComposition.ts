const IME_PROCESSING_KEY_CODE = 229;

export const isImeComposing = (event: KeyboardEvent): boolean => event.isComposing || event.keyCode === IME_PROCESSING_KEY_CODE;
