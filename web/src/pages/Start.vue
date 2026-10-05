<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";

import BrandLogo from "../components/BrandLogo.vue";
import { api } from "../api";
import { desktopStart } from "../desktopFlow";
import { applyStatus } from "../settings";

// The desktop app opens here: a set-up app goes straight to the dashboard,
// a first run (or an unfinished setup) to the welcome page.
const router = useRouter();

onMounted(async () => {
  try {
    const status = await api.status();
    applyStatus(status);
    await router.replace(desktopStart(status));
  } catch {
    await router.replace("/");
  }
});
</script>

<template>
  <main class="grid min-h-screen place-items-center bg-base-200">
    <div class="flex flex-col items-center gap-4 text-sm text-base-content/60" role="status">
      <BrandLogo size="size-14" />
      <span class="loading loading-dots loading-md text-primary" aria-hidden="true"></span>
      <span>{{ $t("start.loading") }}</span>
    </div>
  </main>
</template>
