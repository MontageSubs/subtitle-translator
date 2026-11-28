# 致謝

蒙太奇字幕翻譯器能走到今天，靠的是許許多多人、專案與組織的付出，我們想在這一頁向他們致上謝意。如果你也想為專案盡一份心力，可以先看看[如何貢獻](../contribute/zh-Hant.md)。

## 個人

| 名字 | 身分 | 感謝 |
| --- | --- | --- |
| 小p | 專案開發者 | 負責專案的設計、開發與維護，把最初的想法一步步做成了現在這個工具。 |
| Joey | 社群成員 | 提供了大量測試與回饋，幫助專案不斷改進。專案還只是個雛形的時候，他就一直在身邊支持。 |

## 專案與模型

用來加快人名與詞彙辨識的字幕詞表，是以下列開源專案的資料產生的：

| 專案 | 作者 | 授權 | 用途 |
| --- | --- | --- | --- |
| [stopwords-iso](https://github.com/stopwords-iso/stopwords-iso) | stopwords-iso | MIT | 多種語言的常用詞 |
| [most-common-words-by-language](https://www.npmjs.com/package/most-common-words-by-language) | 專案維護者 | MIT | 詞頻清單 |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) | hermitdave，資料來自 OpenSubtitles | CC BY-SA 4.0 | 上述詞頻清單背後的資料 |
| [stdlib 英文人名資料集](https://github.com/stdlib-js/stdlib) | stdlib | Apache-2.0 | 英文名字 |

應用程式裡可以下載的本機辨識模型，來自這幾位開發者：

| 模型 | 作者 | 授權 | 用途 |
| --- | --- | --- | --- |
| [BERT 多語言命名實體辨識](https://huggingface.co/Xenova/bert-base-multilingual-cased-ner-hrl) | Davlan，由 Xenova 轉換為瀏覽器可用格式 | AFL-3.0 | 辨識多種語言的人名 |
| [DistilBERT 多語言命名實體辨識](https://huggingface.co/Xenova/distilbert-base-multilingual-cased-ner-hrl) | Davlan，由 Xenova 轉換為瀏覽器可用格式 | AFL-3.0 | 支援相同的語言，體積更小 |
| [XLM-RoBERTa 日文命名實體辨識](https://huggingface.co/jiting/xlm-roberta-ner-japanese_onnx) | tsmatz，由 jiting 轉換為瀏覽器可用格式 | MIT | 辨識日文人名 |

## 組織與平台

- [Weblate](https://hosted.weblate.org/projects/subtitle-translator/web-interface/) 與 [Crowdin](https://crowdin.com/project/montage-subtitle-translator) 承載了介面翻譯，讓世界各地的志工可以一起參與。
- [Hugging Face](https://huggingface.co/) 託管了上面列出的模型。
- [GitHub](https://github.com/MontageSubs/subtitle-translator) 與 [Cloudflare](https://www.cloudflare.com/) 託管了程式碼、網站與相關服務。

## 關於署名

每一位協助過專案的人，都歡迎出現在這一頁，是否列名完全由你決定。如果你希望列上自己的名字或暱稱，或不希望公開，請告訴維護者，或在[社群](../community/zh-Hant.md)裡說明。未經你的同意，我們不會加上任何人的個人資訊。
