import type { Plugin } from "vite";
import { PRODUCTION_CHANNEL } from "../src/config/channelProfile";
import type { BuildChannel } from "./channel";

const PAGE_STYLE = [
  ":root{--bg:#faf9f6;--panel:#ffffff;--text:#1c1b19;--line:#e4e0d6;--accent:#b5482f}",
  "@media(prefers-color-scheme:dark){:root{--bg:#16151a;--panel:#1e1d23;--text:#ece9e2;--line:#322f36;--accent:#e18a63}}",
  'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
  ".language-gate{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;text-align:center;background:var(--bg)}",
  ".language-gate h1{font-size:2.5rem;font-weight:700;margin:0 0 8px;letter-spacing:-0.02em;color:var(--text)}",
  ".language-gate p{font-size:1rem;margin:0 0 24px;opacity:0.8;color:var(--text)}",
  ".language-options{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;max-width:740px;margin:0 auto}",
  ".language-options a{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:140px;padding:10px 20px;border-radius:9999px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-decoration:none;font-size:0.95rem;font-weight:500;white-space:nowrap;transition:border-color .15s ease,color .15s ease}",
  ".language-options a:hover,.language-options a:focus{border-color:var(--accent);color:var(--accent)}",
].join("\n        ");

export function renderNotFoundPage(channel: BuildChannel): string {
  const home = channel.entries[PRODUCTION_CHANNEL];
  const channelBases = Object.values(channel.entries).sort((a, b) => b.length - a.length);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <link rel="icon" type="image/svg+xml" href="${home}favicon.svg" />
    <title>404 - Page Not Found</title>
    <script>
      (function () {
        var home = ${JSON.stringify(home)};
        var channelBases = ${JSON.stringify(channelBases)};
        var l = window.location;
        if (l.search.charAt(1) === "/") {
          l.replace(home);
          return;
        }
        var base = channelBases.filter(function (candidate) { return l.pathname.indexOf(candidate) === 0; })[0] || home;
        var keep = base.split("/").filter(Boolean).length;
        l.replace(
          l.protocol + "//" + l.hostname + (l.port ? ":" + l.port : "") +
          l.pathname.split("/").slice(0, 1 + keep).join("/") + "/?/" +
          l.pathname.slice(1).split("/").slice(keep).join("/").replace(/&/g, "~and~") +
          (l.search ? "&" + l.search.slice(1).replace(/&/g, "~and~") : "") +
          l.hash
        );
      })();
    </script>
    <noscript>
      <meta http-equiv="refresh" content="3;url=${home}" />
      <style>
        ${PAGE_STYLE}
      </style>
    </noscript>
  </head>
  <body>
    <noscript>
      <div class="language-gate">
        <h1>404</h1>
        <p>Page Not Found</p>
        <div class="language-options">
          <a href="${home}">Select Language</a>
        </div>
      </div>
    </noscript>
  </body>
</html>
`;
}

export function notFoundPagePlugin(channel: BuildChannel): Plugin {
  return {
    name: "not-found-page",
    apply: "build",
    generateBundle() {
      if (channel.id === PRODUCTION_CHANNEL) this.emitFile({ type: "asset", fileName: "404.html", source: renderNotFoundPage(channel) });
    },
  };
}
