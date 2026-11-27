import { SHELL_ASSETS_MARKER } from "../shellAssets";

const guardedGate = (body: string): string => `<script>
      (function () {
        var root = document.documentElement;
        root.setAttribute("data-js", "");
        try {
${body}
        } catch (error) {
          root.removeAttribute("data-js");
        }
      })();
    </script>`;

const SHELL_LOADER = `          function loadShell() {
            var shellAssets = ${SHELL_ASSETS_MARKER};
            var head = document.head;
            var pending = shellAssets.stylesheets.length + 1;
            function settle() {
              if (--pending) return;
              shellAssets.modules.forEach(function (src) {
                var script = document.createElement("script");
                script.type = "module";
                script.crossOrigin = "";
                script.src = src;
                head.appendChild(script);
              });
            }
            function link(rel, href) {
              var element = document.createElement("link");
              element.rel = rel;
              element.crossOrigin = "";
              element.href = href;
              head.appendChild(element);
              return element;
            }
            shellAssets.modulepreloads.forEach(function (href) { link("modulepreload", href); });
            shellAssets.stylesheets.forEach(function (href) { link("stylesheet", href).onload = settle; });
            if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", settle, { once: true });
            else settle();
          }`;

export interface RootGateScriptOptions {
  supported: readonly string[];
  resolver: string;
  flagKey: string;
}

export const renderRootGateScript = ({ supported, resolver, flagKey }: RootGateScriptOptions): string =>
  guardedGate(`${SHELL_LOADER}
          function redirectedBefore() {
            try {
              if (sessionStorage.getItem(${JSON.stringify(flagKey)})) return true;
              sessionStorage.setItem(${JSON.stringify(flagKey)}, "1");
            } catch (e) {}
            return false;
          }
          var basePath = "%BASE_URL%" || "/";
          var path = location.pathname;
          var rest = path.indexOf(basePath) === 0 ? path.slice(basePath.length).replace(/^index\\.html$/, "").replace(/^\\/+/, "") : null;
          if (rest === null || ${JSON.stringify(supported)}.indexOf(rest.split("/")[0]) !== -1 || redirectedBefore()) {
            loadShell();
            return;
          }
          var target = ${resolver};
          location.replace(basePath + target + "/" + (rest ? rest.replace(/\\/+$/, "") + "/" : "") + (location.search || "") + (location.hash || ""));`);

export interface GatewayGateScriptOptions {
  resolver: string;
  basePath: string;
  subPath: string;
}

export const renderGatewayGateScript = ({ resolver, basePath, subPath }: GatewayGateScriptOptions): string =>
  guardedGate(`          var target = ${resolver};
          location.replace(${JSON.stringify(basePath)} + target + "/" + ${JSON.stringify(subPath)} + (location.search || "") + (location.hash || ""));`);
