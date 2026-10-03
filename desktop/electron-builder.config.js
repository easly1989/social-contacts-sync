// Packaging for every desktop target (see issue #8). `npm run dist` builds the
// targets of the current OS; the release workflow builds all of them.
const { version: electronVersion } = require("electron/package.json");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "io.github.easly1989.socialcontactssync",
  productName: "Social Contacts Sync",
  executableName: "social-contacts-sync",
  copyright: "Social Contacts Sync contributors; based on WhatsApp Contact Sync by Guy Zylberberg",
  electronVersion,
  directories: { app: "app", output: "dist", buildResources: "resources" },
  // No native modules: the dependencies are copied as they are.
  npmRebuild: false,
  asar: true,
  files: ["**/*", "!**/*.map", "!**/*.d.ts", "!**/*.md", "!**/test/**", "!**/tests/**"],
  artifactName: "Social-Contacts-Sync-${version}-${os}-${arch}.${ext}",
  win: {
    target: [
      { target: "portable", arch: ["x64"] },
      { target: "nsis", arch: ["x64"] },
    ],
  },
  portable: { artifactName: "Social-Contacts-Sync-${version}-portable.exe" },
  nsis: {
    artifactName: "Social-Contacts-Sync-${version}-setup.exe",
    oneClick: true,
    perMachine: false,
  },
  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Utility",
    synopsis: "Give every contact a face",
    maintainer: "Carlo Ruggiero <noreply@github.com>",
    // See the sandbox note in src/main.ts.
    executableArgs: ["--no-sandbox"],
  },
  mac: {
    target: [{ target: "dmg", arch: ["universal"] }],
    category: "public.app-category.productivity",
    // No Apple Developer ID yet: ad-hoc signing lets Apple Silicon run it,
    // and the README explains "Open Anyway" for the first launch.
    identity: "-",
    hardenedRuntime: false,
    notarize: false,
  },
  publish: [{ provider: "github", owner: "easly1989", repo: "social-contacts-sync" }],
};
