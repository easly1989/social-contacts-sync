// Renders every mockup screen to out/<name>.html and png/<name>.png.
import { writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { chromium } from "@playwright/test";

const modules = process.argv.slice(2).length ? process.argv.slice(2) : ["wizard"];
const screens = {};
for (const m of modules) {
  const mod = await import(`./screens-${m}.mjs?${Date.now()}`);
  for (const [k, v] of Object.entries(mod)) if (typeof v === "string") screens[k] = v;
  if (mod.sizes) Object.assign(screens.__sizes ??= {}, mod.sizes);
}
const sizes = screens.__sizes || {};
delete screens.__sizes;
mkdirSync("out", { recursive: true });
mkdirSync("png", { recursive: true });
for (const [name, html] of Object.entries(screens)) writeFileSync(`out/${name}.html`, html);
execSync("npx @tailwindcss/cli -i theme.css -o out/app.css", { stdio: "inherit" });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const name of Object.keys(screens)) {
  const [w, h] = sizes[name] || [1280, 800];
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(`file://${process.cwd()}/out/${name}.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `png/${name}.png` });
  await page.close();
  console.log("rendered", name);
}
await browser.close();
