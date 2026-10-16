# About Montage Subtitle Translator

Montage Subtitle Translator is an open-source project developed and maintained by the **MontageSubs** community. [GitHub Repository](https://github.com/MontageSubs/subtitle-translator)

## Who We Are
MontageSubs is a non-profit group of movie and TV enthusiasts and developers. We have a bit of a perfectionist streak, which means we care deeply about translation quality, precise timing, and professional typography.

Our core group focuses on high-quality, manual fansubbing. Because we obsess over the details, the process is slow and a single project can take weeks to complete. This often leaves a gap where viewers have to choose between waiting for a professional release or settling for choppy, low-quality machine translations.

## The Goal
We built this tool to provide a good middle ground. It's for anyone who needs a fast, accessible translation that is structurally sound and readable, without having to deal with complex manual setups or a paywall.

## Technical Approach
Most translation tools process subtitles line by line. This approach strips away the context and usually results in unnatural dialogue, wrong terminology, and phrasing that just feels off.

We decided to do things differently. Instead of sending fragmented lines, our system merges related cues into complete, natural sentences before they ever hit the translation engine. This lets the engine actually understand the scene. 

The hardest part was the process of putting everything back together, where we map the translated text back to the original timestamps. We spent a lot of time figuring out how to handle languages that don't use clear word boundaries, ensuring the final output stays professional and perfectly aligned regardless of the language pair.

## Language Support & Keeping it Free
The tool currently supports **over 200 languages**. To be transparent, having extensive support doesn't mean the quality is perfect for every single language pair. We're constantly refining this through community use and contributions.

People often ask why we don't just use LLMs. The short answer is simply cost. A typical subtitle file has roughly 1,500 lines. Processing that volume of data via AI for thousands of users would be way too expensive for a free, non-profit service.

To keep the tool free for everyone, we use Neural Machine Translation (NMT) paired with our scene-level processing. This gives us high usability and speed at a fraction of the cost. If AI costs drop significantly, we'll definitely integrate LLM support. In the meantime, we're always open to community members who can help with API credits or infrastructure.

## Contributions
As a community-driven project, we welcome help in any form. Whether you're submitting a PR, reporting a bug, suggesting a feature, helping with UI translation, providing API credits, or just spreading the word to promote the project, your support makes this tool better for everyone. [[Learn how to contribute]](../contribute/en.md)

## Privacy & Transparency
We believe in a clean, no-nonsense experience: no accounts, no ads, and no tracking.

Privacy is baked into the design. Your subtitles are processed in transit and never stored in our database. By ditching cookies and avoiding user tracking, we've stripped away as much personal data as possible to ensure this stays a pure, love-driven public service. [[Privacy Policy]](../privacy/en.md)

## Final Notes
This project is maintained by volunteers in their spare time. We strive for stability, but since this is a non-profit effort, we provide the service "as-is" and can't guarantee 100% uptime. [[Terms of Service]](../terms/en.md)

While this tool is efficient, it isn't a replacement for the artistry of a professional human translation. Its purpose is simple: to give you a usable, accurate, and structurally correct subtitle file in a matter of seconds.

**Powered by Love ❤️**