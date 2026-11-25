# Accessibility Statement

Montage Subtitle Translator exists so that more people can enjoy films and shows in a language they understand, and that only works if the tool itself is usable by as many people as possible. This page describes what we've done for accessibility, where we fall short, and how to tell us about a barrier.

## Our Commitment

We want the tool to work for everyone, whatever they use to browse and however they interact with a page. That includes people who navigate by keyboard, use a screen reader, need larger text or reduced motion, read right-to-left languages, or are on a modest device and connection.

The same idea shapes the rest of the project: no sign-up, no ads and no payment, so that neither money nor an account stands between a person and a subtitle. Subtitles are an accessibility technology in their own right. They help people who can't hear the audio, people who don't speak the original language, and people who simply follow dialogue better in text.

We treat accessibility problems as bugs, not as feature requests.

## What We Do

- **Keyboard operation.** The translator, the review window and the documentation are designed to be operated from the keyboard. Focus indicators are provided, and dialogs keep focus inside while open, hide the page behind them from assistive technology and return focus to where you were when they close.
- **Skip link.** A "Skip to main content" link is the first stop on every page.
- **Semantics and ARIA.** Pages use proper landmarks and headings. Custom controls follow standard patterns: the language pickers behave as combobox and listbox, option groups as radio groups, sections as tab lists with arrow, Home and End key support, and progress as a progress bar.
- **Announcements.** Changes that happen without a page reload, such as the detected source language or an automatic switch of the target language, are announced through live regions.
- **Editor shortcuts.** In the review window, Ctrl or Cmd with F opens find, with H opens find and replace, and with Z and Y undoes and redoes.
- **Full-text views.** The Original, Translation and Compare tabs render every cue in full, so a screen reader can read an entire file from top to bottom.
- **Plain, selectable text.** Most of the interface is ordinary text that can be easily selected, copied and read aloud. Documentation and informational pages are prerendered and also work without JavaScript. The translator itself needs JavaScript and says so when it is unavailable.
- **Interface languages.** The interface is available in many languages, and the list keeps growing. Each page sets its language and text direction, and the layout uses direction-aware styles so right-to-left languages such as Arabic, Persian, Hebrew and Urdu mirror correctly.
- **Motion and colour.** Animations are reduced when your system asks for reduced motion, and the light or dark appearance follows your system setting.
- **Clear errors.** Problems with a file or a translation are explained in plain language next to the thing that caused them, with a suggestion for what to do next.

## Subtitles as Accessibility

The tool is built around subtitle work, and a few options matter for accessibility specifically:

- **SDH and hearing-impaired captions.** Sound descriptions and speaker labels are useful to people who can't hear the audio, but they tend to confuse machine translation. The option to remove them is switched on by default for supported languages. If you rely on those descriptions, turn off **Remove SDH / hearing-impaired captions** before translating.
- **Bilingual output.** Showing the original and the translation together helps language learners and anyone who wants to check the translation against the dialogue.
- **Readability checks.** The review window flags lines that are too long and reading speeds that are too fast, using thresholds that differ by language, because hard-to-read subtitles are an access problem too.
- **Proper typography.** Punctuation, spacing, line breaking and bidirectional text handling follow each language's conventions, which matters for readers using scripts such as Arabic or Hebrew.

## Supported Environments

We build with standard HTML, CSS, JavaScript and WAI-ARIA, and we aim for current versions of the major browsers on desktop and mobile: Chrome, Edge, Firefox and Safari. Assistive technology that follows web standards should work, including screen readers, switch devices, voice control and browser zoom or text-size settings.

Some optional features, such as on-device name recognition, depend on the browser's capabilities. The tool works fully without them.

## Known Limitations

We haven't had the site audited by a third party, and we don't claim conformance with WCAG. We use WCAG 2.2 level AA as our reference and work towards it. These are the gaps we know about:

- **High contrast modes.** We haven't added dedicated styles for Windows forced-colors mode or for the contrast preference, so the appearance in those modes depends on your browser.
- **Third-party components.** The human verification step is provided by Cloudflare, and the discussion page embeds GitHub Discussions through giscus. We can't control their accessibility, but we're glad to help if one blocks you. The service status page is a separate site with its own limitations.
- **Documentation languages.** Documents are written in English, Simplified Chinese and Traditional Chinese. In other interface languages they are shown in English.
- **Community translations.** Interface translations come from volunteers, so wording and quality can vary between languages.
- **Machine translation.** Output can contain mistakes, and the original subtitle timing or styling may not suit every player. Please review before you rely on the result.

## Report a Barrier

If something in the tool is hard or impossible to use, we want to know, even if you're not sure it counts as an accessibility problem.

- **Public report:** open a [GitHub issue](https://github.com/MontageSubs/subtitle-translator/issues) and describe what you were trying to do, what happened, and which browser and assistive technology you were using.
- **Private message:** reach a maintainer through [Join the Community](../community/en.md) if you'd rather not post publicly.
- **Pull requests:** fixes are very welcome. See [How to Contribute](../contribute/en.md).

The project is run by volunteers, so we can't promise a response time. We do read every report, and accessibility fixes go to the front of the queue. For other bugs and ideas, see [Feedback & Suggestions](../feedback/en.md).
