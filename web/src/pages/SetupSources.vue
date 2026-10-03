<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, AtSign, Check, CircleCheck, Info, Phone, Send } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";
import WhatsAppLink from "../components/WhatsAppLink.vue";
import { SessionStatus } from "../../../interfaces/api";

// Mockup 1.4 in issue #8. Telegram and Gravatar arrive in later steps.
const router = useRouter();
const whatsappConnected = ref<boolean>();
const whatsappSaved = ref(false);
let poll: number | undefined;

async function checkStatus(): Promise<void> {
  const status: SessionStatus = await fetch("/api/status", { credentials: "include" }).then((r) => r.json());
  whatsappConnected.value = status.whatsappConnected;
  whatsappSaved.value = Boolean(status.whatsappSaved);
  if (status.whatsappConnected) window.clearInterval(poll);
}

// Linking ends with a redirect to this same page, which doesn't reload it,
// so watch the status until WhatsApp reports in.
function onConnecting(): void {
  window.clearInterval(poll);
  poll = window.setInterval(checkStatus, 2000);
}

async function unlink(): Promise<void> {
  await fetch("/api/desktop/whatsapp_unlink", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  await checkStatus();
}

onMounted(async () => {
  await checkStatus();
  // A saved link reconnects on its own, without a QR code: watch for it.
  if (whatsappSaved.value && !whatsappConnected.value) onConnecting();
});
onUnmounted(() => window.clearInterval(poll));
</script>

<template>
  <FlowFrame step="sources" wide>
    <h1 class="text-2xl font-bold tracking-tight">{{ $t("setup.sources.title") }}</h1>
    <p class="mt-2 text-sm text-base-content/70">{{ $t("setup.sources.lead") }}</p>

    <div class="mt-6 grid gap-4 md:grid-cols-3">
      <section class="flex flex-col rounded-box border-2 p-5" :class="whatsappConnected ? 'border-success/40 bg-success/5' : 'border-primary/50'">
        <div class="flex items-center gap-3">
          <div class="grid size-9 place-items-center rounded-xl bg-[#25D366] text-white"><Phone class="size-5" /></div>
          <div class="flex-1">
            <div class="font-semibold">WhatsApp</div>
            <div class="text-xs text-base-content/60">{{ $t("setup.sources.byPhone") }}</div>
          </div>
        </div>
        <template v-if="whatsappConnected === false">
          <div class="mt-4"><WhatsAppLink :size="200" :reconnecting="whatsappSaved" @connecting="onConnecting" /></div>
          <ol class="mt-4 list-inside list-decimal space-y-1 text-xs text-base-content/70">
            <li>{{ $t("whatsapp.step1") }}</li>
            <li>{{ $t("whatsapp.step2") }}</li>
            <li>{{ $t("whatsapp.step3") }}</li>
          </ol>
        </template>
        <div v-else-if="whatsappConnected" class="mt-auto flex items-center gap-1.5 pt-6 text-sm font-medium text-success">
          <CircleCheck class="size-4" /><span>{{ $t("setup.sources.connected") }}</span>
          <span class="flex-1"></span>
          <button type="button" class="btn btn-ghost btn-xs text-base-content/60" @click="unlink">{{ $t("setup.sources.unlink") }}</button>
        </div>
        <div v-else class="grid flex-1 place-items-center py-10"><span class="loading loading-spinner"></span></div>
      </section>

      <section class="flex flex-col rounded-box border border-base-300 p-5 opacity-70">
        <div class="flex items-center gap-3">
          <div class="grid size-9 place-items-center rounded-xl bg-[#2AABEE] text-white"><Send class="size-5" /></div>
          <div class="flex-1">
            <div class="font-semibold">Telegram</div>
            <div class="text-xs text-base-content/60">{{ $t("setup.sources.byPhone") }}</div>
          </div>
          <span class="badge badge-soft badge-sm">{{ $t("setup.sources.soon") }}</span>
        </div>
        <p class="mt-5 text-sm text-base-content/70">{{ $t("setup.sources.telegramText") }}</p>
      </section>

      <section class="flex flex-col rounded-box border border-base-300 p-5 opacity-70">
        <div class="flex items-center gap-3">
          <div class="grid size-9 place-items-center rounded-xl bg-[#1E6FD9] text-white"><AtSign class="size-5" /></div>
          <div class="flex-1">
            <div class="font-semibold">Gravatar</div>
            <div class="text-xs text-base-content/60">{{ $t("setup.sources.byEmail") }}</div>
          </div>
          <span class="badge badge-soft badge-sm">{{ $t("setup.sources.soon") }}</span>
        </div>
        <p class="mt-5 text-sm text-base-content/70">{{ $t("setup.sources.gravatarText") }}</p>
      </section>
    </div>

    <p class="mt-5 flex items-center gap-1.5 text-xs text-base-content/50"><Info class="size-3.5" />{{ $t("setup.sources.unavailable") }}</p>

    <template #actions>
      <router-link to="/setup/signin" class="btn btn-ghost"><ArrowLeft class="size-4" />{{ $t("common.back") }}</router-link>
      <span class="flex-1"></span>
      <span class="mr-2 text-sm text-base-content/60">{{ $t("setup.sources.ready", whatsappConnected ? 1 : 0) }}</span>
      <button type="button" class="btn btn-primary" :disabled="!whatsappConnected" @click="router.push('/options')">
        {{ $t("setup.sources.finish") }}<Check class="size-4" />
      </button>
    </template>
  </FlowFrame>
</template>
