<script lang="ts">
import { defineComponent } from "vue";

import { appName, repoName, repoOwner } from "../brand";

export default defineComponent({
  data: () => ({
    appName,
    starButtonUrl: `https://ghbtns.com/github-btn.html?user=${repoOwner}&repo=${repoName}&type=star&count=true&size=large`,
  }),
  mounted() {},
  methods: {},
});
</script>

<template>
  <div id="header" class="navbar bg-base-100">
    <div class="flex-1">
      <router-link
        to="/"
        tag="button"
        class="btn btn-ghost normal-case text-xl pl-0 md:pl-4"
        ><img class="h-8 w-8 mr-" src="/logo.png" />{{ appName }}</router-link
      >
    </div>
    <div class="flex-none md:pr-4">
      <iframe
        :src="starButtonUrl"
        frameborder="0"
        scrolling="0"
        width="140"
        height="30"
        title="GitHub"
      ></iframe>
    </div>
  </div>
</template>

<style scoped></style>
