import { AtSign, Link, Phone, Send } from "lucide-vue-next";

import { SourceId } from "../../interfaces/api";
import { brandColors } from "./brands";
import { i18n } from "./i18n";

// Display data for photo sources; colours match the mockups in issues #8 and #51.
export const sourceInfo: Record<SourceId, { name: string; color: string; icon: typeof Phone; matchedBy: "phone" | "email" | "link" }> = {
  whatsapp: { name: "WhatsApp", color: brandColors.whatsapp, icon: Phone, matchedBy: "phone" },
  telegram: { name: "Telegram", color: brandColors.telegram, icon: Send, matchedBy: "phone" },
  gravatar: { name: "Gravatar", color: brandColors.gravatar, icon: AtSign, matchedBy: "email" },
  links: {
    // Not a brand: translated, and read when rendered so it follows the language.
    get name() {
      return i18n.global.t("links.name");
    },
    color: "#F97316",
    icon: Link,
    matchedBy: "link",
  },
};
