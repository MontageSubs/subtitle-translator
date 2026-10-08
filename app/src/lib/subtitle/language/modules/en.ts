import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const en = defineLatinLanguage("en", createOrthographyRule(
  [
    "a", "an", "the", "to", "of", "in", "for", "on", "with", "at", "by", "from", "into", "onto",
    "than", "as", "about", "upon", "within", "without", "toward", "towards", "through", "during",
    "before", "after", "above", "below", "between", "under", "over", "across", "along", "among",
    "against", "around", "behind", "beneath", "beside", "besides", "beyond", "inside", "outside",
    "near", "past", "since", "throughout", "until", "via", "despite", "my", "your", "his", "her",
    "its", "our", "their", "this", "that", "these", "those", "whose", "each", "every", "either",
    "neither", "some", "any", "no", "both", "much", "many", "several"
  ],
  ["'s", "'re", "'ve", "'d", "'ll", "'m", "n't"],
  ["and", "but", "or", "nor", "so", "yet", "because", "although", "while", "whereas", "since", "unless", "if"]
), { sdh: { stripsSpeakerTags: true }, bilingualWithChineseByDefault: true });
