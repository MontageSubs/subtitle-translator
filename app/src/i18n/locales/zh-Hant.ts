import { zhHans } from "./zh-Hans";

export const zhHant: Record<keyof typeof zhHans, string> = {
  ...zhHans,
  "footer.status": "系統狀態",
};
