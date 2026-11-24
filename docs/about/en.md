# About Montage Subtitle Translator

Montage Subtitle Translator is a free, open-source subtitle translator from the MontageSubs community. It translates SRT, VTT and ASS files between more than 200 languages, can pull subtitles straight out of MKV videos, and needs no sign-up, shows no ads and doesn't track you.

## Who We Are

MontageSubs is a community of film and TV fans, subtitlers and developers. We watch a lot, and we care about subtitles more than most people do: the wording, the timing, how the text sits on screen.

Our core group still makes fansubs entirely by hand, and we're perfectionists about it. That obsession is slow, and a single title can take weeks.

So plenty of good films and shows never get our treatment. Viewers end up choosing between waiting and putting up with lifeless machine subtitles, and we don't like either option. We'd rather good work didn't get forgotten behind a language barrier.

## Why We Built It

We wanted a better middle ground: a quick, simple way for anyone to get a readable, well-structured translation when they can't wait, don't want a complicated setup and shouldn't have to hit a paywall.

It began as a few scripts for preparing drafts alongside our own manual work. Because it grew out of real subtitling practice, it picked up features subtitlers actually ask for, like reading subtitles out of videos, cleaning up hearing-impaired captions and checking reading speed. Once it proved useful, we cleaned it up and opened it to everyone.

It's for the viewer who needs a translation tonight, the fan who wants a first draft to polish, and anyone who simply wants to understand what's on screen.

## A Different Approach

Most tools hand subtitles to a translation engine one line at a time and take whatever comes back. Sentences get cut off halfway, context disappears, and the result is stiff, inconsistent or just wrong.

We tried something else. Instead of sending fragments, we merge related cues into complete, natural sentences, group them by scene and send each scene to the engine as one continuous passage, so it can follow the conversation the way a viewer does.

The hard part is the way back: fitting the translated sentences onto the original timestamps. We spent a long time on it, especially for languages without clear word boundaries such as Chinese and Japanese, so that timing and structure survive across language pairs.

## What You Get

- **Scene-level context.** The engine reads a whole scene instead of isolated lines, and a slider lets you choose how finely scenes are cut.
- **A glossary that sticks.** The names and terms you set are enforced in the result, even with engines that ignore glossaries.
- **Name detection on your device.** For language pairs where names change, such as English to Japanese, a small model in your browser finds the names and builds the glossary for you.
- **Restoration that holds up.** Translated sentences are aligned back onto the original cues, and anything an engine garbles along the way is detected and repaired automatically.
- **Made for subtitle work.** Read subtitles straight out of MKV videos, remove SDH lines if you want, leave lyrics untranslated, and export bilingual or styled ASS files.
- **Check before you download.** A built-in editor with side-by-side comparison flags missing lines, leftover source text, long lines and fast reading speeds.
- **Your data stays with you.** History and downloaded models live in your browser, and the interface comes in many languages.

If you'd like to know how the pieces fit together, see [Translation Engines and Model Support](../model-access/en.md).

## Free for Everyone

The tool supports over 200 languages. Wide support doesn't mean every pair is perfect, and some special cases still need work, so we keep refining it with your use and feedback.

People often ask why we don't use an LLM. LLMs do translate better in general, but a typical subtitle file runs to around 1,500 lines, and running that for every user would cost far too much for a free community service, for a gain in quality that doesn't match the bill.

So we put our effort into NMT (neural machine translation). Today's engines have absorbed a lot of what LLMs do well, but they still translate line by line and never see the scene. We built the rest ourselves: scene-level context, a glossary engines can't ignore, name detection, restoration onto the original timing and a pipeline that repairs its own mistakes. That work is most of this project's code, and it's how we get more out of an engine than a plain translation call would. If LLM costs come down enough, we'd love to add them, and offers of API credits or other resources are very welcome. [How to Contribute](../contribute/en.md) has the details.

## Privacy & Transparency

No accounts, no ads and no profiling. We don't use cookies, and your subtitles pass through our server on their way to the translation engine and are never stored. We'd like this to stay a clean, love-driven public service.

You don't have to take our word for it. The source code is fully open and the site is deployed straight from GitHub Actions, so anyone can check that it does what we say. The [Privacy Policy](../privacy/en.md) has the details.

## Good to Know

The project is maintained by volunteers in their spare time. We do our best to keep it stable, but as a non-profit effort we can't promise 100% uptime. Maintenance, changes at upstream providers or a maintainer running low on energy can all interrupt the service for a while, and we ask for your patience. The [Terms of Service](../terms/en.md) cover the details.

To be clear about what this is: it can't replace the craft of a human translator. What it can do is give you a complete, well-structured and as-accurate-as-we-can-make-it subtitle file in a matter of seconds, so that more people can enjoy the films and shows they love in a language they understand. Machine translation still makes mistakes, and complex ASS typesetting may need a hand, so read the result before you share it.

## Get Involved

This is a community project, and help in any form is welcome: code, bug reports, ideas, interface translations, everyday community chores, API credits, or simply telling a friend. You don't have to contribute anything to say hello.

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
