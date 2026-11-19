import type { Plugin } from "vite";
import { PRODUCTION_CHANNEL } from "../src/config/channelProfile";
import { DEFAULT_LOCALE } from "../src/i18n/locales.config";
import { renderNotFoundDocument } from "../src/render/notFoundDocument";
import type { BuildChannel } from "./channel";
import { readLocaleText } from "./i18n/locales";

function renderRecoveryScript(home: string): string {
  return `(function () {
        var home = ${JSON.stringify(home)};
        var l = window.location;
        function restore(base) {
          var keep = base.split("/").filter(Boolean).length;
          l.replace(
            l.protocol + "//" + l.hostname + (l.port ? ":" + l.port : "") +
            l.pathname.split("/").slice(0, 1 + keep).join("/") + "/?/" +
            l.pathname.slice(1).split("/").slice(keep).join("/").replace(/&/g, "~and~") +
            (l.search ? "&" + l.search.slice(1).replace(/&/g, "~and~") : "") +
            l.hash
          );
        }
        if (l.search.charAt(1) === "/" || l.pathname.indexOf(home) !== 0) {
          l.replace(home);
          return;
        }
        var segments = l.pathname.slice(home.length).split("/");
        var ancestors = [];
        for (var depth = segments.length - 1; depth > 0; depth--) ancestors.push(home + segments.slice(0, depth).join("/") + "/");
        var probes = ancestors.map(function (base) {
          return fetch(base + "build.json", { method: "HEAD", cache: "no-store" }).then(function (response) { return response.ok ? base : ""; }, function () { return ""; });
        });
        Promise.all(probes).then(function (found) {
          restore(found.filter(Boolean)[0] || home);
        }, function () { restore(home); });
      })();`;
}

function renderNotFoundPage(channel: BuildChannel): string {
  const home = channel.entries[PRODUCTION_CHANNEL];
  return renderNotFoundDocument({
    title: readLocaleText(DEFAULT_LOCALE, "app.brand") ?? "",
    homeUrl: home,
    iconUrl: `${home}icons/favicon.svg`,
    recoveryScript: renderRecoveryScript(home),
  });
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
