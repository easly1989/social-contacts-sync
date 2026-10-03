<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { RefreshCw } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";

type Mode = "fill" | "replace" | "review";

// Each mode maps onto the two flags the server understands; at most one is on.
const modes: { value: Mode; overwrite: boolean; manual: boolean }[] = [
  { value: "fill", overwrite: false, manual: false },
  { value: "replace", overwrite: true, manual: false },
  { value: "review", overwrite: false, manual: true },
];

const mode = ref<Mode>("fill");
const router = useRouter();

function startSync(): void {
  const selected = modes.find((m) => m.value === mode.value)!;
  const params = new URLSearchParams({
    manual_sync: String(selected.manual),
    overwrite_photos: String(selected.overwrite),
  });
  router.push(`/sync?${params}`);
}
</script>

<template>
  <FlowFrame step="options">
    <div class="mx-auto max-w-xl">
      <h1 class="text-2xl font-bold tracking-tight">{{ $t("options.title") }}</h1>
      <p class="mt-2 text-sm text-base-content/70">{{ $t("options.lead") }}</p>
      <div class="mt-6 space-y-2" role="radiogroup">
        <label
          v-for="m in modes"
          :key="m.value"
          class="flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors"
          :class="mode === m.value ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-base-content/20'"
        >
          <input v-model="mode" type="radio" name="mode" :value="m.value" class="radio radio-primary radio-sm mt-0.5" />
          <div class="flex-1">
            <div class="flex items-center gap-2 text-sm font-semibold">
              {{ $t(`options.${m.value}Title`) }}
              <span v-if="m.value === 'fill'" class="badge badge-soft badge-primary badge-xs">{{ $t("options.recommended") }}</span>
            </div>
            <div class="mt-0.5 text-sm text-base-content/60">{{ $t(`options.${m.value}Text`) }}</div>
          </div>
        </label>
      </div>
    </div>

    <template #actions>
      <span class="flex-1"></span>
      <button type="button" class="btn btn-primary" @click="startSync"><RefreshCw class="size-4" />{{ $t("options.start") }}</button>
    </template>
  </FlowFrame>
</template>
