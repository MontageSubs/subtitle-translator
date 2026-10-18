export const composeDocumentTitle = (pageTitle: string, brand: string): string =>
  pageTitle === brand ? brand : `${pageTitle} · ${brand}`;
