const SNIFF_BYTES = 4096;
const TAB = 9;
const LINE_FEED = 10;
const FORM_FEED = 12;
const CARRIAGE_RETURN = 13;
const FIRST_PRINTABLE = 32;
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];

const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean => prefix.every((value, index) => bytes[index] === value);

const isControlByte = (byte: number): boolean => byte < FIRST_PRINTABLE && byte !== TAB && byte !== LINE_FEED && byte !== FORM_FEED && byte !== CARRIAGE_RETURN;

export async function looksLikeText(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  if (startsWith(head, UTF16_LE_BOM) || startsWith(head, UTF16_BE_BOM)) return true;
  return !head.some(isControlByte);
}
