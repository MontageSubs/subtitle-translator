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

Awkward phrasing, inaccurate word choices, and grammatical errors often depend on the translation engine and the context it receives. Here are a few things you can try:

- **Glossary**: Specify how particular names and terms should be translated to keep them consistent throughout the file. We've adapted the feature to work with different translation engines.
- **Auto-detect terms**: Use the built-in model to automatically extract names and create a glossary for supported languages. This helps keep character names consistent throughout the file. (Note: Names generally don't change when translating between languages that use the Latin alphabet, so this feature is not available for those language pairs.)
- **Provide context**: Describe the scene or the subject of the dialogue to give the translation engine some background (e.g., "This is a story about a mother's love and a rescue. Rachel goes to great lengths to save her son."). This field is for background information, not instructions to the AI. Avoid requests like "make the translation sound more natural."
- **Scene gap (scene-level translation)**: Translation engines can lose track of earlier details when processing long texts. To help with this, we use scene-level translation, which divides subtitles into sections based on the Scene gap setting (30 seconds by default). For episodes with fewer than 500 dialogue lines, reducing the gap to 15 seconds often works better. You can set it anywhere from 0 to 99,999 seconds. At 0, each subtitle line is translated on its own, which can result in less coherent translations. If the gap is too large, the engine may lose focus, which can also affect translation quality.
- **Switch engines** to see if another handles the language or style better.

**2. Something went wrong with the translation**

If the original text appears in the translation, punctuation is misplaced, or some lines are left untranslated, the problem may lie in our code.

We combine related subtitle lines into complete sentences before translation, then split the translated text back into the original subtitle segments. Different sentence structures and subtitle formats can sometimes cause problems during this process.

We don't store subtitle files or translated content on our servers, so we'll need the original subtitle file to reproduce the problem. When reporting one, please include:

- The original subtitle file.
- The target language and a screenshot of your interface settings.
- The translation log below the download button.
- The affected subtitle lines and what you expected to see instead.

**A note about translation logs:** The log area contains diagnostic information for the current translation task. For privacy reasons, logs are sent directly from the translation engine to your browser and aren't visible to the developers. Including them in your report makes it much easier for us to investigate.

Logs aren't saved permanently. They'll be lost if you refresh the page or start a new task, so make sure to copy or save them before doing either.

**When some content is left untranslated**

If your original subtitles contain multiple languages, the translation engine may have trouble identifying the input language. As a result, it may skip some of the content.

For example, when translating a dialogue that switches between English and Spanish into French, even "Auto-detect (Online)" may have trouble telling the two languages apart. The engine may understand one language but overlook the other, leaving some lines untranslated.

We've tried several ways to address this, but frequent switching between languages can still cause problems. Reducing the Scene gap and using "Auto-detect (Online)" together may help. Keep in mind, though, that setting the gap too low can make it harder for the engine to follow the conversation.

**A useful tip:** Engines primarily designed for English often struggle with other languages, but engines designed for other languages can usually understand English. If your subtitles contain both English and another language (e.g., English and Spanish), try setting the input language to the other language (e.g., Spanish). The engine may then be able to handle both languages more effectively.

## Service Connection Issues

Some users have reported that they can't access or use the service. These problems usually come down to one of two things:

First, network issues. You may encounter connection timeouts or be unable to reach our servers. We've done our best to reduce data usage and connection delays, but network conditions in some regions can still cause problems.

Second, ad blockers and DNS filters. Some of these tools may mistakenly block the subdomains used by our backend servers, preventing the service from working.

If you can't connect to the service, see [Can't Reach the Service? It May Be Your DNS Filter](../service-access/en.md) for troubleshooting steps.

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

If you're planning to participate in the community, take a moment to read our [Code of Conduct](../code-of-conduct/en.md).

---

## Thanks for Your Help

Thanks for taking the time to report issues and help us improve the project.

Every bug fixed and every piece of feedback helps keep the project moving forward. The work doesn't fall on the maintainers alone. Users who report problems, share their experiences, and contribute ideas all play a part in making this tool better. That's what makes an open-source project a community effort.