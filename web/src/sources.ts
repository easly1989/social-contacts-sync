import { AtSign, Link, Phone, Send } from "lucide-vue-next";

import { SourceId } from "../../interfaces/api";
import { i18n } from "./i18n";

// Display data for photo sources; colours match the mockups in issues #8 and #51.
export const sourceInfo: Record<SourceId, { name: string; color: string; text: string; icon: typeof Phone; matchedBy: "phone" | "email" | "link" }> = {
  whatsapp: { name: "WhatsApp", color: "#25D366", text: "#1d9e55", icon: Phone, matchedBy: "phone" },
  telegram: { name: "Telegram", color: "#2AABEE", text: "#2AABEE", icon: Send, matchedBy: "phone" },
  gravatar: { name: "Gravatar", color: "#1E6FD9", text: "#1E6FD9", icon: AtSign, matchedBy: "email" },
  links: {
    // Not a brand: translated, and read when rendered so it follows the language.
    get name() {
      return i18n.global.t("links.name");
    },
    color: "#F97316",
    text: "#c2410c",
    icon: Link,
    matchedBy: "link",
  },
};
