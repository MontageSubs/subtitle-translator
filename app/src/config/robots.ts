const INDEXABLE_DIRECTIVES = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const NOINDEX_DIRECTIVES = "noindex";

export const robotsDirectives = (indexable: boolean): string => (indexable ? INDEXABLE_DIRECTIVES : NOINDEX_DIRECTIVES);

export const robotsMetaTag = (indexable: boolean): string => `<meta name="robots" content="${robotsDirectives(indexable)}" />`;
