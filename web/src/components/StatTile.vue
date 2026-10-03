<script setup lang="ts">
defineProps<{ label: string; value: number | string; icon?: object; tone?: string }>();
</script>

<template>
  <div class="rounded-box border border-base-300 bg-base-100 px-5 py-4">
    <div class="flex items-center gap-1.5 text-xs font-medium text-base-content/60">
      <component :is="icon" v-if="icon" class="size-3.5" :class="tone" />{{ label }}
    </div>
    <div class="mt-1 text-2xl font-bold tabular-nums">{{ value }}</div>
  </div>
</template>
