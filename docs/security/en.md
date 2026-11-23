# Security Disclosure Guide

Montage Subtitle Translator handles subtitle files from many people, so we take security seriously. We're grateful to anyone who takes the time to find a problem and tell us about it responsibly. This guide explains what to report, how to reach us privately, and what to expect afterward.

## What Counts as a Security Issue

A security issue is a flaw that could be used to harm users or the service, for example:

- Gaining access to other people's data or to the service's internal systems.
- Bypassing authentication, rate limits, or abuse protection in a way that could harm the shared service.
- Injecting script or other content into a page, the subtitle preview, or a translation result (for example, cross-site scripting).
- Exposing secrets such as keys or tokens.
- A logic flaw with serious consequences.

If you're not sure whether something counts, report it anyway through the private route below.

## Reporting a Vulnerability Privately

Please don't report security issues in GitHub Issues, GitHub Discussions, or public chat channels. Until a fix is ready, anyone could read the details.

Instead, [join the community](../community/en.md) and send a private message to a core maintainer or community administrator. A short note saying you have a security report is enough to start. Share the details once they confirm they can receive them privately.

## What to Include in Your Report

- What you found, and why you believe it's a security issue.
- Steps to reproduce it. If a subtitle file or request is needed, use one you made yourself rather than someone else's content.
- The affected version (click the version number in the bottom-right corner to check) and your browser.
- Your assessment of the impact.
- How you'd like to be credited, or whether you'd prefer to stay anonymous.

## What Happens Next

This project is maintained by volunteers, so we can't promise a fixed response time. We'll do our best to acknowledge your report, investigate, fix the problem, release the fix, and let you know. We may ask follow-up questions along the way. Please keep the details confidential until the fix is released.

## Disclosure and Credit

After a fix is released, we may publish a short description of the problem. With your permission, we'll credit you there. We never publish personal information without consent.

## Testing Guidelines

Please keep your testing to what's needed to confirm the problem. Please don't:

- Access, change, or delete other people's data.
- Run automated scans or high-volume requests against our service, which could exhaust shared resources.
- Disrupt the service for other users.
- Use social engineering against maintainers or community members.

If you're unsure whether a test is acceptable, ask first, privately.

## Supported Versions

Fixes are released in the latest version of the web app and service. We don't maintain older versions, so please confirm the problem in the latest version before reporting it.

## Out of Scope

- Problems in third-party services we rely on, such as hosting, translation engines, and community platforms. Please report those to the provider.
- Reports from automated tools that don't demonstrate a real impact.
- Denial-of-service and high-volume attacks.
- Social engineering and physical attacks.
