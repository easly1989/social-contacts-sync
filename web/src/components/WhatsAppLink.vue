<script setup lang="ts">
import { onMounted, ref } from "vue";
import QrcodeVue from "qrcode.vue";
import { isbot } from "isbot";

import { EventType } from "../../../interfaces/api";
import { addHandler } from "../services/ws";
import { track } from "../analytics";

// The WhatsApp linking QR code: starts a WhatsApp session on the server and
// shows the code it sends, then a "linking" overlay once it is scanned.
const props = withDefaults(defineProps<{ size?: number }>(), { size: 296 });
const emit = defineEmits<{ connecting: [] }>();

const qrData = ref("");
const connecting = ref(false);

function onQR(data: string): void {
  if (!qrData.value) track("qr_loaded");
  qrData.value = data;
}

function onConnecting(): void {
  // The event can arrive more than once.
  if (!connecting.value) {
    track("whatsapp_connecting");
    emit("connecting");
  }
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
  <div class="relative mx-auto grid place-items-center rounded-2xl border border-base-300 bg-white p-3" :style="{ width: `${props.size}px`, height: `${props.size}px` }">
    <div v-if="!qrData" class="grid place-items-center gap-3 text-sm text-neutral-500">
      <span class="loading loading-spinner loading-md"></span>{{ $t("whatsapp.loading") }}
    </div>
    <qrcode-vue v-else :value="qrData" :size="props.size - 28" foreground="#111111" :class="{ 'opacity-15': connecting }" />
    <div v-if="connecting" class="absolute inset-0 grid place-items-center text-center">
      <div class="px-6">
        <span class="loading loading-spinner loading-md text-primary"></span>
        <p class="mt-2 font-semibold text-neutral-900">{{ $t("whatsapp.authorizing") }}</p>
        <p class="text-xs text-neutral-500">{{ $t("whatsapp.authorizingHint") }}</p>
      </div>
    </div>
  </div>
</template>
