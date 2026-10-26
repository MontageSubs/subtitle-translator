import { COMPACT_LAYOUT_ATTRIBUTE, COMPACT_LAYOUT_VALUE } from "../config/breakpoints";
import { STORAGE_KEYS } from "../config/storage";

export const EARLY_LAYOUT_SCRIPT = `<script>(function(){try{var c=JSON.parse(localStorage.getItem("${STORAGE_KEYS.compactLayout}")||"{}");var r=document.documentElement;if(c[r.lang+":"+innerWidth]===1)r.setAttribute("${COMPACT_LAYOUT_ATTRIBUTE}","${COMPACT_LAYOUT_VALUE}");var d=localStorage.getItem("${STORAGE_KEYS.noticeDismissedId}");if(d){var s=document.createElement("style");s.textContent=".notice-banner[data-batch-id="+JSON.stringify(d)+"]{display:none}";document.head.appendChild(s)}}catch(e){}})()</script>`;
