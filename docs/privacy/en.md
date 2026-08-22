# Privacy Policy

**This Privacy Policy applies exclusively to this online subtitle translation tool. While it is distinct from the overall MontageSubs community policy, it adheres to the same rigorous privacy-by-design philosophy.**

## Our Privacy Philosophy
We are a non-profit, open-source subtitle community run entirely by volunteers. We believe that privacy should be a default, not an option. Consequently, this tool is built on a Privacy-First architecture: no user accounts, no identity tracking, and no content storage.

Our objective is simple: to provide a high-quality translation service while reducing data processing to the absolute physical minimum.

## How We Handle Data

### 1. Default State: Minimal Processing & Zero Tracking
This service is maintained by non-profit community volunteers. Beyond the temporary processing required for security and stability, the service does not record or store any personally identifiable information (PII).

*   **No Tracking Technologies**: We do not use cookies to track users, nor do we utilize browser local storage (LocalStorage or IndexedDB) to save personal identifiers or monitor user behavior.
*   **No User Profiling**: We do not build browser profiles or track your usage patterns.
*   **No Content Retention**: Both source and translated texts are released from memory immediately after the request is completed. Content is relayed in real-time between the user and the provider; the system is architecturally incapable of logging or persisting your data.
*   **Non-Commercial Nature**: We strictly prohibit the use of user data for commercial purposes. By adhering to the principle of data minimization, our architecture fundamentally eliminates the possibility of selling, renting, or sharing data. We do not sell or share personal information.

### 2. Service Integrity & Anti-Abuse Mechanisms
**We believe in a frictionless user experience: this tool is completely free, requires no account, and remains captcha-free for the vast majority of users.**

To protect the service from automated abuse while maintaining this accessibility, we employ the following non-intrusive measures:

*   **Client Integrity Verification**: To distinguish human users from automated scripts, the browser is required to perform lightweight, local integrity checks. These checks are executed entirely on your device; only the final computation result is sent to the server for validation. We do not collect specific device parameters, and results are discarded immediately after verification.
*   **Stateless Session Management**: We do not use persistent cookies or accounts. All requests are managed via short-lived, random session tokens. These tokens expire quickly and are not linked to any personal identity.
*   **Local Functional Data**: We may use browser local storage to record non-sensitive functional data (e.g., a local count of successful translations). This data is used solely for reporting aggregate statistics during the handshake process and is not used to identify or track individuals.
*   **Fair-Share Rate Limiting**: We apply rate limits based on character volume rather than user identity. This allows us to ensure fair resource distribution and block large-scale abuse without needing to know who the user is.
*   **Anonymized IP Reputation**: If severe abuse is detected (e.g., massive request bursts), we record an anonymized identifier derived from the IP address for temporary isolation. This identifier is processed via a one-way hash to minimize privacy risks. This measure is used strictly for security, and records are automatically deleted 3 to 40 days after the abusive behavior ceases.
*   **Adaptive Challenge (CAPTCHA)**: In cases of extreme risk, the system may trigger a **Cloudflare Turnstile** challenge. We utilize Turnstile because of its privacy-first approach to human verification.

## Third-Party Service Processing

Our service relies on industry-standard cloud infrastructure. Data is processed through the following platforms. As these services are globally distributed, your data may be transferred to and processed in different jurisdictions, such as the United States, the United Kingdom, or the European Union.

### 1. Infrastructure Providers
*   **GitHub**: The frontend is hosted via GitHub Pages. GitHub may collect basic access logs (such as IP addresses and browser metadata). This data is not accessible to us. For more details, please refer to the [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
*   **Cloudflare**: Computation is handled by Cloudflare Workers, utilizing their Rate Limiting and Turnstile services for anti-abuse. Cloudflare may collect access logs according to its own privacy policy. This data is not accessible to us. For more details, please refer to the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).
*   **Turso**: We use Turso exclusively to maintain global statistics on successful translation counts. No personal data is recorded, and users do not interact with this service directly.

### 2. Translation Providers
To maximize user privacy and maintain service stability, we employ a **relay architecture** when interacting with all upstream translation providers:

*   **IP Masking**: Upstream providers cannot see your actual IP address; they only see the request originating from our relay server.
*   **Data Transmission**: We only forward the **source text**, the **target language**, and—in some cases—the **browser User-Agent** to prevent abuse.
*   **Transparent Passthrough**: We do not inspect, filter, or log the content of your translations; data is passed to the provider and returned to you exactly as received. Please note that because we do not store content, any service restrictions triggered by prohibited content may affect all users of the relay.

**Currently Supported Providers:**
*   **Google**: Please review the [Google Terms of Service](https://policies.google.com/terms) and [Google Privacy Policy](https://policies.google.com/privacy) to understand how they handle data.

## Compliance & User Rights

**Data Deletion & Privacy Rights**
Regarding the rights of access and erasure provided under the GDPR (EU) and CCPA/CPRA (California), this service is architected to avoid storing any personally identifiable information (PII) and does not utilize tracking technologies. As such, there are no personal profiles or accounts to delete. Any temporary, anonymous identifiers used for abuse prevention are automatically purged within 3 to 40 days. Users may terminate all temporary data processing immediately by ceasing to use the service.

**Children's Privacy**
This service is not intended for children under the age of 13 (or the applicable legal age in your jurisdiction), and we do not knowingly collect personal information from minors. If you are a parent or guardian and believe your child has provided information to us, please contact us via the channels listed below.

**Browser Privacy Signals**
Because we do not track or sell your data by default, this service does not specifically respond to "Do Not Track" (DNT) or "Global Privacy Control" (GPC) signals. Our baseline privacy standard remains the same regardless of your browser settings.

## Transparency & Contact

**Code as Proof**
We believe that trust should be based on verification, not promises. The entire [source code](https://github.com/MontageSubs/subtitle-translator) of this project is open-source and deployed directly from GitHub to production. This allows any user to audit the code and verify our commitments regarding data handling, environment validation, and anonymization.

**How to Reach Us**
If you have questions or feedback, you can reach us through the following platforms (which will handle your information according to their own privacy policies):
*   **GitHub**: Via [Issues](https://github.com/MontageSubs/subtitle-translator/issues) or [Discussions](https://github.com/MontageSubs/subtitle-translator/discussions).
*   **Community Channels**: Telegram, Discord, IRC (Libera Chat), or Matrix.

**Specific Inquiries:**
*   **Bug Reports & Feedback**: Please open a [GitHub Issue](https://github.com/MontageSubs/subtitle-translator/issues).
*   **Privacy or Media Inquiries**: Please contact the community administrators via our community channels.
*   **Security Vulnerabilities**: To ensure a responsible disclosure, please do not post vulnerabilities publicly. Instead, contact us privately via the platforms mentioned above.

**Why we don't provide a public email:**
As a small, volunteer-run open-source project, we rely on community-driven communication to prevent spam and ensure that queries are routed efficiently to the appropriate contributors. Should we establish an organizational email in the future, it will be updated here.

---

**Effective Date:** August 17, 2026

**Version History:** You may view the revision history of this policy via the [Commit History](https://github.com/MontageSubs/subtitle-translator/commits/main/docs/privacy/en.md).
