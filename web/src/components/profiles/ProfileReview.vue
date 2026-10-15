<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import ProfileCard from "./ProfileCard.vue";
import { ProfilePick } from "../../profilePick";
import { ProfileSuggestion } from "../../../../interfaces/api";

// One contact at a time (issue #61), with the keyboard: Enter links what's
// ticked, N is "None of these", S skips, 1–9 tick or untick a profile.
defineProps<{ suggestion: ProfileSuggestion; pick: ProfilePick; total: number }>();
const emit = defineEmits<{ "update:pick": [pick: ProfilePick]; done: [] }>();
const card = ref<InstanceType<typeof ProfileCard>>();

function onKey(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Enter") void card.value?.act("link");
  else if (event.key.toLowerCase() === "n") void card.value?.act("none");
  else if (event.key.toLowerCase() === "s") void card.value?.act("skip");
  else if (/^[1-9]$/.test(event.key)) card.value?.tickAt(Number(event.key) - 1);
  else return;
  event.preventDefault();
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="space-y-2" data-testid="profile-review">
    <p class="text-right text-sm text-base-content/60">{{ $t("profiles.toReview", total) }}</p>
    <ProfileCard ref="card" :suggestion="suggestion" :pick="pick" large @update:pick="emit('update:pick', $event)" @done="emit('done')" />
    <p class="text-xs text-base-content/50">{{ $t("profiles.keys") }}</p>
  </div>
</template>
