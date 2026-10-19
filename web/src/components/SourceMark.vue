<script setup lang="ts">
import BrandIcon from "./BrandIcon.vue";
import { computed } from "vue";

import { SourceId, SourceKey } from "../../../interfaces/api";
import { brandOf } from "../brands";
import { linkNetworks } from "../profileLinks";
import { sourceInfo } from "../sources";

// A source's logo on its colour; a profile network is a source too (issue #107).
const props = defineProps<{ source: SourceId | SourceKey; size?: string; iconSize?: string }>();
const color = computed(() => sourceInfo[props.source as SourceId]?.color ?? linkNetworks[props.source]?.color);
const icon = computed(() => sourceInfo[props.source as SourceId]?.icon);
</script>

<template>
  <div class="grid shrink-0 place-items-center rounded-xl text-white" :class="size ?? 'size-9'" :style="{ background: color }" aria-hidden="true">
    <BrandIcon v-if="brandOf(source) || !icon" :brand="source" :class="iconSize ?? 'size-5'" /><component :is="icon" v-else :class="iconSize ?? 'size-5'" />
  </div>
</template>
