// Report: a larger before → after preview when hovering the small photos.
import { icon, face, initials, sourceBadge, page } from "./kit.mjs";
import { syncReport } from "./screens-app.mjs";

function preview(name, before, source, matchedBy, { left, top }) {
  const big = "size-36 !rounded-2xl";
  return `<div class="fixed z-50" style="left:${left}px;top:${top}px">
    <div class="ml-10 size-3 rotate-45 bg-base-100 border-l border-t border-base-300 -mb-1.5 relative z-10"></div>
    <div class="w-[22.5rem] rounded-box border border-base-300 bg-base-100 shadow-2xl p-4">
      <div class="flex items-center justify-between gap-3 mb-3">
        <span class="font-semibold">${name}</span>${sourceBadge(source)}
      </div>
      <div class="flex items-center gap-3">
        <figure class="text-center">${before}<figcaption class="mt-1.5 text-xs text-base-content/60">Before</figcaption></figure>
        ${icon("arrow-right", "size-5 text-base-content/40")}
        <figure class="text-center">${face(name, big)}<figcaption class="mt-1.5 text-xs text-base-content/60">After</figcaption></figure>
      </div>
      <div class="mt-3 text-xs text-base-content/50">Matched by ${matchedBy}</div>
    </div>
  </div>`;
}

const cursor = (left, top) =>
  `<div class="fixed z-50" style="left:${left}px;top:${top}px">${icon("mouse-pointer-2", "size-5 fill-base-content text-base-100")}</div>`;

const withOverlay = (html, overlay) => html.replace("</body>", `${overlay}</body>`);

// A contact that had no photo: Google's letter → the new photo.
export const reportPreview = withOverlay(
  syncReport,
  preview("Alessandro Ricci", initials("Alessandro Ricci", "size-36 !rounded-2xl", "text-5xl"), "whatsapp", "+39 331 •••• 137", { left: 885, top: 440 }) +
    cursor(962, 424)
);

// Replace mode, dark theme: the old photo → the new one.
export const reportPreviewDark = withOverlay(
  syncReport
    .replace('data-theme="scs-light"', 'data-theme="scs-dark"')
    // This contact had a photo already, which the sync replaced.
    .replace(initials("Martina Marino", "size-7", "text-xs"), face("Martina Marino (old)", "size-7")),
  preview("Martina Marino", face("Martina Marino (old)", "size-36 !rounded-2xl"), "gravatar", "email · martina@example.com", { left: 885, top: 489 }) +
    cursor(962, 473)
);
