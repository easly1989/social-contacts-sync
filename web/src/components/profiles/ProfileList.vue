<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Square } from "lucide-vue-next";

import ProfileCard from "./ProfileCard.vue";
import { api } from "../../api";
import { number } from "../../format";
import { hasChoice, linkRequest, ProfilePick } from "../../profilePick";
import { notifyError } from "../../toasts";
import { ProfileBulkState, ProfileSuggestion } from "../../../../interfaces/api";

// Every contact to review, one card each (issues #65, #81): select some, then
// confirm what each has ticked in one go, in the background at Google's pace.
const props = defineProps<{ queue: ProfileSuggestion[]; picks: Record<string, ProfilePick>; bulk?: ProfileBulkState }>();
const emit = defineEmits<{ "update:pick": [contactId: string, pick: ProfilePick]; changed: [] }>();
const { t, locale } = useI18n();

const pageSize = 20;
const shown = ref(pageSize);
const visible = computed(() => props.queue.slice(0, shown.value));

const selected = ref(new Set<string>());
// Contacts that left the queue leave the selection too.
watch(
  () => props.queue.map((s) => s.contactId).join(),
  () => {
    const ids = new Set(props.queue.map((s) => s.contactId));
    selected.value = new Set([...selected.value].filter((id) => ids.has(id)));
  }
);
const allSelected = computed(() => props.queue.length > 0 && selected.value.size === props.queue.length);
function selectAll(on: boolean): void {
  selected.value = new Set(on ? props.queue.map((s) => s.contactId) : []);
}
function select(id: string, on: boolean): void {
  const next = new Set(selected.value);
  if (on) next.add(id);
  else next.delete(id);
  selected.value = next;
}

const running = computed(() => Boolean(props.bulk?.running));
const chosen = computed(() => props.queue.filter((s) => selected.value.has(s.contactId)));
const toLink = computed(() => chosen.value.filter((s) => props.picks[s.contactId] && hasChoice(props.picks[s.contactId])));

async function linkSelected(): Promise<void> {
  try {
    await api.linkProfilesInBulk(toLink.value.map((s) => linkRequest(s, props.picks[s.contactId])));
    selected.value = new Set();
  } catch (e) {
    notifyError(t("profiles.errors.link"), e);
  }
  emit("changed");
}
async function stop(): Promise<void> {
  await api.stopBulkLink().catch(() => undefined);
  emit("changed");
}
async function noneSelected(): Promise<void> {
  try {
    for (const s of chosen.value) {
      if (s.candidates.length) await api.rejectProfiles(s.contactId, s.candidates.map((c) => c.person.id));
      // A sync's photos: the contact keeps the one it has.
      if (s.queue) await api.keepCurrentPhoto(s.contactId);
    }
    selected.value = new Set();
  } catch (e) {
    notifyError(t("profiles.errors.link"), e);
  }
  emit("changed");
}
</script>

<template>
  <div class="space-y-3" data-testid="profile-list">
    <div class="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-2.5 shadow-sm">
      <label class="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" :checked="allSelected" :disabled="running" @change="selectAll(($event.target as HTMLInputElement).checked)" />{{ $t("profiles.list.selectAll") }}
      </label>
      <span class="text-sm text-base-content/60">{{ $t("profiles.list.selected", { selected: number(selected.size, locale), total: number(queue.length, locale) }) }}</span>
      <span class="flex-1"></span>
      <template v-if="running && bulk">
        <div class="w-72 max-w-full" data-testid="bulk-progress">
          <div class="text-xs text-base-content/60">{{ $t("profiles.list.linking", { done: bulk.done, total: bulk.total }) }}</div>
          <progress class="progress progress-primary h-1.5 w-full" :value="bulk.done" :max="bulk.total || 1"></progress>
        </div>
        <button type="button" class="btn btn-sm" @click="stop"><Square class="size-4" />{{ $t("profiles.sources.stop") }}</button>
      </template>
      <template v-else>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="!chosen.length" @click="noneSelected">{{ $t("profiles.none") }}</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!toLink.length" @click="linkSelected">
          <Check class="size-4" />{{ $t("sync.confirmSelected", { count: number(toLink.length, locale) }, toLink.length) }}
        </button>
      </template>
      <slot name="view" />
    </div>

    <ProfileCard
      v-for="s in visible"
      :key="s.contactId"
      :suggestion="s"
      :pick="picks[s.contactId]"
      selectable
      :selected="selected.has(s.contactId)"
      :disabled="running"
      @update:pick="emit('update:pick', s.contactId, $event)"
      @update:selected="select(s.contactId, $event)"
      @done="emit('changed')"
    />
    <div v-if="queue.length > shown" class="text-center">
      <button type="button" class="btn btn-ghost btn-sm" @click="shown += pageSize">{{ $t("profiles.list.more", { count: Math.min(pageSize, queue.length - shown) }) }}</button>
    </div>
  </div>
</template>
