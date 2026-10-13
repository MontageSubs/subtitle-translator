import { zhHans } from "./zh-Hans";

export const zhHant: Record<keyof typeof zhHans, string> = {
  ...zhHans,
  "footer.status": "系統狀態",
  "docs.improvePage": "協助改進該文件",
  "docs.opensInNewTab": "（在新分頁中開啟）",
  "update.current": "目前暫無新版本。",
  "update.check": "檢查更新",
  "credit.label": "支持本專案",
  "credit.desc": "在字幕結尾加入一則簡短署名，幫助更多人發現這個開源工具。",
  "credit.text": "字幕由 Montage Subtitle Translator 產生",
  "preview.locked": "唯讀",
  "pwa.description": "在瀏覽器中翻譯 SRT 字幕，支援雙語或單語輸出，由神經機器翻譯驅動。",
  "lyrics.label": "不翻譯歌詞",
  "lyrics.desc": "含音符（♪）的歌詞字幕保留原文，不送出翻譯；與對白混排的字幕仍會翻譯。",
  "lyrics.summaryOn": "歌詞保留原文",
  "punctuation.fullWidth.label": "保留全形驚嘆號和問號",
  "punctuation.fullWidth.desc": "關閉時轉為半形「!」和「?」，這是中文字幕的慣例，可避免畫面出現空白。開啟後保留全形符號。",
  "punctuation.fullWidth.summaryOn": "保留全形！？",
  "punctuation.terminators.label": "保留句號和逗號",
  "punctuation.terminators.desc": "關閉時移除句尾句號和句中逗號，這是中文字幕的慣例。開啟後保留譯文中的這些標點。",
  "punctuation.terminators.summaryOn": "保留句號和逗號",
};
