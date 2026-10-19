<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { loginSearchNotice } from "../../loginSearch";
import { networkInfo } from "../../profileNetworks";

// Before the first search with the login (issue #104): the same risk the login scans carry.
const accepted = ref(false);
watch(loginSearchNotice, () => (accepted.value = false));
const names = computed(() => (loginSearchNotice.value?.networks ?? []).map((n) => networkInfo[n].name).join(", "));
</script>

<template>
  <div v-if="loginSearchNotice" class="fixed inset-0 z-30 grid place-items-center p-4" role="dialog" aria-modal="true" :aria-label="$t('sync.search.noticeTitle')" data-testid="login-search-notice">
    <div class="absolute inset-0 bg-base-content/25" @click="loginSearchNotice.answer(false)"></div>
    <div class="relative w-full max-w-lg rounded-box border border-base-300 bg-base-100 p-6 shadow-xl">
      <h2 class="text-lg font-semibold">{{ $t("sync.search.noticeTitle") }}</h2>
      <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-base-content/80">
        <li>{{ $t("sync.search.noticeWhat", { networks: names }) }}</li>
        <li>{{ $t("profiles.scan.riskTerms", { network: names }) }}</li>
        <li>{{ $t("profiles.scan.riskSlow") }}</li>
        <li>{{ $t("profiles.scan.riskLocal", { network: names }) }}</li>
      </ul>
      <label class="mt-4 flex items-start gap-2 text-sm"><input v-model="accepted" type="checkbox" class="checkbox checkbox-warning checkbox-sm mt-0.5" />{{ $t("sync.search.accept") }}</label>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost btn-sm" @click="loginSearchNotice.answer(false)">{{ $t("common.cancel") }}</button>
        <button type="button" class="btn btn-warning btn-sm" :disabled="!accepted" @click="loginSearchNotice.answer(true)">{{ $t("sync.search.start") }}</button>
      </div>
    </div>
  </div>
</template>
