import { AtSign, Phone, Send } from "lucide-vue-next";

import { SourceId } from "../../interfaces/api";

// Display data for photo sources; colours match the mockups in issue #8.
export const sourceInfo: Record<SourceId, { name: string; color: string; text: string; icon: typeof Phone; matchedBy: "phone" | "email" }> = {
  whatsapp: { name: "WhatsApp", color: "#25D366", text: "#1d9e55", icon: Phone, matchedBy: "phone" },
  telegram: { name: "Telegram", color: "#2AABEE", text: "#2AABEE", icon: Send, matchedBy: "phone" },
  gravatar: { name: "Gravatar", color: "#1E6FD9", text: "#1E6FD9", icon: AtSign, matchedBy: "email" },
};
