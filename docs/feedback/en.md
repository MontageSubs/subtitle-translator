# Feedback & Suggestions

Found a bug or have an idea for improvement? Let us know.

<div align="center">

| [Report a Bug](https://github.com/MontageSubs/subtitle-translator/issues/) | [Join the Discussion](https://github.com/MontageSubs/subtitle-translator/discussions/) |
| :---: | :---: |

</div>

The sections below cover common issues and what to include when reporting them.

---

## Translation Issues

Translation problems generally fall into two categories.

**1. The translation doesn't sound right**

Awkward phrasing, inaccurate word choices, and grammatical errors often depend on the translation engine and the context it receives. Here are a few features you can try to improve the results:

- **Glossary**: Specify translations for particular terms in advance to keep names and terminology consistent throughout the file. We've adapted this feature to work with different translation engines so it remains reliable across supported environments.
- **Auto-detect terms**: Use the built-in model to automatically extract names and build a glossary for supported languages, helping keep names consistent throughout the file. (Note: Names generally don't change when translating between languages that use the Latin alphabet, so this feature isn't applicable to such language pairs.) You can use it to quickly identify names that need consistent translations.
- **Provide context**: Describe the scene or dialogue to help the translation engine understand the surrounding context (e.g., "This is a story about a mother's love and a rescue. Rachel goes to great lengths to save her son."). This field is intended for background information, not AI instructions. Avoid prompts like "make the translation sound more natural."
- **Scene gap (scene-level translation)**: Our scene-level translation approach helps prevent the loss of focus that can occur when translation engines process long texts. Scene gap determines how subtitles are grouped for translation (30 seconds by default), helping maintain coherence. For episodes with fewer than 500 dialogue lines, reducing Scene gap to 15 seconds often produces better results. The manual setting ranges from 0 to 99,999 seconds: 0 means each subtitle line is translated independently, which can hurt coherence. Values that are too high may provide the engine with too much context and affect translation quality.
- **Switch engines** to see if another handles the language or style better.

**2. Something went wrong with the translation**

If the original text appears in the translation, punctuation is misplaced, or some lines remain untranslated, the problem may lie in our code.

We combine related subtitle lines into complete sentences before translation, then split the translated text back into the original subtitle segments. Some sentence structures and subtitle formats can cause problems during this process.

We don't store subtitle files or translated content on our servers, so we'll need the original subtitle file to reproduce the problem. To help us track down the issue, please include:

- The original subtitle file.
- The target language and a screenshot of your interface settings.
- The translation log below the download button.
- The affected subtitle lines and what you expected to see instead.

**A note about translation logs:** The log area displays diagnostic information for the current translation task. For privacy reasons, these logs are forwarded directly from the translation engine to your browser and aren't accessible to the developers. Including them in your report can make a big difference when diagnosing problems.

Keep in mind that logs aren't saved permanently. They'll disappear if you refresh the page or start a new task, so make sure to copy or save them before submitting a report.

**When some content is left untranslated**

If the original subtitles contain multiple languages, the translation engine may have trouble identifying the input language correctly, causing some content to be skipped.

For example, when translating a dialogue that switches between English and Spanish into French, even "Auto-detect (Online)" may have trouble distinguishing the two languages. The engine may end up understanding one language better than the other and leave some lines untranslated.

We've tried several ways to address this, but frequent language switching can still make the problem difficult to avoid entirely. Reducing Scene gap and using "Auto-detect (Online)" together may help, although intervals that are too short can make it harder to maintain context and coherence.

**A useful tip:** English-based translation engines often struggle with other languages, but engines designed for other languages can usually understand English. If your subtitles contain both English and another language (e.g., English and Spanish), try setting the input language to the other language (e.g., Spanish). The engine's ability to understand English as well may produce better results.

## Service Connection Issues

We've received reports from users who are unable to access or use the service. Based on our investigation, these problems generally fall into two categories:

First, network connectivity. Some users may experience connection timeouts or find that they can't reach our backend servers. We've done our best to reduce data usage and latency, but network conditions in some regions can still make reliable connections difficult.

Second, blocking tools. Some ad blockers and DNS filters may mistakenly block the subdomains used by our backend servers, preventing the service from working properly.

If you're experiencing this issue, see [Unable to connect? DNS filtering might be the cause](../service-access/zh-Hant) for troubleshooting steps.

## UI & Functionality

If something isn't working as expected or a button isn't responding, let us know.

The subtitle preview is a small editor that runs in your browser, handling subtitle format conversions and compatibility in real time. Make sure you're using the latest version before reporting a problem: click the version number in the bottom-right corner and wait a few seconds for the update check. The issue may already have been fixed in a newer version. If it persists, include your version number in the report.

## Security Vulnerabilities

If you discover a security vulnerability or a serious logic flaw, contact the core developers privately rather than posting it on GitHub Issues or in public community channels. This gives us a chance to investigate and fix the problem before details become public. See our [Security Disclosure Guide] for details.

---

## Where to Report

**GitHub Issues**

[GitHub Issues](https://github.com/MontageSubs/subtitle-translator/issues/) is our main channel for bug reports and tracking fixes.

**Community Platforms**

If you don't have a GitHub account, you can also reach us through our official Telegram, IRC, or Discord communities.

**GitHub Discussions**

Use [GitHub Discussions](https://github.com/MontageSubs/subtitle-translator/discussions/) to share experiences, exchange ideas, and suggest improvements. Bug reports belong in Issues.

If you're planning to participate in the community, take a moment to read our [Community Guidelines].

---

## Thanks for Your Help

Thanks for taking the time to report issues and help us improve the project.

Every bug fixed and every piece of feedback helps move an open-source project forward. This tool continues to improve thanks not only to the maintainers, but also to everyone who takes the time to report problems, share experiences, and contribute. It's this shared effort that makes open-source projects possible and helps the tools we build reach more people.