<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import ProfileCard from "./ProfileCard.vue";
import { ProfilePick } from "../../profilePick";
import { ProfileSuggestion, ReviewStep } from "../../../../interfaces/api";

// One contact at a time (issues #61, #81), with the keyboard: Enter confirms,
// N is "None of these", S skips, 1–9 pick a photo.
defineProps<{ suggestion: ProfileSuggestion; pick: ProfilePick; total: number; mode?: ReviewStep }>();
const emit = defineEmits<{ "update:pick": [pick: ProfilePick]; done: [] }>();
const card = ref<InstanceType<typeof ProfileCard>>();

function onKey(event: KeyboardEvent): void {
  // Typing in a field isn't a shortcut; the card's own checkboxes and photos are.
  const field = event.target instanceof HTMLInputElement && !["checkbox", "radio"].includes(event.target.type);
  if (field || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Enter") void card.value?.act("link");
  else if (event.key.toLowerCase() === "n") void card.value?.act("none");
  else if (event.key.toLowerCase() === "s") void card.value?.act("skip");
  else if (/^[1-9]$/.test(event.key)) card.value?.pickAt(Number(event.key) - 1);
  else return;
  event.preventDefault();
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="space-y-2" data-testid="profile-review">
    <p class="text-right text-sm text-base-content/60">{{ $t("profiles.toReview", total) }}</p>
    <ProfileCard ref="card" :suggestion="suggestion" :pick="pick" :mode="mode" large @update:pick="emit('update:pick', $event)" @done="emit('done')" />
    <p class="text-xs text-base-content/50">{{ $t("sync.keys") }}</p>
  </div>
</template>
