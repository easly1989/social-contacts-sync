<script setup lang="ts">
import { computed, ref, watch } from "vue";

// A contact's photo, or their initial on a colour picked from the name.
const props = defineProps<{ name?: string; photoUrl?: string; size?: string }>();
const failed = ref(false);
watch(() => props.photoUrl, () => (failed.value = false));

const colors = ["#e2367f", "#f97316", "#0d9488", "#2563eb", "#7c3aed", "#16a34a", "#db2777", "#ca8a04"];
const color = computed(() => {
  let hash = 0;
  for (const ch of props.name ?? "?") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
});
const initial = computed(() => (props.name?.trim()[0] ?? "?").toUpperCase());
</script>

<template>
  <img v-if="photoUrl && !failed" :src="photoUrl" alt="" class="shrink-0 rounded-full object-cover ring-2 ring-base-100" :class="size ?? 'size-9'" referrerpolicy="no-referrer" @error="failed = true" />
  <span v-else class="grid shrink-0 place-items-center rounded-full text-sm font-semibold text-white ring-2 ring-base-100" :class="size ?? 'size-9'" :style="{ background: color }" aria-hidden="true">{{ initial }}</span>
</template>
