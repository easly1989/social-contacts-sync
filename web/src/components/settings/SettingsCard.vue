<script setup lang="ts">
defineProps<{ heading?: string }>();
</script>

<template>
  <section>
    <h2 v-if="heading" class="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">{{ heading }}</h2>
    <div class="divide-y divide-base-300 rounded-box border border-base-300 bg-base-100 px-6 py-5">
      <slot />
    </div>
  </section>
</template>
