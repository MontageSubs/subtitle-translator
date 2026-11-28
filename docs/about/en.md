# About Montage Subtitle Translator

Montage Subtitle Translator is a free, open-source subtitle translator developed and maintained by the MontageSubs community. It translates SRT, VTT and ASS subtitle files between more than 200 languages and can read subtitles directly from MKV videos. It requires no registration, shows no ads and does not track its users.

## Who We Are

MontageSubs is a non-profit community of film and TV enthusiasts, subtitlers and developers. We care about the details of subtitling: translation quality, accurate timing and professional typesetting.

Our core group produces fansubs entirely by hand. This work is meticulous and slow, and a single title can take weeks to finish. As a result, many films and shows never receive a fansub, and viewers have to either wait or settle for low-quality machine translation.

## Why We Built a Subtitle Translator

We wanted to offer something between the two: a fast, simple tool that gives anyone a readable, well-structured translation, without a complicated setup or a paywall.

The tool began as a set of internal scripts that prepared draft translations for our own subtitlers. Because it grew out of real subtitling work, it includes features that subtitle makers need, such as reading subtitles from video files, handling hearing-impaired captions and checking reading speed. We later refined it and opened it to the public.

## How Our Subtitle Translation Works

Most translation tools send subtitles to a translation engine line by line. This removes the surrounding context, and sentences that span several subtitles are translated in fragments, which often leads to unnatural dialogue, inconsistent terminology and incorrect phrasing.

Our system first merges related subtitles into complete sentences and groups them by scene. Each scene is then sent to the translation engine as continuous text, without timestamps or formatting, so the engine can take the whole conversation into account.

The harder part is restoring the translation to the original timeline: splitting the translated sentences back into the original subtitles and their timestamps. This is especially complex for languages without clear word boundaries, such as Chinese and Japanese, and we have devoted a large part of our development effort to it so that timing and structure remain intact across language pairs.

## Features for Subtitle Work

- **Scene-level translation.** The engine receives whole scenes rather than isolated lines. A slider controls how finely scenes are divided, so you can adjust it to the kind of content you are translating.
- **Enforced glossary.** The names and terms you define are applied consistently throughout the translation, including with engines that do not support glossaries.
- **On-device name detection.** For language pairs in which names are written differently, such as English to Japanese, a small model running in your browser identifies names and prepares a glossary for you to review.
- **Timing restoration and automatic repair.** Translated sentences are aligned back to the original subtitles, and errors introduced by the engine, such as missing or damaged segments, are detected and corrected automatically.
- **Subtitle-specific tools.** Read subtitles directly from MKV videos, remove SDH annotations, keep lyrics in the original language, and export bilingual subtitles or ASS files with styling.
- **Built-in review.** A built-in offline subtitle editor with side-by-side comparison flags missing translations, leftover source text, overlong lines and excessive reading speed. See the [Subtitle Editor Guide](../subtitle-editor/en.md).
- **Local data.** Translation history and downloaded models are stored in your browser, and the interface is available in many languages.

For more about the technology behind these features, see [Translation Engines and Model Support](../model-access/en.md).

## Language Support and Why We Use NMT

The tool supports more than 200 languages. Wide coverage does not mean equal quality for every language pair, and some cases still need improvement. We continue to refine the results with feedback from the community.

We are often asked why we do not use a large language model (LLM). LLMs generally translate better, but a typical subtitle file contains around 1,500 lines, and processing that volume for every user would be too costly for a free community service, for a quality improvement that does not justify the expense.

We therefore chose neural machine translation (NMT) and invested heavily in the processing around it. Current NMT engines have absorbed many of the strengths of LLMs, with fast responses and low cost, and they have greatly reduced the stiffness of traditional machine translation. The weakness lies in how subtitles are usually handled: traditional machine translation subtitle services work without context, often line by line, and the wording frequently misses the meaning. We address this with scene-level translation, supported by the enforced glossary, name detection, timing restoration and automatic repair. This work makes up most of this project's code, and it lets us push the quality of NMT as far as it can go. If LLM costs fall sufficiently, we would be glad to support them, and offers of API credits or other resources are welcome. See [How to Contribute](../contribute/en.md) for details.

## Privacy and Transparency

The tool requires no account, shows no ads and does not profile or track its users. We do not use cookies. Subtitles pass through our server only to reach the translation engine, and they are never stored.

The source code is fully open, and the site is deployed directly through GitHub Actions, so anyone can verify how it works. For details, see the [Privacy Policy](../privacy/en.md).

## Limitations and Service Availability

This project is maintained by volunteers in their spare time. We work to keep the service stable, but as a non-profit effort we cannot guarantee uninterrupted availability. Maintenance, changes at upstream providers or limited maintainer availability can cause temporary interruptions, and we appreciate your understanding. The [Terms of Service](../terms/en.md) cover the details.

It is also important to be clear that the tool cannot replace the craft of a professional human translator. Its purpose is to make good subtitle translation available to as many people as possible, producing a complete, well-structured and reasonably accurate subtitle file within seconds. Machine translation can still contain errors, and complex ASS typesetting may need manual adjustment, so please review the result before you publish it.

## Get Involved

MontageSubs is a community project, and every kind of contribution is welcome: code, bug reports, ideas, interface translations, community work, API credits, or simply sharing the tool with others.

- **Source code:** [GitHub repository](https://github.com/MontageSubs/subtitle-translator)
- **Community:** [Join the Community](../community/en.md)
- **Ways to help:** [How to Contribute](../contribute/en.md)
- **Community rules:** [Code of Conduct](../code-of-conduct/en.md)
- **Accessibility:** [Accessibility Statement](../accessibility/en.md)
- **Security:** [Security Disclosure Guide](../security/en.md)

---

<div align="center">

Powered by Love ❤️ MontageSubs Community

</div>
