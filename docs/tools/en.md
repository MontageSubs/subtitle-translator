# Tools

A lot of the tools we build come from our own subtitling work. When something gets in the way, we look for a better way to do it. Sometimes that means writing a small script. Sometimes it grows into something more.

Montage Subtitle Translator started out as a few Python scripts we used to prepare subtitle previews while the manual translation was still underway. Over time, it grew into a tool that others could use, too. We share the tools below for the same reason: if it makes your work even a little easier, it's worth it.

## Quick Index

| Tool | What it does | Link |
| :--- | :--- | :--- |
| **SVG → ASS Converter** | Convert SVG graphics into ASS drawing tags | [Open tool](https://subs.js.org/svg-to-ass/) |
| **ASS → SVG Converter** | Convert ASS drawing tags into editable SVG graphics | [Open tool](https://subs.js.org/ass-to-svg/) |
| **ASS Subset & Embed** | Embed fonts and reduce subtitle file size | [Open tool](https://subs.js.org/ass-subset/) |

## Tool Details

### SVG → ASS Drawing Converter

ASS drawing tags let you create custom graphics directly in subtitles, but working with them isn't always straightforward. If you've ever tried to bring artwork from Illustrator or Inkscape into an ASS file, you've probably run into the problem. SVG and ASS describe shapes in very different ways.

This tool converts SVG graphics into ASS drawing tags, so you can work in the vector editor you're comfortable with and bring your designs straight into your subtitles. Everything runs locally in your browser, so your files stay on your machine.

**Contributors:** NickCollect, Meow P

**Links:** [Online tool](https://subs.js.org/svg-to-ass/) · [Source code](https://github.com/MontageSubs/svg-to-ass)

### ASS → SVG Drawing Converter

Sometimes you need to revisit an old typesetting job or make a quick change to a graphic buried in an existing subtitle file. Rather than recreating it from scratch, you can use this tool to convert ASS drawing tags back into editable SVG graphics.

Open the result in your preferred vector editor and pick up where you left off. The conversion runs entirely in your browser, with no uploads required.

**Contributor:** NickCollect

**Links:** [Online tool](https://subs.js.org/ass-to-svg/) · [Source code](https://github.com/MontageSubs/ass-to-svg)

### ASS Subset & Font Embedding Tool

Fonts are a big part of what makes a fansub look the way it does. But viewers don't necessarily have the same fonts installed, and a missing font can throw off carefully arranged typesetting. ASS supports font embedding, though including entire font files can make subtitles unnecessarily large.

This tool lets you embed fonts in your subtitles and subset them to include only the characters actually used. It can also convert ASS drawing tags into fonts, helping keep file sizes down while preserving the intended look. All processing happens locally in your browser. Your subtitle and font files are never uploaded to a server.

**Contributors:** Meow P, NickCollect, JULIANLEEEEE

**Links:** [Online tool](https://subs.js.org/ass-subset/) · [Source code](https://github.com/MontageSubs/ass-subset/)

## More from MontageSubs

You can find more of our work on [GitHub](https://github.com/orgs/MontageSubs/repositories) and our [official site](https://subs.js.org/), including other tools and projects we're working on.

If you have ideas, spot a bug, or want to contribute, we'd love to hear from you. We're always happy to share what we've learned and build things that make subtitling a little easier for everyone.

**Happy subtitling! ❤️**