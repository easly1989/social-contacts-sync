import { createApp } from "vue";
import {
  createRouter,
  createWebHistory,
  RouteLocationNormalized,
  RouteRecordRaw,
} from "vue-router";
import App from "./App.vue";

import "@fontsource-variable/inter";
import "./index.css";
import { i18n } from "./i18n";
import { applyTheme } from "./preferences";
import { installAnalytics } from "./analytics";
import { initWs } from "./services/ws";
import { SessionStatus } from "../../interfaces/api";
import { isbot } from "isbot";
import { applyStatus } from "./settings";
import { desktopRedirect } from "./desktopFlow";

const routes: RouteRecordRaw[] = [
  { path: "/", component: () => import("./pages/Home.vue") },
  { path: "/privacy", component: () => import("./pages/Privacy.vue") },
  { path: "/contribute", component: () => import("./pages/Contribute.vue") },
  { path: "/whatsapp", component: () => import("./pages/WhatsApp.vue") },
  { path: "/gauth", component: () => import("./pages/GoogleAuth.vue") },
  // The app (issue #21); the old flow's last steps now live there.
  { path: "/app", component: () => import("./pages/app/Dashboard.vue") },
  { path: "/app/sync", component: () => import("./pages/app/SyncSetup.vue") },
  { path: "/app/sync/run", component: () => import("./pages/app/SyncRun.vue") },
  { path: "/app/history", component: () => import("./pages/app/History.vue") },
  { path: "/app/history/:id", component: () => import("./pages/app/RunReport.vue") },
  { path: "/app/settings", redirect: "/app/settings/general" },
  { path: "/app/settings/:section", component: () => import("./pages/app/Settings.vue") },
  { path: "/options", redirect: "/app/sync" },
  {
    path: "/sync",
    redirect: (to) => ({
      path: "/app/sync/run",
      query: {
        mode: to.query.manual_sync === "true" ? "review" : to.query.overwrite_photos === "true" ? "replace" : "fill",
        sources: "whatsapp",
      },
    }),
  },
  // Desktop first-run wizard.
  { path: "/setup/google", component: () => import("./pages/SetupGoogle.vue") },
  { path: "/setup/signin", component: () => import("./pages/SetupSignIn.vue") },
  { path: "/setup/sources", component: () => import("./pages/SetupSources.vue") },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(
  async (to: RouteLocationNormalized, from: RouteLocationNormalized) => {
    // Makes sure websocket is initialized.
    //  This is done on every request to make sure the server didn't discconect in the meantime.
    await initWs();

    // Don't make any checks for serving the index page.
    // This is done so the user can access it even if the backend is down.
    // Additionally, bots are allowed to access any page they want.
    if (to.path == "/" || isbot(navigator.userAgent)) return;

    const response = await fetch("/api/status", { credentials: "include" });
    const status: SessionStatus = await response.json();

    applyStatus(status);
    if (status.desktop) return desktopRedirect(to.path, status);

    if (
      (["/whatsapp", "/gauth"].includes(to.path) || to.path.startsWith("/app")) &&
      status.enforcePayments &&
      !status.purchased
    )
      return "/contribute";
    else if (to.path.startsWith("/app") && !status.googleConnected)
      return status.whatsappConnected ? "/gauth" : "/";
    else if (to.path === "/contribute" && status.purchased)
      return "/whatsapp";
    else if (to.path === "/gauth" && !status.whatsappConnected)
      return "/";
    else if (to.path === "/whatsapp" && status.whatsappConnected)
      return "/gauth";
    else if (to.path === "/gauth" && status.googleConnected)
      return "/app";
  }
);

let currentRoute: RouteLocationNormalized;

router.afterEach((to: RouteLocationNormalized) => {
  // This is run after each navigation, including the initial navigation.
  currentRoute = to;
});

applyTheme();

const app = createApp(App).use(router).use(i18n);
installAnalytics(app, router);
app.mount("#app");
