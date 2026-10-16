const PAPER_LIGHT = "#faf9f6";
const PAPER_DARK = "#141318";

export const EARLY_THEME_HEAD = `<meta name="color-scheme" content="light dark" />
    <meta name="theme-color" content="${PAPER_LIGHT}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${PAPER_DARK}" media="(prefers-color-scheme: dark)" />
    <style>html{background:${PAPER_LIGHT}}@media(prefers-color-scheme:dark){html{background:${PAPER_DARK}}}</style>`;
