<script setup lang="ts">
import { networkInfo } from "../../profileNetworks";
import { SocialNetwork } from "../../../../interfaces/api";

// A network's initial on its colour (no third-party logos in the app).
defineProps<{ network: SocialNetwork; size?: string; badge?: boolean }>();
</script>

<template>
  <span
    v-if="badge"
    class="inline-flex items-center rounded-full px-1.5 py-px text-[11px] font-medium"
    :style="{ background: `${networkInfo[network].color}1f`, color: networkInfo[network].color }"
    >{{ networkInfo[network].name }}</span
  >
  <span v-else class="grid shrink-0 place-items-center rounded-lg text-xs font-bold text-white" :class="size ?? 'size-8'" :style="{ background: networkInfo[network].color }" aria-hidden="true">{{
    networkInfo[network].name[0]
  }}</span>
</template>
