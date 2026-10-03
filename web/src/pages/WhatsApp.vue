<script setup lang="ts">
import { onMounted, ref } from "vue";
import QrcodeVue from "qrcode.vue";
import { isbot } from "isbot";
import { CircleHelp, Phone } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";
import { EventType } from "../../../interfaces/api";
import { addHandler } from "../services/ws";
import { track } from "../analytics";

const qrData = ref("");
const connecting = ref(false);

function onQR(data: string): void {
  if (!qrData.value) track("qr_loaded");
  qrData.value = data;
}

function onConnecting(): void {
  // The event can arrive more than once.
  if (!connecting.value) track("whatsapp_connecting");
  connecting.value = true;
}

onMounted(() => {
  addHandler(EventType.WhatsAppQR, onQR);
  addHandler(EventType.WhatsAppConnecting, onConnecting);
  // Don't start a WhatsApp session for bots: it costs server resources.
  if (!isbot(navigator.userAgent)) fetch("/api/init_whatsapp", { credentials: "include" });
});
</script>

<template>
  <FlowFrame step="whatsapp">
    <div class="grid items-center gap-10 md:grid-cols-[1fr_auto]">
      <div>
        <div class="flex items-center gap-3">
          <div class="grid size-10 place-items-center rounded-xl bg-[#25D366] text-white"><Phone class="size-5" /></div>
          <h1 class="text-2xl font-bold tracking-tight">{{ $t("whatsapp.title") }}</h1>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-base-content/70">{{ $t("whatsapp.lead") }}</p>
        <ol class="mt-6 space-y-3 text-sm">
          <li v-for="n in 3" :key="n" class="flex items-center gap-3">
            <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{{ n }}</span>
            {{ $t(`whatsapp.step${n}`) }}
          </li>
        </ol>
        <a class="link link-hover mt-6 inline-flex items-center gap-1.5 text-sm text-base-content/60" href="https://faq.whatsapp.com/539218963354346/?locale=en_US" target="_blank">
          <CircleHelp class="size-4" />{{ $t("whatsapp.help") }}
        </a>
      </div>

      <div class="relative mx-auto grid size-[296px] place-items-center rounded-2xl border border-base-300 bg-white p-3">
        <div v-if="!qrData" class="grid place-items-center gap-3 text-sm text-neutral-500">
          <span class="loading loading-spinner loading-md"></span>{{ $t("whatsapp.loading") }}
        </div>
        <qrcode-vue v-else :value="qrData" :size="268" foreground="#111111" :class="{ 'opacity-15': connecting }" />
        <div v-if="connecting" class="absolute inset-0 grid place-items-center text-center">
          <div class="px-6">
            <span class="loading loading-spinner loading-md text-primary"></span>
            <p class="mt-2 font-semibold text-neutral-900">{{ $t("whatsapp.authorizing") }}</p>
            <p class="text-xs text-neutral-500">{{ $t("whatsapp.authorizingHint") }}</p>
          </div>
        </div>
      </div>
    </div>
  </FlowFrame>
</template>
