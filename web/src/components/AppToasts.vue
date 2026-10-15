<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { Check, CircleAlert, CircleCheck, Copy, X } from "lucide-vue-next";

import { dismissToast, Toast, toastDuration, toasts } from "../toasts";

// Bottom right, newest at the bottom (issue #65). A toast doesn't leave while
// the pointer is on it.
const timers = new Map<number, { left: number; started: number; handle?: number }>();

function start(toast: Toast): void {
  const timer = timers.get(toast.id);
  if (!timer || timer.handle !== undefined) return;
  timer.started = Date.now();
  timer.handle = window.setTimeout(() => dismiss(toast.id), timer.left);
}
function pause(toast: Toast): void {
  const timer = timers.get(toast.id);
  if (!timer || timer.handle === undefined) return;
  window.clearTimeout(timer.handle);
  timer.handle = undefined;
  timer.left = Math.max(800, timer.left - (Date.now() - timer.started));
}
function dismiss(id: number): void {
  const timer = timers.get(id);
  if (timer?.handle !== undefined) window.clearTimeout(timer.handle);
  timers.delete(id);
  dismissToast(id);
}

watch(
  () => toasts.map((t) => t.id),
  () => {
    for (const toast of toasts) {
      const duration = toastDuration(toast);
      if (duration === undefined || timers.has(toast.id)) continue;
      timers.set(toast.id, { left: duration, started: Date.now() });
      start(toast);
    }
  },
  { immediate: true }
);
onBeforeUnmount(() => timers.forEach((t) => t.handle !== undefined && window.clearTimeout(t.handle)));

const copied = ref<number>();
async function copy(toast: Toast): Promise<void> {
  const text = [toast.text, toast.detail].filter(Boolean).join("\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Without the clipboard (an insecure page), the detail can still be selected by hand.
    const range = document.createRange();
    const node = document.querySelector(`[data-toast-detail="${toast.id}"]`);
    if (node) {
      range.selectNodeContents(node);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
    return;
  }
  copied.value = toast.id;
  window.setTimeout(() => copied.value === toast.id && (copied.value = undefined), 2000);
}

function run(toast: Toast): void {
  toast.action?.run();
  dismiss(toast.id);
}
</script>

<template>
  <div class="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[24rem] max-w-[calc(100vw-2rem)] flex-col gap-2 lg:bottom-4" data-testid="toasts">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex items-start gap-3 rounded-box border bg-base-100 p-3 shadow-xl"
      :class="toast.kind === 'error' ? 'border-error/40' : 'border-base-300'"
      :role="toast.kind === 'error' ? 'alert' : 'status'"
      data-testid="toast"
      @mouseenter="pause(toast)"
      @mouseleave="start(toast)"
    >
      <CircleAlert v-if="toast.kind === 'error'" class="mt-0.5 size-5 shrink-0 text-error" />
      <CircleCheck v-else class="mt-0.5 size-5 shrink-0 text-success" />
      <div class="min-w-0 flex-1">
        <p class="text-sm" :class="{ 'font-medium': toast.kind === 'error' }">{{ toast.text }}</p>
        <p v-if="toast.detail" class="mt-1.5 select-all break-words rounded-lg bg-base-200 px-2 py-1.5 font-mono text-[11px] text-base-content/70" :data-toast-detail="toast.id">{{ toast.detail }}</p>
        <div v-if="toast.kind === 'error' || toast.action" class="mt-2 flex flex-wrap gap-2">
          <button v-if="toast.action" type="button" class="btn btn-xs" @click="run(toast)">{{ toast.action.label }}</button>
          <button v-if="toast.kind === 'error'" type="button" class="btn btn-xs" @click="copy(toast)">
            <Check v-if="copied === toast.id" class="size-3.5 text-success" /><Copy v-else class="size-3.5" />{{ copied === toast.id ? $t("toasts.copied") : $t("toasts.copy") }}
          </button>
        </div>
      </div>
      <button type="button" class="btn btn-ghost btn-xs btn-square" :aria-label="$t('contacts.close')" @click="dismiss(toast.id)"><X class="size-4" /></button>
    </div>
  </div>
</template>
