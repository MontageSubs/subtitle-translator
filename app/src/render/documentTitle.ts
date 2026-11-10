import { TITLE_WIDTH, fitText, textWidth } from "../utils/fitText";

const TITLE_SEPARATOR = " · ";

export const composeDocumentTitle = (pageTitle: string, brand: string): string =>
  pageTitle.includes(brand) ? pageTitle : `${fitText(pageTitle, TITLE_WIDTH - textWidth(`${TITLE_SEPARATOR}${brand}`))}${TITLE_SEPARATOR}${brand}`;
