<script setup lang="ts">
import { brandPaths } from "../brands";

// A source's or network's logo in the current colour (issue #104); LinkedIn's "in" is drawn here.
defineProps<{ brand: string }>();
</script>

<template>
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <text v-if="brand === 'linkedin'" x="12" y="18.5" text-anchor="middle" font-size="19" font-weight="700" font-family="Arial, Helvetica, sans-serif">in</text>
    <path v-else :d="brandPaths[brand]" />
  </svg>
</template>
