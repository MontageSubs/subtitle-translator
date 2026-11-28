# 致谢

蒙太奇字幕翻译器能走到今天，靠的是许许多多人、项目和组织的付出，我们想在这一页向他们表示感谢。如果你也想为项目出一份力，可以先看看[如何贡献](../contribute/zh-Hans.md)。

## 个人

| 名字 | 身份 | 感谢 |
| --- | --- | --- |
| 小p | 项目开发者 | 负责项目的设计、开发与维护，把最初的想法一步步做成了现在这个工具。 |
| Joey | 社区成员 | 提供了大量测试与反馈，帮助项目不断改进。项目还只是个雏形的时候，他就一直在身边支持。 |

## 项目与模型

用来加快人名和术语识别的字幕词表，是用下面这些开源项目的数据生成的：

| 项目 | 作者 | 许可证 | 用途 |
| --- | --- | --- | --- |
| [stopwords-iso](https://github.com/stopwords-iso/stopwords-iso) | stopwords-iso | MIT | 多种语言的常用词 |
| [most-common-words-by-language](https://www.npmjs.com/package/most-common-words-by-language) | 项目维护者 | MIT | 词频列表 |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) | hermitdave，数据来自 OpenSubtitles | CC BY-SA 4.0 | 上面词频列表背后的数据 |
| [stdlib 英文人名数据集](https://github.com/stdlib-js/stdlib) | stdlib | Apache-2.0 | 英文名字 |

应用里可以下载的本地识别模型，来自这几位开发者：

| 模型 | 作者 | 许可证 | 用途 |
| --- | --- | --- | --- |
| [BERT 多语言命名实体识别](https://huggingface.co/Xenova/bert-base-multilingual-cased-ner-hrl) | Davlan，由 Xenova 转换为浏览器可用格式 | AFL-3.0 | 识别多种语言的人名 |
| [DistilBERT 多语言命名实体识别](https://huggingface.co/Xenova/distilbert-base-multilingual-cased-ner-hrl) | Davlan，由 Xenova 转换为浏览器可用格式 | AFL-3.0 | 支持同样的语言，体积更小 |
| [XLM-RoBERTa 日语命名实体识别](https://huggingface.co/jiting/xlm-roberta-ner-japanese_onnx) | tsmatz，由 jiting 转换为浏览器可用格式 | MIT | 识别日语人名 |

## 组织与平台

- [Weblate](https://hosted.weblate.org/projects/subtitle-translator/web-interface/) 和 [Crowdin](https://crowdin.com/project/montage-subtitle-translator) 承载了界面翻译，让世界各地的志愿者可以一起参与。
- [Hugging Face](https://huggingface.co/) 托管了上面列出的模型。
- [GitHub](https://github.com/MontageSubs/subtitle-translator) 和 [Cloudflare](https://www.cloudflare.com/) 托管了代码、网站和相关服务。

## 关于署名

每一位帮助过项目的人，都欢迎出现在这一页，是否署名完全由你决定。如果你希望列出自己的名字或昵称，或者不希望公开，请告诉维护者，或在[社区](../community/zh-Hans.md)里说明。未经你的同意，我们不会添加任何人的个人信息。
