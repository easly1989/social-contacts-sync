<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";

import { EventType } from "../../interfaces/api";
import AppToasts from "./components/AppToasts.vue";
import { addHandler } from "./services/ws";

const router = useRouter();

onMounted(() => {
  addHandler(EventType.Redirect, (url: string) => router.push(url));
});
</script>

<template>
  <router-view />
  <AppToasts />
</template>
