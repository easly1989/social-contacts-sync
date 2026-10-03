<script setup lang="ts">
// One row of a Settings card: title and description on the left, a control on the right.
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-6 gap-y-3 py-5 first:pt-0 last:pb-0">
    <div class="min-w-[14rem] flex-1">
      <div class="font-medium">{{ title }}</div>
      <div v-if="description || $slots.description" class="mt-0.5 text-sm text-base-content/60">
        <slot name="description">{{ description }}</slot>
      </div>
    </div>
    <slot />
  </div>
</template>
