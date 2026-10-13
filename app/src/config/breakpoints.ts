const MOBILE_MAX_WIDTH_PX = 840;

export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`;

export const COMPACT_LAYOUT_ATTRIBUTE = "data-layout";
export const COMPACT_LAYOUT_VALUE = "compact";
export const COMPACT_LAYOUT_SCOPE = `:where(:root[${COMPACT_LAYOUT_ATTRIBUTE}="${COMPACT_LAYOUT_VALUE}"])`;
