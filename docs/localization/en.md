
# Help Localize Montage Subtitle Translator

Montage Subtitle Translator is an open-source project maintained by its community. We believe language shouldn't stand in the way of enjoying subtitled content or discovering stories from other cultures. Whether you're a translator, a subtitler, a developer, or simply someone who cares about language, there's a place for you here. Every contribution, big or small, helps make the tool better for everyone.

## How We Approach Translation

Good localization is about more than translating words. It's about making the tool feel natural and easy to use, no matter what language someone speaks. Here are a few principles that guide our work:

* **Translate for meaning, not word for word.** Take a moment to understand what a button or option does before translating it. Then express that meaning clearly and naturally in the target language.
* **Use AI as a tool, not a substitute for human review.** AI can help with translation, but it can miss tone, nuance, and context. We don't accept machine-only translations that haven't been reviewed by a person.
* **Ask when something isn't clear.** Subtitle tools come with specialized terminology. If you're unsure what a feature or option means, ask in the community or on GitHub Discussions. We can work out the wording together.
* **Keep language codes consistent.** We follow [ISO 639](https://en.wikipedia.org/wiki/ISO_639) and [BCP 47](https://en.wikipedia.org/wiki/IETF_language_tag) standards. Use a two-letter language code where possible, such as `en` for English. For regional variants, use a BCP 47 tag, such as `pt-BR` for Brazilian Portuguese.
* **Know the license.** All contributions are made under the MIT License. Please read our [Code of Conduct](../code-of-conduct/en.md) before contributing.

---

## Ways to Contribute

Localization is just one way to get involved. Whether you enjoy working with words, documentation, or code, there's room to contribute. Visit our [contribution page](../contribute/en.md) to explore other ways to help.

### 1. User Interface

Interface translations are managed through Weblate and Crowdin rather than by editing files directly on GitHub. You can improve existing translations or add a new language.

* **Where to contribute:** Use either platform below.
    * [Weblate](https://hosted.weblate.org/projects/subtitle-translator/web-interface/)
    * [Crowdin](https://crowdin.com/project/montage-subtitle-translator)
* **Getting started:** New to these platforms? [Join the community](../community/en.md) and we'll help you get started.
* **New languages:** You can start a new language directly on either platform, or tell us through [GitHub Issues](https://github.com/MontageSubs/subtitle-translator/issues/) or [GitHub Discussions](https://github.com/MontageSubs/subtitle-translator/discussions).
* **Workflow:** Submit on the platform → peer review and approval → testing on the `beta` branch → release from the `main` branch.

### 2. Documentation

Our guides and community documents are written in [Markdown](https://en.wikipedia.org/wiki/Markdown) and stored in the repository's `docs/` directory.

* **Where to contribute:** Edit a document on GitHub and submit a PR.
* **Quick edit:** Click "Improve this page" at the top of a page or beside its title to open the corresponding file on GitHub.
    * If a document isn't available in your language yet, the link takes you to the English version. Create a new file with the matching language code, such as `pt-BR.md`.
* **Avoiding duplicate work:** Before you start, check the `docs/` directory on the `beta` branch to see whether someone is already working on the same document.
* **File structure:** Folder names such as `about/` form part of the page URL, and the path is the same across all languages.
* **Workflow:** Submit a PR → review by core maintainers → merge into `main` for release (some documents go through `beta` first for further revision).

### 3. Website Metadata

Website metadata lives in `app/src/metadata/`, with a separate file for each language (such as `en.json`). It helps people understand what the project is about, what it can do, and where to find the information they need, whether they're browsing the website, using social platforms, or asking AI tools.

Good metadata takes more than a literal translation. Think about how people in the target language would naturally describe the project and its features. Adapt the name, description, and feature summaries to make them clear and familiar to local users. Use the appropriate ISO 639 or BCP 47 language code. Changes are submitted as a PR, tested on the `beta` branch, and then merged into the `main` branch for release.

### 4. Model Cards

Descriptions of individual local models live in `app/src/model-catalog/`. Each model has its own [JSON](https://en.wikipedia.org/wiki/JSON) file, with language codes used to identify translated content.

You can help improve a model's description by editing its JSON file and submitting a PR. The goal is to make each model's capabilities and features clear and easy for users to understand.

### 5. Language-Specific Subtitle Handling

Language-specific rules live in `app/src/lib/subtitle/language/`. They cover subtitle conventions, processing rules, and priorities.

If you're familiar with subtitling practices or community standards in your language, we'd welcome your help refining these rules to better reflect real-world usage. You don't need to be a programmer to contribute. Share your knowledge with the community, and our maintainers and developers can help put your suggestions into practice.

---

## Join Us

We're a community of people who care about subtitles and enjoy learning from one another. Whether you're an experienced translator, a developer interested in subtitle tools, or simply someone who appreciates good subtitles, you're welcome here.

Come say hello, share your ideas, and help make subtitle translation easier for everyone. You can also visit our [contribution page](../contribute/en.md) to find more ways to get involved.

* **Community:** [Join the Community](../community/en.md)
* **Project links:** [GitHub Discussions](https://github.com/MontageSubs/subtitle-translator/discussions) | [Source code](https://github.com/MontageSubs/subtitle-translator)

**Acknowledgements**

Contributors are credited on our [Acknowledgements](../acknowledgements/en.md) page. Whether to be listed, and under what name, is entirely up to you: if you'd like to appear there, or would rather not, just tell a maintainer or let us know in the community. We never publish personal information without your say-so.
