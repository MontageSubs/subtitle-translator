const BIDI_CONTROLS = /[‪-‮⁦-⁩]/g;
const RIGHT_TO_LEFT_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]|[\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const FIRST_STRONG_LETTER = /\p{L}/u;

export const stripBidiControls = (text: string): string => text.replace(BIDI_CONTROLS, "");

export function directionOfText(text: string): "ltr" | "rtl" {
  const letter = FIRST_STRONG_LETTER.exec(text)?.[0];
  return letter && RIGHT_TO_LEFT_LETTER.test(letter) ? "rtl" : "ltr";
}
