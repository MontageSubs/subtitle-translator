# Can't Reach the Service? It May Be Your DNS Filter

Montage Subtitle Translator's backend runs on Cloudflare Workers. We use the free second-level domain `sub.qzz.io` as the entry point to the service, and firewall rules on that domain protect it from abuse. We chose a free domain because we want to keep costs as low as possible, so that this non-profit project can keep running for as long as possible.

Some DNS filters, such as lists subscribed to by AdGuard or Pi-hole like "HaGeZi's Badware Hoster Blocklist", treat `qzz.io` as a risky domain. That is understandable: anyone can register a subdomain there, and some people may host harmful content on theirs. We don't host anything like that, and our source code is open for anyone to check.

## If you were sent here

You were most likely sent to this page because your DNS is blocking `sub.qzz.io`, the domain we use to serve you. If you can, please add `sub.qzz.io` to your allowlist. You don't need to unblock all of `qzz.io`: we don't use anyone else's subdomains, and we can't speak for what others host there.

## If you don't use a DNS filter

Your network provider or another part of your connection might be blocking it. Please join our community through the links at the bottom of the page and tell us what you're seeing. Community members will be glad to help you work out what's going on, and your reports also help us understand how widespread the problem is.

We're sorry for the trouble, and thank you for your patience.
