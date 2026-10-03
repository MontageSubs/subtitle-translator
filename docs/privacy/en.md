# Privacy Policy

This privacy policy applies to **Montage Subtitle Translator**. It is not the overall privacy policy of the MontageSubs community, but we follow the same core principles: **privacy by design, openness and transparency**.

## The Privacy Philosophy Behind This Tool

We are an open source subtitle community driven by love. This translation tool is maintained by community contributors who volunteer their time, skills, and resources, and it exists to serve everyone who loves subtitles.

We treat "privacy by design" as the primary premise of this tool: **no accounts, no user profiling, no retention of subtitle content**. Our goal is to protect your privacy to the greatest extent possible while still providing high-quality translation.

## How We Handle Your Data

### 1. Default State: We Only Handle What Translation Requires

We are committed to providing the highest standard of privacy protection to every user. **Except where it is flagged by the automated protection mechanisms described below due to anomalous activity, we will not leave any record associated with you in our database.**

In practice, this means:

- **No registration or login required**: the service is login-free and registration-free. We do not collect your email address, name, or similar information.
- **No user profiling**: we are a non-profit organization and have no incentive to build user profiles or analyze behavioral data for profit.
- **No commercial advertising**: any form of commercial advertising introduces privacy risk. We do not integrate any form of commercial advertising, eliminating the privacy risks that come with ad tracking at the source.
- **No cookies**: a cookie is a small piece of persistent data stored in your browser, commonly used to maintain login state or perform cross-site tracking. Our translation service does not rely on cookies, because our commitments to login-free access, no profiling, and no advertising already make them unnecessary.
- **Subtitles are not retained**: your subtitles pass through our server and are forwarded to the upstream service provider. They are **never written to our database**; once processing is complete, they are returned to you. We only know how many translations were completed today, not what was translated.
- **You control your subtitle history**: your translation history is stored only in your browser's local storage (based on IndexedDB and localStorage technologies) and is not synced to the cloud by the tool. These records are visible only to you, we cannot access them, and you can clear them at any time.

**Under the commitments above, only a minimal amount of necessary information passes through our server:**
- **The subtitles you translate**: but we do not retain them. They are forwarded by our server to the upstream service provider and returned to you once processing is complete.
- **Browser type (User-Agent)**: this may be forwarded to the translation service provider to help ensure service availability.
- **A defensive identifier**: this is only saved to the database when the system detects an anomalous request, to help keep the service available (see below).

### 2. Automated Protection That Keeps This Service Available

To keep this service free and available to everyone who loves subtitles, we need to prevent it from being maliciously abused.

Most services identify and restrict users by directly using their IP address. We consider this itself a privacy risk, so we do not do this. Our database does not store the IP address itself in plaintext. Instead, it stores an **anti-abuse identifier** computed from the IP address together with a string. This identifier is very difficult to reverse into the original IP; even if the database were breached, it would be very difficult for anyone to recover your real address from it.

To minimize privacy impact, we have built a trigger-based protection process: when you initiate a translation request, your browser first completes a lightweight mathematical check locally. **If this check passes, our database does not store any anti-abuse identifier, nor does it leave any record associated with you.** Only when the system detects an abnormal request frequency, or when the initial check is repeatedly invoked in a way consistent with malicious activity, will it trigger human verification provided by Cloudflare Turnstile.

**Only when human verification is triggered, or a request is judged to be anomalous, does the system generate an anti-abuse identifier and record it in the database**, used to carry out necessary rate limiting or automatic blocking. This identifier is not made public, and is automatically deleted no later than 40 days after the last anomalous activity associated with it.

**In short: as long as your conduct is not determined to be malicious abuse, your access record will not be stored in our database.**

### 3. The Status of Technical Logging

This tool consists of two independent Cloudflare Workers. Their logging policies are as follows:

- **The translation service**: does not record detailed request logs by default. Only when troubleshooting a system error, or responding to malicious abuse that cannot otherwise be prevented, do we temporarily enable observability logging (which may include technical metadata such as IP address and browser information during that period). Such logs are accessible only to authorized maintainers, are not disclosed externally, and are immediately turned off once the issue is resolved.
- **The status service**: this service is used only to internally generate status data and sync it to a static page. As a non-public function, visitors cannot interact with it directly, so its logs remain permanently enabled solely to monitor anomalous probing activity directed at the administrative endpoint, and it does not record any visitor information.

## How Third Parties Handle Your Data

This tool runs on the following platforms, each of which has its own logs and policies. Please note that these platforms are distributed globally, and data may be transferred to the United States, the United Kingdom, the European Union, and other regions.

### 1. Infrastructure Platforms

- **GitHub**: hosts the web page and deploys the code. [Privacy Policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- **Cloudflare**: runs the translation relay, and provides rate limiting, partial CDN services, status information, and human verification. It stores the anti-abuse identifier (for anomalous access only) in a D1 database (this identifier is not passed on to any other platform). [Privacy Policy](https://www.cloudflare.com/privacypolicy/)
- **Turso**: stores only translation counts and error type counters, and contains no personal information.

### 2. Translation Service Providers

We use a relay architecture: your subtitles are forwarded by our server to the service provider, who only sees the request from our server and does not see your IP address. We forward subtitles, the target language, your glossary, and your context notes to the following providers as-is:

- **Supported services and their privacy policies**: [Google](https://policies.google.com/privacy), [DeepL](https://www.deepl.com/privacy), [Microsoft](https://privacy.microsoft.com/privacystatement).
- **Important risk notice**: once subtitle content is handed to a provider, how it is handled is governed by that provider's own policy. Some providers may use submitted data to improve or train their models. **Please do not submit subtitle content containing sensitive personal information, trade secrets, or highly private material**, because once submitted, that data is beyond our control.

## Your Rights and Legal Compliance

- **Right of access and deletion**: since we do not create user accounts, no personal profile exists. If you believe your access was mistakenly flagged as anomalous and an "anti-abuse identifier" was generated, you may provide your IP address through the contact channels below, and we will delete it immediately.
- **Control over local data**: you can delete locally stored translation records at any time through your browser settings or the history page within the tool.
- **Protection of minors**: this service is not directed at children under the age of 13 (or a higher age of legal majority where applicable). If a parent or guardian discovers that a child has submitted personal information, please contact us promptly through the channels below.
- **Regarding tracking signals**: because we apply the highest privacy standard to all users at all times, "Do Not Track" (DNT) and Global Privacy Control (GPC) signals do not change how the service behaves, since we do not track you to begin with.

## Transparency

Trust should be verifiable, not merely promised: because we stand behind transparency, the [source code](https://github.com/MontageSubs/subtitle-translator) of this tool is fully open and is deployed directly through GitHub Actions. You can verify our privacy design for yourself through the code and confirm that our commitments are genuine and reliable.

## Contact

- **Issue reports**: please file a [GitHub issue](https://github.com/MontageSubs/subtitle-translator/issues).
- **Privacy contact**: for general questions, please file a GitHub issue; for matters involving sensitive information such as your IP address, please message a maintainer privately through one of our community platforms, which indicates your consent for us to use that information to process your request (for example, deleting the corresponding identifier).

Community platforms: [GitHub Discussions](https://github.com/MontageSubs/subtitle-translator/discussions), Telegram, Discord, IRC (Libera Chat), Matrix.

**Why is there no public email address?**
As a small open source project maintained by volunteers, we prefer direct communication within our community platforms. This avoids spam while allowing issues to be efficiently routed to the right contributor. If we set up an organizational email address in the future, this section will be updated.

---

**Effective date:** October 3, 2026

**Version history:** [View revision history](https://github.com/MontageSubs/subtitle-translator/commits/main/docs/privacy/zh-Hans.md)

**Governing version:** The authoritative versions of this policy are the English and Chinese texts. Translations into any other language are provided for reference only.
