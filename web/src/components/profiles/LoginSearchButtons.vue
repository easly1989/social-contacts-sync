<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { LogIn } from "lucide-vue-next";

import BrandIcon from "../BrandIcon.vue";
import { api } from "../../api";
import { brandColors } from "../../brands";
import { confirmLoginSearch, loginSearchNetworks, signedIn, socialLogins } from "../../loginSearch";
import { networkInfo } from "../../profileNetworks";
import { notify, notifyError } from "../../toasts";
import { ProfileSuggestion, SocialNetwork } from "../../../../interfaces/api";

// A card's "Search Instagram / Facebook / LinkedIn" (issue #104), or "Sign in to …" where the app has no login.
const props = defineProps<{ suggestion: ProfileSuggestion; disabled?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const { t } = useI18n();
const busy = ref<SocialNetwork>();

async function search(network: SocialNetwork): Promise<void> {
  const name = networkInfo[network].name;
  if (!(await confirmLoginSearch([network]))) return;
  busy.value = network;
  try {
    const result = await api.loginSearch(props.suggestion.contactId, network);
    // "Copy error" carries the site's reason, such as "error:404".
    if (result.stopped) notifyError(t(`sync.search.stopped.${result.stopped.startsWith("error") ? "error" : result.stopped}`, { network: name }), undefined, result.stopped);
    else if (result.suggested) notify(t("sync.search.found", { network: name, count: result.suggested }, result.suggested));
    else notify(t("sync.search.none", { network: name, name: props.suggestion.name }));
    emit("changed");
  } catch (e) {
    notifyError(t("sync.search.stopped.error", { network: name }), e);
  }
  busy.value = undefined;
}

async function signIn(network: SocialNetwork): Promise<void> {
  busy.value = network;
  try {
    await api.profileScan("login", network);
    socialLogins.value = await api.socialLogins();
  } catch (e) {
    notifyError(t("sync.search.stopped.error", { network: networkInfo[network].name }), e);
  }
  busy.value = undefined;
}
</script>

<template>
  <div v-if="socialLogins.length" data-testid="login-search">
    <div class="flex flex-wrap gap-2">
      <template v-for="network in loginSearchNetworks" :key="network">
        <button
          v-if="signedIn(network)"
          type="button"
          class="btn btn-sm border-0 text-white"
          :style="{ background: brandColors[network] }"
          :disabled="disabled || Boolean(busy)"
          @click="search(network)"
        >
          <span v-if="busy === network" class="loading loading-spinner loading-xs"></span><BrandIcon v-else :brand="network" class="size-3.5" />{{ $t("sync.search.on", { network: networkInfo[network].name }) }}
        </button>
        <button v-else type="button" class="btn btn-sm" :disabled="disabled || Boolean(busy)" @click="signIn(network)">
          <span v-if="busy === network" class="loading loading-spinner loading-xs"></span><LogIn v-else class="size-3.5" />{{ $t("sync.search.signIn", { network: networkInfo[network].name }) }}
        </button>
      </template>
    </div>
    <p class="mt-2 text-xs text-base-content/60">{{ $t("sync.search.lead") }}</p>
  </div>
</template>
