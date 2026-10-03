<script setup lang="ts">
// The app mark: a contact card whose face has just been filled in.
defineProps<{ size?: string }>();
</script>

<template>
  <svg viewBox="0 0 40 40" :class="size ?? 'size-9'" class="shrink-0" role="img" aria-label="Social Contacts Sync">
    <defs>
      <linearGradient id="scs-logo-gradient" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#6d5dfc" />
        <stop offset="1" stop-color="#ec4899" />
      </linearGradient>
    </defs>
    <rect width="40" height="40" rx="11" fill="url(#scs-logo-gradient)" />
    <circle cx="20" cy="16" r="6" fill="#fff" />
    <path d="M9.5 31c1.4-5.2 5.6-8 10.5-8s9.1 2.8 10.5 8" fill="#fff" />
    <circle cx="30" cy="10" r="5" fill="#fff" />
    <path d="M27.8 10.2l1.6 1.6 3-3.2" stroke="#6d5dfc" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
