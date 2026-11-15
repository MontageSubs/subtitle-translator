import type { Plugin } from "vite";
import type { SiteConfig } from "../src/config/site";
import { isListedInSitemap } from "../src/config/crawlPolicy";
import type { DocsSource } from "./docs/content";
import type { LocaleCode } from "../src/i18n/locales.config";

const PROJECT_SUMMARY = "Montage Subtitle Translator is an open-source web tool by the MontageSubs fan subtitle group. It translates whole subtitle files in seconds with scene-level context, consistent terminology and professional subtitle typography.";

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

export function llmsTxtPlugin(source: DocsSource, site: SiteConfig, defaultLocale: LocaleCode, indexable: boolean): Plugin {
  const base = site.siteUrl.replace(/\/+$/, "");
  return {
    name: "llms-txt",
    apply: "build",
    async generateBundle() {
      if (!indexable) return;
      const { docPages } = await source.current();
      const listed = docPages.filter((page) => page.locale === defaultLocale && !page.isFallback && isListedInSitemap(page.restrictions) && (!page.route || page.route === "docs"));
      const entries = listed.map((page) => `- [${oneLine(page.title)}](${base}/${defaultLocale}/docs/${page.slug}/): ${oneLine(page.summary)}`);
      const text = [
        "# Montage Subtitle Translator",
        "",
        `> ${PROJECT_SUMMARY}`,
        "",
        "## Tool",
        "",
        `- [Subtitle translator](${base}/${defaultLocale}/): upload SRT, VTT or ASS subtitles and download bilingual or translated files.`,
        "",
        "## Documentation",
        "",
        ...entries,
        "",
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "llms.txt", source: text });
    },
  };
}
