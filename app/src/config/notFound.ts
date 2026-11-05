import { composeDocumentTitle } from "../render/metaKeys";

export const NOT_FOUND_LABEL = "Page Not Found";

export const notFoundTitle = (brand: string): string => composeDocumentTitle(NOT_FOUND_LABEL, brand);
