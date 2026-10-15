import { COMPACT_LAYOUT_ATTRIBUTE, COMPACT_LAYOUT_CACHE_KEY, COMPACT_LAYOUT_VALUE } from "../config/breakpoints";

export const EARLY_LAYOUT_SCRIPT = `<script>(function(){try{var c=JSON.parse(localStorage.getItem("${COMPACT_LAYOUT_CACHE_KEY}")||"{}");var r=document.documentElement;if(c[r.lang+":"+innerWidth]===1)r.setAttribute("${COMPACT_LAYOUT_ATTRIBUTE}","${COMPACT_LAYOUT_VALUE}")}catch(e){}})()</script>`;
