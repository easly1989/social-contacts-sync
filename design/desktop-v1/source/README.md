# Desktop v1 mockups — source

Tailwind 4 + daisyUI 5 (the stack of the web app), Inter, Lucide icons.
Portraits and QR codes are generated, no real people or data.

```bash
npm i tailwindcss@4 @tailwindcss/cli@4 daisyui@5 @fontsource-variable/inter lucide-static @playwright/test
cp node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 out/inter.woff2
node build.mjs wizard app more preview   # writes out/*.html and png/*.png
```
