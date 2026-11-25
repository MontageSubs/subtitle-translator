# Security Disclosure Guide

Montage Subtitle Translator is a public service designed to be accessible without registration or login, with privacy at its core. Because anyone can use it, the resources it relies on have to be protected so that they stay fairly available to everyone. We do this with our own abuse protection, which applies checks in tiers, and we take its security seriously.

We appreciate everyone who takes the time to identify potential vulnerabilities and report them responsibly. Your efforts help us keep the service safe and reliable for the entire community. This includes the abuse protection mentioned above. We designed it ourselves, and we welcome reports on where it could hold up better.

This guide explains what kinds of issues to report, how to disclose them privately, and what to expect once you've submitted a report.

## What Counts as a Security Issue

A security issue is a vulnerability that could put users or the service at risk. Weaknesses in the abuse protection are of particular interest, since it protects the resources everyone shares. Examples include:

- Gaining unauthorized access to internal systems.
- Bypassing or weakening rate limits or abuse protection, for example to use more than a fair share of the service.
- Causing legitimate users to be restricted by mistake.
- Using small requests to consume a disproportionate amount of shared resources.
- Injecting scripts or other malicious content into a page, subtitle preview, or translation result (for example, through cross-site scripting).
- Exposing sensitive information, such as API keys or access tokens.
- Exploiting a logic flaw that could have serious security consequences.

Not sure whether something qualifies? We'd rather hear about it. Please use the private reporting channel described below.

## How to Report a Vulnerability Privately

Please don't disclose security issues through GitHub Issues, GitHub Discussions, or public chat channels. Public reports can expose users and the service to risk before a fix is available.

Instead, [join our community](../community/en.md) and contact a core maintainer or community administrator through a private message. This is the fastest way to reach us. You don't need to share all the details right away. A brief message letting us know you have a security concern is enough to get the conversation started. Once they've confirmed they can discuss it privately, you can share the full report.

If chat isn't an option for you, or you prefer GitHub, you can also use [private vulnerability reporting](https://github.com/MontageSubs/subtitle-translator/security/advisories/new). Please send a short message in chat as well, so that we notice it sooner.

## What to Include in Your Report

To help us understand and investigate the issue, please include as much of the following as you can:

- **A description of the issue:** What did you find, and why do you believe it poses a security risk?
- **Steps to reproduce:** Include clear steps, along with any relevant examples. If a subtitle file or request is needed, please use content you've created yourself rather than someone else's.
- **Affected version and environment:** You can find the current version by clicking the version number in the bottom-right corner of the app. Please also include your browser and its version, if possible.
- **Potential impact:** What could an attacker do by exploiting the issue?
- **Credit preference:** Let us know how you'd like to be credited, or if you'd prefer to remain anonymous.

Don't worry if you can't provide every detail. Whatever you can share will help us investigate.

## What Happens After You Report

As a community-maintained project, we can't guarantee a fixed response time. We'll do our best to acknowledge your report, investigate the issue, and work toward a fix as soon as we can.

Once a fix is ready, we'll release it and let you know. We may also reach out if we need more information or clarification along the way.

In the meantime, please keep the vulnerability and any details that could identify or reproduce it private until the fix has been released.

## Disclosure and Credit

Once a fix is available, we may publish a brief description of the vulnerability and how it was addressed.

If you'd like to be credited, we'll be happy to acknowledge your contribution in the disclosure. We'll only do so with your permission, and we'll never publish your personal information without your consent.

## Testing Guidelines

Please keep your testing limited to what's necessary to verify the issue. We ask that you avoid any actions that could affect other users or the stability of the service.

In particular, please don't:

- Run automated scans or send large volumes of requests to the service, as this could exhaust shared resources. If testing the abuse protection seems to need volume, describe your approach and ask us first.
- Disrupt the service or interfere with other users' ability to use it.
- Use social engineering against maintainers or other community members.

If you're unsure whether a particular test is appropriate, please ask us privately before proceeding.

## Supported Versions

Security fixes are released for the latest version of the web app and service. We don't actively maintain older versions, so please make sure you're using the latest version and check whether the issue still exists before submitting a report.

## Out of Scope

The following issues are outside the scope of this disclosure process:

- Vulnerabilities in third-party services we depend on, including hosting providers, translation engines, and community platforms. Please report these issues directly to the relevant providers.
- Automated tool findings that don't demonstrate a reproducible security issue or meaningful impact.
- Denial-of-service attacks and other high-volume attacks as such. A weakness in our protections that one of them reveals is still in scope.
- Social engineering and physical attacks.

---

## Thank You

Security is a shared responsibility, and we couldn't do this without the people who care enough to help.

Whether you've found a vulnerability, helped us investigate an issue, or simply taken the time to report something that didn't look right, we genuinely appreciate your contribution.

Thank you for helping make Montage Subtitle Translator a safer and better place for everyone.