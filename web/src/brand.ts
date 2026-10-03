// Product identity, kept in one place so a future rename touches one file.
export const appName = "Social Contacts Sync";
export const repoOwner = "easly1989";
export const repoName = "social-contacts-sync";
export const repoUrl = `https://github.com/${repoOwner}/${repoName}`;

// This project is a fork of WhatsApp Contact Sync; keep the credit visible.
export const upstreamName = "WhatsApp Contact Sync";
export const upstreamAuthor = "Guy Zylberberg";
export const upstreamUrl = "https://github.com/guyzyl/whatsapp-contact-sync";
export const upstreamDonationUrl = "https://www.buymeacoffee.com/guyzyl";

export const maintainerName = "Carlo Ruggiero";
export const maintainerSite = "https://easly1989.github.io";

/** Donation links of this project, as in the README. */
export const donations = [
  { id: "coffee", name: "Buy me a coffee", url: "https://buymeacoffee.com/easly1989", className: "bg-[#FFDD00] text-neutral-900 hover:bg-[#f5d400]" },
  { id: "paypal", name: "PayPal", url: "https://paypal.me/carloruggiero", className: "bg-[#003087] text-white hover:bg-[#00256b]" },
  { id: "stripe", name: "Stripe", url: "https://buy.stripe.com/8x26oAeqA7h6dPk80hfbq00", className: "bg-[#635bff] text-white hover:bg-[#5249f0]" },
  { id: "liberapay", name: "Liberapay", url: "https://liberapay.com/amon2126/donate", className: "bg-[#f6c915] text-neutral-900 hover:bg-[#e8bc0c]" },
  { id: "sponsors", name: "GitHub Sponsors", url: "https://github.com/sponsors/easly1989", className: "bg-[#db61a2] text-white hover:bg-[#c94f90]" },
] as const;
