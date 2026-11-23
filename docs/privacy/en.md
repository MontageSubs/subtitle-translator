# Privacy Policy

This privacy policy applies to **Montage Subtitle Translator**. It is not the overall privacy policy of the MontageSubs community, but we follow the same core principles: **privacy by design, openness and transparency**.

## The Privacy Philosophy Behind This Tool

We are an open source subtitle community driven by love. This translation tool is maintained by community contributors who volunteer their time, skills, and resources, and it exists to serve everyone who loves subtitles.

We treat "privacy by design" as the primary premise of this tool: **no accounts, no user profiling, no retention of subtitle content**. Our goal is to protect your privacy to the greatest extent possible while still providing high-quality translation.

## How We Handle Your Data

### 1. Default State: We Only Handle What Translation Requires

We are committed to providing the highest standard of privacy protection to every user. **Except where the automated protection mechanisms described below flag anomalous activity, we will not leave any record associated with you in our database.**

In practice, this means:

- **No registration or login required**: the service is login-free and registration-free. We do not collect your email address, name, or similar information.
- **No user profiling**: we are a non-profit organization and have no incentive to build user profiles or analyze behavioral data for profit.
- **No commercial advertising**: any form of commercial advertising introduces privacy risk. We do not integrate any form of commercial advertising, eliminating the privacy risks that come with ad tracking at the source.
- **No cookies**: a cookie is a small piece of persistent data stored in your browser, commonly used to maintain login state or perform cross-site tracking. Our translation service does not rely on cookies, because our commitments to login-free access, no profiling, and no advertising already make them unnecessary.
- **Subtitles are not retained**: your subtitles pass through our server and are forwarded to the upstream service provider. They are **never written to our database**; once processing is complete, they are returned to you. We only know how many translations were completed today, not what was translated.
- **You control your subtitle history**: your translation history is stored exclusively in your browser's local storage (via IndexedDB and localStorage) and is not synced to the cloud or our servers. You can clear these records at any time.

**Under the commitments above, only a minimal amount of necessary information passes through our server:**

- **The subtitles you translate**: we do not retain them. Our server forwards them to the upstream service provider and returns them to you once processing is complete.
- **An anti-abuse identifier**: this is saved to the database only when the system detects anomalous activity, to help keep the service available (see below).

### 2. Automated Protection That Keeps This Service Available

During normal use, our database does not retain records associated with your visits, your IP address, or any other information that could identify you.

Only when our anti-abuse system detects anomalous activity does the server save an **anti-abuse identifier** associated with the suspicious traffic in the database. The identifier is retained for no more than 40 days after the last anomalous activity and is used to apply necessary rate limits or automatically block traffic. To minimize the data retained, the identifier is derived from the IP address and a string; the database does not store the IP address in plaintext. Even if the database were breached, it would be very difficult to recover your IP address from the identifier. The identifier is never made public and is automatically deleted by the end of that period.

In short, as long as the anti-abuse system does not flag your visit as anomalous, your access records will not be stored in our database.

### 3. Technical Logging

The translation service runs on a Cloudflare Worker. Its logging policy is as follows:

- **Translation service**: it does not record detailed request logs by default. Only when troubleshooting a system error or responding to malicious abuse that cannot otherwise be prevented do we temporarily enable observability logging. During that period, logs may include technical metadata such as IP addresses and browser information. They are accessible only to authorized maintainers, are not disclosed externally, and are turned off as soon as the issue is resolved.
- **Translation logs**: logs generated during subtitle translation are stored only in your browser, where only you can view them, and are kept temporarily. If a translation error needs to be investigated, we may ask you to share the relevant log. Since it may contain text from your subtitles, we do not have access to it by default. We may ask to see it only when helping you resolve a translation issue, and you decide whether to share it.

## How Third Parties Handle Your Data

This tool runs on the following platforms or uses the following third-party services, each of which has its own logs and policies. These platforms and services operate around the world, so data may be transferred to the United States, the United Kingdom, the European Union, and other regions.

### 1. Infrastructure Platforms

- **GitHub**: hosts the web page and deploys the code. [Privacy Policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- **Cloudflare**: runs the translation relay; provides anti-abuse detection and rate limiting, CDN services for some parts of the tool, some static asset hosting, status information, and human verification; and stores anti-abuse identifiers for anomalous access only in a database. These identifiers are not shared with any other platform. [Privacy Policy](https://www.cloudflare.com/privacypolicy/)
- **Turso**: stores only counts of translations and error types, with no personal information.

### 2. Translation Service Providers

We use a relay architecture: your subtitle content is processed in your browser and on our server before being forwarded to service providers. They receive requests from our server, not your IP address. We forward the text to be translated, your glossary, context notes, and other related information to the following providers. We may also forward your browser type (User-Agent) to help ensure service availability.

- **Supported services and their privacy policies**: [Google](https://policies.google.com/privacy), [DeepL](https://www.deepl.com/privacy), [Microsoft](https://www.microsoft.com/en-us/privacy/privacystatement).
- **Important risk notice**: once subtitle content is handed to a provider, how it is handled is governed by that provider's own policy. Some providers may use submitted data to improve or train their models. **Please do not submit subtitle content containing sensitive personal information, trade secrets, or highly private material**, because once submitted, that data is beyond our control.

### 3. Embedded Discussion Forum

We use [giscus](https://giscus.app/) for the discussion forum in the tool. According to its website, giscus says it is an open source project that does not track users or serve ads, is free to use, and does not require a database. Discussion content is stored in GitHub Discussions and is subject to GitHub's privacy policy. The giscus.app site is hosted on Vercel, so Vercel may also be one of the third-party service providers involved when you use the discussion forum. See [Vercel's Privacy Policy](https://vercel.com/legal/privacy-policy).

### 4. Browser-Based Local Models

To help improve translation quality, we use some open source models that run locally in your browser. Model processing takes place in your browser and does not send data to any server. To help maintain service quality and stability, keep tested, compatible versions available, and reduce the risk of third-party tracking, we host the models on our own static asset server, which runs on Cloudflare.

If our static asset server is unavailable, your browser may connect directly to upstream providers to download or update models. These currently include [Hugging Face](https://huggingface.co/privacy) and GitHub. Please see their respective privacy policies for details.

## Your Rights and Legal Compliance

- **Right of access and deletion**: since we do not create user accounts, no personal profile exists. If you believe your access was mistakenly flagged as anomalous and an "anti-abuse identifier" was generated, you may provide your IP address through the contact channels below, and we will delete it immediately.
- **Control over local data**: you can delete locally stored translation records at any time through your browser settings or the history page within the tool.
- **Protection of minors**: this service is not directed at children under the age of 13, or the higher age threshold required by applicable local law. If a parent or guardian discovers that a child has submitted personal information, please contact us promptly through the channels below.
- **Regarding tracking signals**: because we apply the highest privacy standard to all users at all times, "Do Not Track" (DNT) and Global Privacy Control (GPC) signals do not change how the service behaves, since we do not track you to begin with.

## Transparency

Trust should be verifiable, not merely promised. In keeping with our commitment to transparency, the [source code](https://github.com/MontageSubs/subtitle-translator) of this tool is fully open and is deployed directly through GitHub Actions. You can review the code to verify our privacy design and confirm that our commitments are genuine.

## Contact

- **Issue reports**: please file a [GitHub issue](https://github.com/MontageSubs/subtitle-translator/issues).
- **Privacy contact**: for general questions, please file a GitHub issue; for matters involving sensitive information such as your IP address, please message a maintainer privately through one of our community platforms. By doing so, you consent to our use of that information to process your request, such as deleting the corresponding identifier.

Community platforms (see [Join the Community](../community/en.md)): [GitHub Discussions](https://github.com/MontageSubs/subtitle-translator/discussions), Telegram, Discord, IRC (Libera Chat), Matrix.

**Why is there no public email address?**  
As a small open source project maintained by volunteers, we prefer direct communication within our community platforms. This avoids spam while allowing issues to be efficiently routed to the right contributor. If we set up an organizational email address in the future, this section will be updated.

---

**Effective date:** November 20, 2026

**Version history:** [View revision history](https://github.com/MontageSubs/subtitle-translator/commits/main/docs/privacy/en.md)

**Governing version:** The authoritative versions of this policy are the English and Chinese texts. Translations into any other language are provided for reference only.