# About Montage Subtitle Translator

Montage Subtitle Translator is an [open-source project](https://github.com/MontageSubs/subtitle-translator) developed and maintained by the **MontageSubs** community.

## Who We Are
MontageSubs is a community of movie and TV enthusiasts and developers. We have a bit of a perfectionist streak—we care deeply about translation quality, precise timing, and professional typography.

Our core group focuses on high-quality, manual fansubbing. Because we obsess over the details, our process is slow; a single project can take weeks to complete. This often leaves a gap where viewers must choose between waiting for a professional release or settling for choppy, low-quality machine translations.

## The Goal
We built this tool to provide a better middle ground. It's for anyone who needs fast, accessible translations with readable, well-structured subtitles, without the headache of complex manual setups or a paywall.

## Technical Approach
Most translation tools process subtitles line by line. This approach strips away the context, usually resulting in unnatural dialogue, wrong terminology, and phrasing that just feels off.

We decided to do things differently. Instead of sending fragmented lines, our system merges related cues into complete, natural sentences before they ever hit the translation engine. This allows the engine to actually understand the scene. 

The real challenge was the reconstruction—mapping the translated text back to the original timestamps. We spent significant time solving this for languages without clear word boundaries, ensuring that original timing and structure remain intact across different language pairs.

## Language Support & Keeping it Free
The tool currently supports **over 200 languages**. To be honest, extensive support doesn't always mean perfect quality for every single pair, but we're constantly refining this through community use and contributions.

People often ask why we don't just use LLMs (AI). The short answer: cost. A typical subtitle file has roughly 1,500 lines; processing that volume for thousands of users would be far too expensive for a free, community-driven service.

To keep the tool free for everyone, we use Neural Machine Translation (NMT) paired with our scene-level processing. This delivers high usability and speed at a fraction of the cost. If AI costs drop significantly, we'd love to integrate LLM support. In the meantime, we're always open to community members who can help with API credits or infrastructure.

## Contributions
As a community-driven project, we welcome help in any form. Whether you're submitting a PR, reporting a bug, or suggesting a feature—or simply helping with UI translations and spreading the word—your support makes this tool better for everyone. [[Learn how to contribute]](../contribute/en.md)

## Privacy & Transparency
We believe in a clean, no-nonsense experience: no accounts, no ads, and no user profiling.

Privacy is baked into the design. Your subtitles are processed in transit and never stored in our database. By ditching cookies and avoiding user tracking, we've stripped away as much personal data as possible to keep this a pure, love-driven public service. [[Privacy Policy]](../privacy/en.md)

## Final Notes
This project is maintained by volunteers in their spare time. We strive for stability, but as a non-profit effort, we provide the service "as-is" and can't guarantee 100% uptime. [[Terms of Service]](../terms/en.md)

While this tool is efficient, it isn't a replacement for the artistry of professional human translation. Its purpose is simple: to provide readable, well-structured subtitles in a matter of seconds, breaking down language barriers for films and shows everywhere.

---

<div align="center">

Powered by Love ❤️ MontageSubs Community

</div>