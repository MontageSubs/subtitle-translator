import type { DocAuthor } from "../types/docs";
import { escapeHtml } from "../utils/escapeHtml";
import { joinPath } from "./paths";

export type AvatarStackSize = "sm" | "lg";

export function renderAvatarStack(authors: readonly DocAuthor[], size: AvatarStackSize, basePath: string, decorative: boolean): string {
  if (!authors.length) return "";
  const avatars = authors
    .slice()
    .reverse()
    .map(
      (author, index) => `
        <span class="avatar-stack__item" style="z-index:${index}">
          <img src="${joinPath(basePath, [author.avatarUrl])}" width="32" height="32" alt="" loading="lazy" />
          ${decorative ? "" : `<span class="avatar-stack__name">${escapeHtml(author.login)}</span>`}
        </span>
      `
    )
    .join("");
  return `<span class="avatar-stack avatar-stack--${size}"${decorative ? ' aria-hidden="true"' : ""}>${avatars}</span>`;
}
