import { SocialNetwork } from "../../interfaces/api";
import { brandColors } from "./brands";

// Find profiles (issue #61): how each network is shown.
export const networkInfo: Record<SocialNetwork, { name: string; color: string }> = {
  instagram: { name: "Instagram", color: brandColors.instagram },
  linkedin: { name: "LinkedIn", color: brandColors.linkedin },
  facebook: { name: "Facebook", color: brandColors.facebook },
  bluesky: { name: "Bluesky", color: brandColors.bluesky },
  mastodon: { name: "Mastodon", color: brandColors.mastodon },
  github: { name: "GitHub", color: brandColors.github },
};

export const exportNetworks = ["instagram", "linkedin"] as const;
export const searchNetworks = ["bluesky", "mastodon", "github"] as const;
export const scanNetworks = ["instagram", "facebook", "linkedin"] as const;
