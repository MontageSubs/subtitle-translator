import type { Plugin } from "vite";
import { PRODUCTION_CHANNEL } from "../src/config/channelProfile";
import { DEFAULT_LOCALE } from "../src/i18n/locales.config";
import { notFoundTitle } from "../src/config/notFound";
import { renderNotFoundDocument } from "../src/render/notFoundDocument";
import type { BuildChannel } from "./channel";
import { readLocaleText } from "./i18n/locales";

function renderRecoveryScript(home: string, channelBases: readonly string[]): string {
  return `(function () {
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
      })();`;
}

function renderNotFoundPage(channel: BuildChannel): string {
  const home = channel.entries[PRODUCTION_CHANNEL];
  const channelBases = Object.values(channel.entries).sort((a, b) => b.length - a.length);
  return renderNotFoundDocument({
    title: notFoundTitle(readLocaleText(DEFAULT_LOCALE, "app.brand") ?? ""),
    homeUrl: home,
    iconUrl: `${home}favicon.svg`,
    recoveryScript: renderRecoveryScript(home, channelBases),
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
