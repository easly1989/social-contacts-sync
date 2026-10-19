<script setup lang="ts">
import { computed } from "vue";

import BrandIcon from "./BrandIcon.vue";
import { SourceId } from "../../../interfaces/api";
import { brandColors, brandOf } from "../brands";
import { sourceInfo } from "../sources";

// Where a photo comes from: the source, or for a profile link its network (issues #77, #104), with its logo and colour.
// `label` replaces the name shown, e.g. "Current · WhatsApp".
const props = defineProps<{ source: SourceId; network?: string; label?: string }>();
const brand = computed(() => brandOf(props.source === "links" ? props.network : props.source));
const color = computed(() => (brand.value && brandColors[brand.value]) || sourceInfo[props.source].color);
</script>

<template>
  <span
    class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
    :style="{ background: `${color}1f`, color: `color-mix(in oklab, ${color} 62%, var(--color-base-content))` }"
  >
    <BrandIcon v-if="brand" :brand="brand" class="size-3" /><component :is="sourceInfo[source].icon" v-else class="size-3" />{{ label ?? network ?? sourceInfo[source].name }}
  </span>
</template>
