<script setup lang="ts">
import { SourceId } from "../../../interfaces/api";
import { sourceInfo } from "../sources";

defineProps<{ source: SourceId; size?: string; iconSize?: string }>();
</script>

<template>
  <div class="grid shrink-0 place-items-center rounded-xl text-white" :class="size ?? 'size-9'" :style="{ background: sourceInfo[source].color }">
    <component :is="sourceInfo[source].icon" :class="iconSize ?? 'size-5'" />
  </div>
</template>
