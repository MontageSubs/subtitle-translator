import type { Plugin } from "vite";
import type { SiteConfig } from "../src/config/site";
import { isListedInSitemap } from "../src/config/crawlPolicy";
import type { DocsSource } from "./docs/content";
import type { LocaleCode } from "../src/i18n/locales.config";

interface LinkEntry {
  title: string;
  url: string;
  note: string;
}

interface DocSection {
  heading: string;
  categories: readonly string[];
}

const DOCS_ROUTE = "docs";
const OVERVIEW_EXCLUDED_SLUGS: ReadonlySet<string> = new Set(["quotas-and-verification", "model-access"]);

const TITLE = "Montage Subtitle Translator";

const SUMMARY =
  "Montage Subtitle Translator is a free, open-source online subtitle translator from MontageSubs, a non-profit community of film and TV enthusiasts, subtitlers and developers. It translates SRT, VTT and ASS/SSA subtitle files into 200+ languages in seconds, using scene-level context so dialogue reads naturally, with accurate timing and professional typography. No account, no ads, no tracking.";

const COMMUNITY_PARAGRAPHS = [
  "MontageSubs is a community of film and TV enthusiasts, subtitlers, industry professionals and developers. Our core group makes high-quality, hand-crafted fan subtitles, and we care deeply about translation quality, precise timing and professional typography.",
  "We believe the knowledge and tools behind subtitling should be accessible to everyone. Through open-source collaboration, we want to foster cross-language understanding and cultural exchange, so that language never stands in the way of enjoying a film or discovering stories from other cultures.",
];

const VISION_PARAGRAPHS = [
  "Careful manual subtitling takes weeks for a single film, which leaves viewers choosing between waiting and settling for choppy machine output. Our vision is a better middle ground: fast, accessible, well-structured subtitles for anyone, without complicated setup or a paywall, built on the same standards we hold our own subtitles to.",
  "The tool is developed and maintained by volunteers and shared as a public service, free for everyone to use and open for everyone to improve.",
];

const TOOL_PARAGRAPHS = [
  "Montage Subtitle Translator is a web app that translates whole subtitle files in seconds. Instead of translating line by line, it merges related cues into complete sentences, groups them into scenes, translates each scene as continuous text, and restores the result onto the original cues so every timestamp and style stays intact. The engine sees the whole scene, so names, tone and terminology stay consistent from the first line to the last.",
  "Typography follows each language's own subtitle conventions, including punctuation, spacing and line breaks, so files are ready to use. Languages without clear word boundaries are handled with dedicated reconstruction logic.",
];

const HIGHLIGHTS = [
  "**Formats**: SRT, VTT and ASS/SSA. Subtitle tracks can be extracted from MKV files in the browser, and single files, folders, ZIP archives and batches are accepted.",
  "**200+ languages**: broad coverage that improves with community use and contributions.",
  "**Scene-level context**: a slider adjusts scene granularity, balancing speed against how much context the engine sees.",
  "**Glossary and background notes**: define names and terms once and have them applied consistently across the whole film.",
  "**Built-in review**: an editor with side-by-side comparison and automatic checks for missing, overlong, too-fast or untranslated lines makes proofreading easy.",
  "**Flexible output**: bilingual or translation-only subtitles, stacked or split layouts, ASS style presets for desktop and mobile, SDH and bold styling, optional SDH removal, and dedicated lyrics handling.",
  "**On-device models**: name recognition and sentence detection run locally in the browser through ONNX Runtime Web.",
  "**Private by design**: no sign-up, no cookies, no ads, no tracking. Subtitles are not stored, and translation history stays in your own browser.",
  "**Accessible and installable**: keyboard-friendly, light and dark themes, reduced-motion support, installable as a PWA, with an interface in about 30 languages.",
];

const AUDIENCES = [
  "**Subtitlers**: produce high-quality machine-translation drafts with glossaries, context awareness and ASS styling, then refine them in the built-in editor.",
  "**Film and TV enthusiasts**: get professionally formatted, accurately timed subtitles in seconds, or use bilingual output for language learning.",
  "**Developers**: read the MIT-licensed source to see how subtitle formats and styling rules work in practice, and contribute.",
  "**Filmmakers and content creators**: reach audiences across language barriers with translation and subtitling resources.",
];

const DOC_SECTIONS: readonly DocSection[] = [
  { heading: "Learn more", categories: ["general"] },
  { heading: "Privacy and terms", categories: ["legal"] },
  { heading: "Community and contributing", categories: ["community"] },
  { heading: "More tools from MontageSubs", categories: ["ecosystem"] },
];

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

const leadingSentences = (text: string): string => {
  const flattened = oneLine(text);
  return flattened.endsWith("…") ? (flattened.match(/^.*?\.(?=\s|$)/g) ?? [flattened]).join(" ") : flattened;
};

const renderLink = ({ title, url, note }: LinkEntry): string => `- [${title}](${url}): ${note}`;

const renderSection = (heading: string, lines: readonly string[]): string[] => (lines.length ? [`## ${heading}`, "", ...lines, ""] : []);

export function llmsTxtPlugin(source: DocsSource, site: SiteConfig, defaultLocale: LocaleCode, indexable: boolean): Plugin {
  const base = site.siteUrl.replace(/\/+$/, "");
  const localeUrl = (...segments: string[]): string => [base, defaultLocale, ...segments].join("/") + "/";

  return {
    name: "llms-txt",
    apply: "build",
    async generateBundle() {
      if (!indexable) return;
      const { docPages } = await source.current();
      const listed = docPages.filter((page) => page.locale === defaultLocale && !page.isFallback && isListedInSitemap(page.restrictions) && !OVERVIEW_EXCLUDED_SLUGS.has(page.slug));
      const documentLinks = (categories: readonly string[]): string[] =>
        listed
          .filter((page) => categories.includes(page.category))
          .map((page) => renderLink({ title: oneLine(page.title), url: page.route && page.route !== DOCS_ROUTE ? localeUrl(page.route) : localeUrl(DOCS_ROUTE, page.slug), note: leadingSentences(page.summary) }));

      const toolLinks = [
        renderLink({ title: "Subtitle translator", url: localeUrl(), note: "Upload SRT, VTT or ASS subtitles, choose a language, and download translated or bilingual files." }),
        renderLink({ title: "Local models", url: localeUrl("models"), note: "On-device models for name recognition and sentence detection that run in the browser." }),
        renderLink({ title: "Translation history", url: localeUrl("history"), note: "Previous translations, stored only in the visitor's browser." }),
      ];

      const projectLinks = [
        renderLink({ title: "Source code on GitHub", url: site.repoUrl, note: "MIT-licensed repository with the web app, translation backend and documentation." }),
        renderLink({ title: "Discussions", url: localeUrl("discussions"), note: "Questions, ideas and feedback, hosted on GitHub Discussions." }),
        renderLink({ title: "Service status", url: site.statusUrl, note: "Live availability of the translation service." }),
      ];

      const text = [
        `# ${TITLE}`,
        "",
        `> ${SUMMARY}`,
        "",
        ...renderSection("Who we are: MontageSubs", COMMUNITY_PARAGRAPHS),
        ...renderSection("Our vision", VISION_PARAGRAPHS),
        ...renderSection("What Montage Subtitle Translator is", TOOL_PARAGRAPHS),
        ...renderSection("Key features", HIGHLIGHTS.map((item) => `- ${item}`)),
        ...renderSection("Who it is for", AUDIENCES.map((item) => `- ${item}`)),
        ...renderSection("Use the translator", toolLinks),
        ...DOC_SECTIONS.flatMap(({ heading, categories }) => renderSection(heading, documentLinks(categories))),
        ...renderSection("Source and status", projectLinks),
      ].join("\n");

      this.emitFile({ type: "asset", fileName: "llms.txt", source: text });
    },
  };
}
