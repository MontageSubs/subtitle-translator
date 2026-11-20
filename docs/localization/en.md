
# Help Localize Montage Subtitle Translator

Montage Subtitle Translator is an open-source project maintained by its community. We believe language shouldn't stand in the way of enjoying subtitled content or discovering stories from other cultures. Whether you're a translator, a subtitler, a developer, or simply someone who cares about language, there's a place for you here. Every contribution, big or small, helps make the tool better for everyone.

## How We Approach Translation

Good localization is about more than translating words. It's about making the tool feel natural and easy to use, no matter what language someone speaks. Here are a few principles that guide our work:

* **Translate for meaning, not word for word.** Take a moment to understand what a button or option does before translating it. Then express that meaning clearly and naturally in the target language.
* **Use AI as a tool, not a substitute for human review.** AI can help with translation, but it can miss tone, nuance, and context. We don't accept machine-only translations that haven't been reviewed by a person.
* **Ask when something isn't clear.** Subtitle tools come with specialized terminology. If you're unsure what a feature or option means, ask in the community or on GitHub Discussions. We can work out the wording together.
* **Keep language codes consistent.** We follow [ISO 639](https://en.wikipedia.org/wiki/ISO_639) and [BCP 47](https://en.wikipedia.org/wiki/IETF_language_tag) standards. Use a two-letter language code where possible, such as `en` for English. For regional variants, use a BCP 47 tag, such as `pt-BR` for Brazilian Portuguese.
* **Know the license.** All contributions are made under the MIT License. Please read our [Community Contributor Covenant] before contributing.

---

## Ways to Contribute

Localization is just one way to get involved. Whether you enjoy working with words, documentation, or code, there's room to contribute. Visit our [contribution page](../contribute/en.md) to explore other ways to help.

### 1. User Interface

Interface translations are managed through Weblate and Crowdin, rather than directly in GitHub. You can help improve existing translations or add support for a new language.

* [Weblate](https://hosted.weblate.org/projects/subtitle-translator/web-interface/)
* [Crowdin](https://crowdin.com/project/montage-subtitle-translator)

New to these platforms? Join one of our community spaces below, and we'll help you get started. To request a new language, open a [GitHub Issue](https://github.com/MontageSubs/subtitle-translator/issues/) or start a discussion on [GitHub Discussions](https://github.com/MontageSubs/subtitle-translator/discussions).

Translations generally go through review on the platform, testing on the `beta` branch, and release from the `main` branch.

### 2. Documentation

Our guides and community documents are written in [Markdown](https://en.wikipedia.org/wiki/Markdown) and stored in the repository's `docs/` directory. To contribute, edit a document on GitHub and submit a PR. You can also click "Improve this page" at the top of a page or beside its title to open the corresponding file on GitHub.

If a document isn't available in your language yet, the link will take you to the English version. Use the same file structure to create a new file with the appropriate language code, such as `pt-BR.md`.

Before getting started, check the `docs/` directory on the `beta` branch to see if someone is already working on the same document. Folder names, such as `about/`, form part of the page URL, and the URL path stays the same across languages.

After review, documents are generally merged into the `main` branch for release. Some may go through the `beta` branch first for further revisions.

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

## Join the Community

We're a community of people who care about subtitles and enjoy learning from one another. Whether you're an experienced translator, a developer interested in subtitle tools, or simply someone who appreciates good subtitles, you're welcome here.

Come say hello, share your ideas, and help make subtitle translation easier for everyone. You can also visit our [contribution page](../contribute/en.md) to find more ways to get involved.

* **Community spaces:** [Telegram](https://t.me/+q3jiRo5uOGRkYmYx) | [Discord](https://discord.com/invite/UuQ8tFpMYy) | [IRC](https://web.libera.chat/#MontageSubs)
* **Project links:** [GitHub Discussions](https://github.com/MontageSubs/subtitle-translator/discussions) | [Source code](https://github.com/MontageSubs/subtitle-translator)

**Contributors**

We're grateful to everyone who helps make this project possible, and we'd be glad to include your name on the contributors list. We respect everyone's privacy and never publish personal information without consent. If you'd like your name included, simply contact a project maintainer or let us know in the community after contributing.
