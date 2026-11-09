import { SystemStatusSnapshot } from "../types";
import { formatUtcTimestamp } from "../timeFormat";
import { BADGES_ICON, CODE_ICON, GITHUB_ICON, escapeHtml, externalLink } from "./html";

export interface FooterContext {
  statusBase: string;
  mainSiteBase: string;
  githubRepoUrl: string;
  includeBadgesLink: boolean;
}

function renderBadgesLink(statusBase: string): string {
  return `<a class="footer-nav-item" href="${escapeHtml(statusBase)}/badges/" title="Status Badges" aria-label="Status Badges">${BADGES_ICON}Status Badges</a>`;
}

function renderNav(context: FooterContext): string {
  const { statusBase, mainSiteBase, githubRepoUrl, includeBadgesLink } = context;
  const items = [
    externalLink(`${statusBase}/status.json`, "Status API", { className: "footer-nav-item", leadingIcon: CODE_ICON }),
    includeBadgesLink ? renderBadgesLink(statusBase) : "",
    externalLink(githubRepoUrl, "GitHub", { className: "footer-nav-item", leadingIcon: GITHUB_ICON }),
    externalLink(`${mainSiteBase}/docs/terms/`, "Terms of Service", { className: "footer-nav-item", text: "Terms" }),
    externalLink(`${mainSiteBase}/docs/privacy/`, "Privacy Policy", { className: "footer-nav-item", text: "Privacy" }),
  ];
  return items.filter(Boolean).join("\n        ");
}

export function renderSiteFooter(snapshot: SystemStatusSnapshot, context: FooterContext): string {
  const generatedDate = snapshot.meta.generatedAt ? new Date(snapshot.meta.generatedAt) : new Date();
  const year = (isNaN(generatedDate.getTime()) ? new Date() : generatedDate).getUTCFullYear();
  const timestamp = formatUtcTimestamp(snapshot.meta.generatedAt);
  return `  <footer class="site-footer" role="contentinfo">
    <div class="footer-primary">
      <div class="footer-brand-block">
        <div class="footer-brand-title">Montage Subtitle Translator Status</div>
        <div class="footer-brand-desc">Service health and operational status.</div>
      </div>
      <nav class="footer-nav" aria-label="Status page resources">
        ${renderNav(context)}
      </nav>
    </div>

    <div class="footer-secondary">
      <div class="footer-copyright">
        <span>&copy; <span data-utc-year="${year}">${year}</span> MontageSubs</span>
        <span class="footer-sep" aria-hidden="true">&bull;</span>
        <span class="footer-engine-version">Powered by Montage Status System</span>
      </div>
      <div class="footer-meta-block">
        <span class="footer-timestamp-label">Updated:</span>
        <span class="footer-timestamp"><time datetime="${escapeHtml(snapshot.meta.generatedAt)}" data-utc="${escapeHtml(timestamp)}">${escapeHtml(timestamp)}</time></span>
      </div>
    </div>
  </footer>
`;
}
