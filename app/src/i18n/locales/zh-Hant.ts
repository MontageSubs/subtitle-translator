import { zhHans } from "./zh-Hans";

export const zhHant: Record<keyof typeof zhHans, string> = {
  ...zhHans,
  "footer.status": "系統狀態",
  "docs.improvePage": "協助改進該文件",
  "docs.opensInNewTab": "（在新分頁中開啟）",
  "update.current": "目前暫無新版本。",
  "update.check": "檢查更新",
  "pwa.description": "在瀏覽器中翻譯 SRT 字幕，支援雙語或單語輸出，由神經機器翻譯驅動。",
};
