import { SocialNetwork } from "../../interfaces/api";

// Find profiles (issue #61): how each network is shown.
export const networkInfo: Record<SocialNetwork, { name: string; color: string }> = {
  instagram: { name: "Instagram", color: "#E1306C" },
  linkedin: { name: "LinkedIn", color: "#0A66C2" },
  facebook: { name: "Facebook", color: "#1877F2" },
  bluesky: { name: "Bluesky", color: "#1185FE" },
  mastodon: { name: "Mastodon", color: "#6364FF" },
  github: { name: "GitHub", color: "#6E7781" },
};

export const exportNetworks = ["instagram", "linkedin"] as const;
export const searchNetworks = ["bluesky", "mastodon", "github"] as const;
export const scanNetworks = ["instagram", "facebook", "linkedin"] as const;
