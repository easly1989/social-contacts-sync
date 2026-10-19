<script setup lang="ts">
import BrandIcon from "./BrandIcon.vue";
import { SourceId } from "../../../interfaces/api";
import { brandOf } from "../brands";
import { sourceInfo } from "../sources";

defineProps<{ source: SourceId; size?: string; iconSize?: string }>();
</script>

<template>
  <div class="grid shrink-0 place-items-center rounded-xl text-white" :class="size ?? 'size-9'" :style="{ background: sourceInfo[source].color }">
    <BrandIcon v-if="brandOf(source)" :brand="source" :class="iconSize ?? 'size-5'" /><component :is="sourceInfo[source].icon" v-else :class="iconSize ?? 'size-5'" />
  </div>
</template>
