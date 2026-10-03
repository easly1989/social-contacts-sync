// Assembles desktop/app, the folder electron-builder packages:
//   app/desktop/      compiled Electron main process (desktop/build)
//   app/server-build/ compiled server (server/build)
//   app/web/          built web app (web/dist)
//   app/node_modules/ the server's production dependencies
//
// Usage: node scripts/stage.mjs [--no-build]
//   --no-build  reuse existing server/build and web/dist (CI builds them first)
import { execSync } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(desktop, "..");
const app = path.join(desktop, "app");
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "true" } });

if (!process.argv.includes("--no-build")) {
  run("npm ci && npm run build", path.join(root, "server"));
  run("npm ci && npm run build", path.join(root, "web"));
}

for (const required of ["server/build/server/main.js", "web/dist/index.html", "desktop/build/main.js"]) {
  if (!fs.existsSync(path.join(root, required))) throw new Error(`Missing ${required}; build it first.`);
}

// Everything but node_modules is rebuilt from scratch.
fs.mkdirSync(app, { recursive: true });
for (const entry of fs.readdirSync(app)) {
  if (entry !== "node_modules") fs.rmSync(path.join(app, entry), { recursive: true, force: true });
}

fs.cpSync(path.join(desktop, "build"), path.join(app, "desktop"), {
  recursive: true,
  filter: (src) => !src.endsWith(".test.js"),
});
fs.cpSync(path.join(root, "server", "build"), path.join(app, "server-build"), {
  recursive: true,
  filter: (src) => !src.endsWith(".test.js"),
});
fs.cpSync(path.join(root, "web", "dist"), path.join(app, "web"), { recursive: true });

// Install the server's production dependencies from its lockfile, plus the
// desktop's own runtime dependencies, only when they changed since the last
// staging.
const desktopPackage = JSON.parse(fs.readFileSync(path.join(desktop, "package.json"), "utf8"));
const desktopDeps = desktopPackage.dependencies ?? {};
const serverPackage = fs.readFileSync(path.join(root, "server", "package.json"), "utf8");
const serverLock = fs.readFileSync(path.join(root, "server", "package-lock.json"), "utf8");
const depsHash = createHash("sha256").update(serverPackage).update(serverLock).update(JSON.stringify(desktopDeps)).digest("hex");
const hashFile = path.join(app, "node_modules", ".staged-deps");
if (!fs.existsSync(hashFile) || fs.readFileSync(hashFile, "utf8") !== depsHash) {
  fs.writeFileSync(path.join(app, "package.json"), serverPackage);
  fs.writeFileSync(path.join(app, "package-lock.json"), serverLock);
  run("npm ci --omit=dev --no-audit --no-fund", app);
  const extra = Object.entries(desktopDeps).map(([name, range]) => `${name}@${range}`);
  if (extra.length) run(`npm install --omit=dev --no-save --no-audit --no-fund ${extra.join(" ")}`, app);
  fs.writeFileSync(hashFile, depsHash);
}
fs.rmSync(path.join(app, "package-lock.json"), { force: true });

// The packaged app's own manifest.
const dependencies = { ...JSON.parse(serverPackage).dependencies, ...desktopDeps };
fs.writeFileSync(
  path.join(app, "package.json"),
  JSON.stringify(
    {
      name: "social-contacts-sync",
      productName: "Social Contacts Sync",
      version: desktopPackage.version,
      description: "Give every contact a face: profile photos from WhatsApp into Google Contacts.",
      author: { name: "Carlo Ruggiero", url: "https://easly1989.github.io" },
      homepage: "https://github.com/easly1989/social-contacts-sync",
      license: "SEE LICENSE IN LICENSE",
      main: "desktop/main.js",
      dependencies,
    },
    null,
    2
  ) + "\n"
);
fs.copyFileSync(path.join(root, "LICENSE"), path.join(app, "LICENSE"));
console.log(`Staged ${path.relative(root, app)} (version ${desktopPackage.version}).`);
