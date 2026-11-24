# About Montage Subtitle Translator

Montage Subtitle Translator is a free, open-source subtitle translator from the MontageSubs community. It translates SRT, VTT and ASS files between more than 200 languages, with no sign-up, no ads and no tracking.

## Who We Are

MontageSubs is a community of film and TV fans, subtitlers and developers. Our core group makes fansubs by hand, and we're picky about wording, timing and typesetting.

That care takes time. A single title can take weeks, so plenty of films and shows never get our treatment, and viewers end up choosing between waiting and putting up with rough machine subtitles.

## Why We Built It

The tool grew out of our own workflow. It started as a few scripts for preparing drafts while the manual translation was still underway, and we later cleaned it up and opened it to everyone. The aim is a quick, readable, properly formatted draft. It won't replace a human subtitler, and it doesn't pretend to.

## What Sets It Apart

A translation engine on its own doesn't make good subtitles. Most of our work happens around it.

- **Scene-level context.** Instead of going line by line, we merge cues into whole sentences and group them by scene, so the engine reads the dialogue the way a viewer does.
- **A glossary that sticks.** The names and terms you set are enforced in the result, even with engines that ignore glossaries.
- **Name detection on your device.** For language pairs where names change, such as English to Japanese, a small model in your browser finds the names and builds the glossary for you.
- **Back onto the original timing.** Translated sentences are split back onto the original cues, including for languages that don't put spaces between words.
- **Made for subtitle work.** Read subtitles straight out of MKV videos, remove SDH lines if you want, leave lyrics untranslated, and export bilingual or styled ASS files.
- **Check before you download.** A built-in editor with side-by-side comparison flags missing lines, leftover source text, long lines and fast reading speeds.

If you'd like to know how the pieces fit together, see [Translation Engines and Model Support](../model-access/en.md).

## Free for Everyone

The tool supports over 200 languages. Quality varies from one language pair to another, and we keep refining it with your feedback.

People often ask why we don't use an LLM. Mostly it's cost: a typical subtitle file has around 1,500 lines, and running that for every user would be far too expensive for a free community service. So we use neural machine translation (NMT) together with our scene-level processing. If LLM costs come down, we'd love to add them, and offers of API credits or other resources are very welcome. [How to Contribute](../contribute/en.md) has the details.

## Privacy

No accounts, no ads, no profiling and no cookies. Your subtitles pass through our server on their way to the translation engine and are never stored. The [Privacy Policy](../privacy/en.md) covers the rest.

## Good to Know

The service is run by volunteers in their spare time. We aim for stability but can't promise 100% uptime, as the [Terms of Service](../terms/en.md) explain.

Machine translation makes mistakes, and complex ASS typesetting can need a manual touch. Give the result a read before you share it.

## Get Involved

Code, bug reports, ideas, interface translations or a word to a friend all help. Say hello whenever you like, whether or not you plan to contribute.

- **Source code:** [GitHub repository](https://github.com/MontageSubs/subtitle-translator)
- **Community:** [Join the Community](../community/en.md)
- **Ways to help:** [How to Contribute](../contribute/en.md)
- **Community rules:** [Code of Conduct](../code-of-conduct/en.md)
- **Security:** [Security Disclosure Guide](../security/en.md)

---

<div align="center">

Powered by Love ❤️ MontageSubs Community

</div>
