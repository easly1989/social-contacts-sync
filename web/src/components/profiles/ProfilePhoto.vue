<script setup lang="ts">
import { computed, ref, watch } from "vue";

import NetworkMark from "./NetworkMark.vue";
import PhotoZoom from "../PhotoZoom.vue";
import { profilePhotoSrc } from "../../profilePick";
import { SocialPerson } from "../../../../interfaces/api";

// A suggested profile's photo, or its network's mark when there's none or it
// doesn't load (issue #65).
const props = defineProps<{ person: SocialPerson; size?: string }>();
const failed = ref(false);
const src = computed(() => profilePhotoSrc(props.person));
watch(src, () => (failed.value = false));
</script>

<template>
  <PhotoZoom v-if="src && !failed" :src="src" :name="person.name">
    <img :src="src" alt="" class="shrink-0 rounded-full bg-base-200 object-cover" :class="size ?? 'size-12'" loading="lazy" @error="failed = true" />
  </PhotoZoom>
  <NetworkMark v-else :network="person.network" :size="`${size ?? 'size-12'} rounded-full`" />
</template>
