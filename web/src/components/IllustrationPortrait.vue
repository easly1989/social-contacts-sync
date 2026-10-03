<script setup lang="ts">
import { computed } from "vue";

// A friendly, clearly synthetic portrait for illustrations, so no real person
// is ever shown. The same seed always draws the same face.
const props = defineProps<{ seed: string; size?: string }>();

const skins = ["#f6d7c3", "#eac0a2", "#d9a27e", "#b97b56", "#8d5a3b", "#5e3a26"];
const hairs = ["#2b1b12", "#4a2f1d", "#7a4a26", "#c58b4a", "#e2c27a", "#9a9aa3", "#1c1c22", "#a8442a"];
const backgrounds = ["#e0e7ff", "#fce7f3", "#dcfce7", "#fef3c7", "#e0f2fe", "#ede9fe", "#ffe4e6", "#ccfbf1"];
const shirts = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#0ea5e9", "#8b5cf6", "#ef4444", "#22c55e"];

const face = computed(() => {
  let state = 0;
  for (const c of props.seed) state = (state * 31 + c.charCodeAt(0)) >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const pick = (list: string[]) => list[Math.floor(next() * list.length)];
  return { bg: pick(backgrounds), skin: pick(skins), hair: pick(hairs), shirt: pick(shirts), long: next() > 0.5 };
});
</script>

<template>
  <svg viewBox="0 0 64 64" :class="size ?? 'size-10'" class="shrink-0 rounded-full" aria-hidden="true">
    <rect width="64" height="64" :fill="face.bg" />
    <path d="M10 64c2-12 11-18 22-18s20 6 22 18z" :fill="face.shirt" />
    <rect x="28" y="38" width="8" height="9" rx="3" :fill="face.skin" />
    <ellipse cx="32" cy="29" rx="11" ry="12.5" :fill="face.skin" />
    <path v-if="face.long" d="M18 30c0-11 6-17 14-17s14 6 14 17v12c-2-2-3-5-3-9-2-5-6-8-11-8s-9 3-11 8c0 4-1 7-3 9z" :fill="face.hair" />
    <path v-else d="M20 27c0-9 5-14 12-14s12 5 12 14c-3-4-7-6-12-6s-9 2-12 6z" :fill="face.hair" />
    <circle cx="27.5" cy="30" r="1.3" fill="#1f2937" />
    <circle cx="36.5" cy="30" r="1.3" fill="#1f2937" />
    <path d="M28.5 35.5c2 1.6 5 1.6 7 0" stroke="#9a3412" stroke-width="1.3" fill="none" stroke-linecap="round" />
  </svg>
</template>
