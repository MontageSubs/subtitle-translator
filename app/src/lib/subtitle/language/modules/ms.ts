import { defineLatinLanguage } from "../families/latin";
import { createOrthographyRule } from "../shared/orthography";

export const ms = defineLatinLanguage("ms", createOrthographyRule(
  [
    "di", "ke", "dari", "daripada", "kepada", "pada", "dalam", "untuk", "dengan", "yang", "oleh", "bagi", "sebagai",
    "antara", "tanpa", "akan", "telah", "sudah", "belum", "sedang", "masih", "tidak", "tak", "bukan", "sangat", "amat",
    "para", "si", "sang", "seperti", "tentang", "hingga", "sehingga", "supaya", "agar"
  ],
  ["itu", "ini", "pun", "juga", "lagi", "sahaja", "je", "kan", "lah"],
  ["dan", "tetapi", "tapi", "atau", "kerana", "sebab", "jika", "kalau", "apabila", "ketika", "semasa", "manakala", "sedangkan", "supaya", "agar", "walaupun", "meskipun", "lalu", "kemudian", "maka", "sehingga", "bahawa", "kecuali", "namun", "yang"]
));
