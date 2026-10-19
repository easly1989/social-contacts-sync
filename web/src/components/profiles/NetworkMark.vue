<script setup lang="ts">
import BrandIcon from "../BrandIcon.vue";
import SourceBadge from "../SourceBadge.vue";
import { networkInfo } from "../../profileNetworks";
import { SocialNetwork } from "../../../../interfaces/api";

// A network's logo on its colour (issue #104); as a badge, the same one a profile link's photo wears.
defineProps<{ network: SocialNetwork; size?: string; badge?: boolean }>();
</script>

<template>
  <SourceBadge v-if="badge" source="links" :network="networkInfo[network].name" />
  <span v-else class="grid shrink-0 place-items-center rounded-lg text-white" :class="size ?? 'size-8'" :style="{ background: networkInfo[network].color }" aria-hidden="true"
    ><BrandIcon :brand="network" class="size-1/2"
  /></span>
</template>
