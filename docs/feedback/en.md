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

Awkward phrasing, inaccurate word choices, and grammatical errors often depend on the translation engine and the context it receives. A few things worth trying:

- **Switch engines** to see if another handles the language or style better.
- **Use the glossary** to specify how particular names and terms should be translated.
- **Provide context** about the story or character relationships, if supported by the engine.
- **Adjust scene boundaries** to change how much surrounding dialogue the engine receives. This can help improve coherence.

**2. Something went wrong with the translation**

If the original text appears in the translation, punctuation is misplaced, or some lines remain untranslated, the problem may lie in our code.

We combine related subtitle lines into complete sentences before translation, then split the translated text back into the original subtitle segments. Some sentence structures and subtitle formats can cause problems during this process.

We don't store subtitle files or translated content on our servers, so we'll need the original subtitle file to reproduce the problem. When reporting one, include:

- The original subtitle file.
- The target language.
- A screenshot of your interface settings.
- The translation log below the download button.

If possible, point out the affected lines and describe what you expected to see.

## Timeline Issues

Timestamps are never sent to the translation engine. Our code restores them after translation, though errors in this process can still occur in rare cases.

If the timestamps in the translated file differ from those in the original, let us know and include the original subtitle file.

## UI & Functionality

If something isn't working as expected or a button isn't responding, let us know.

The subtitle preview is a small editor that runs in your browser, handling subtitle format conversions and compatibility in real time. Make sure you're using the latest version before reporting a problem: click the version number in the bottom-right corner and wait a few seconds for the update check. The issue may already have been fixed in a newer version. If it persists, include your version number in the report.

## Security Vulnerabilities

If you discover a security vulnerability or a serious logic flaw, contact us privately rather than posting it on GitHub Issues or in public community channels. This gives us a chance to investigate and fix the problem before details become public. See our [Security Disclosure Guide] for details.

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