<script setup lang="ts">
import { SourceId } from "../../../interfaces/api";
import { sourceInfo } from "../sources";

defineProps<{ source: SourceId }>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
    :style="{ background: `${sourceInfo[source].color}1f`, color: sourceInfo[source].text }"
  >
    <component :is="sourceInfo[source].icon" class="size-3" />{{ sourceInfo[source].name }}
  </span>
</template>
