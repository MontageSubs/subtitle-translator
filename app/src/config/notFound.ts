import { composeDocumentTitle } from "../render/documentTitle";

export const NOT_FOUND_CODE = "404";
export const NOT_FOUND_LABEL = "Page Not Found";
export const NOT_FOUND_TEXT = "The page you are looking for does not exist.";
export const NOT_FOUND_ACTION = "Go to translator";

export const notFoundTitle = (brand: string): string => composeDocumentTitle(NOT_FOUND_LABEL, brand);
