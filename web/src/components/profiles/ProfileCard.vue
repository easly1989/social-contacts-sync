<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ExternalLink, Link } from "lucide-vue-next";

import ContactAvatar from "../ContactAvatar.vue";
import NetworkMark from "./NetworkMark.vue";
import ProfilePhoto from "./ProfilePhoto.vue";
import { api, withGoogleDetail } from "../../api";
import { linkRequest, ProfilePick, toggle } from "../../profilePick";
import { notify, notifyError } from "../../toasts";
import { ProfileCandidate, ProfileSuggestion } from "../../../../interfaces/api";

// One contact and the profiles that may be theirs (issues #61, #65): tick
// every one that's right, and at most one to give its photo.
const props = defineProps<{ suggestion: ProfileSuggestion; pick: ProfilePick; selected?: boolean; selectable?: boolean; disabled?: boolean; large?: boolean }>();
const emit = defineEmits<{ "update:pick": [pick: ProfilePick]; "update:selected": [selected: boolean]; done: [] }>();
const { t } = useI18n();

const busy = ref(false);
const wantsPhoto = computed(() => !props.suggestion.hasPhoto || Boolean(props.suggestion.placeholder));
const ticked = (c: ProfileCandidate) => props.pick.ticked.includes(c.person.id);
const why = (c: ProfileCandidate) =>
  [c.person.relation ? t(`profiles.relation.${c.person.relation}`) : t(`profiles.from.${c.person.source}`), t(`profiles.reason.${c.reason}`), c.person.detail].filter(Boolean).join(" · ");
const handle = (c: ProfileCandidate) => (c.person.network === "linkedin" || c.person.network === "facebook" ? c.person.url.replace(/^https:\/\//, "") : `@${c.person.handle}`);

function tick(c: ProfileCandidate): void {
  emit("update:pick", toggle(props.pick, c.person.id, wantsPhoto.value, props.suggestion.candidates));
}
function usePhoto(c: ProfileCandidate): void {
  emit("update:pick", { ...props.pick, photoFrom: props.pick.photoFrom === c.person.id ? undefined : c.person.id });
}

async function act(kind: "link" | "none" | "skip"): Promise<void> {
  if (busy.value || props.disabled) return;
  if (kind === "link" && !props.pick.ticked.length) return;
  busy.value = true;
  try {
    if (kind === "link") {
      const { photoWanted, photoSet } = await api.linkProfiles(linkRequest(props.suggestion, props.pick));
      notify(photoWanted && !photoSet ? t("profiles.linkedNoPhoto") : t("profiles.linkedDone", { name: props.suggestion.name }));
    } else if (kind === "none") {
      await api.rejectProfiles(props.suggestion.contactId, props.suggestion.candidates.map((c) => c.person.id));
    } else {
      await api.skipProfiles(props.suggestion.contactId);
    }
    emit("done");
  } catch (e) {
    notifyError(withGoogleDetail(t("profiles.errors.link"), e), e);
  }
  busy.value = false;
}

defineExpose({ act, tickAt: (i: number) => props.suggestion.candidates[i] && tick(props.suggestion.candidates[i]) });
</script>

<template>
  <section class="rounded-box border bg-base-100" :class="[selected ? 'border-primary/60' : 'border-base-300', large ? 'p-6' : 'p-4']" data-testid="profile-card">
    <div class="flex flex-wrap items-center gap-3">
      <input
        v-if="selectable"
        type="checkbox"
        class="checkbox checkbox-primary checkbox-sm"
        :checked="selected"
        :disabled="disabled"
        :aria-label="$t('profiles.list.select', { name: suggestion.name })"
        @change="emit('update:selected', ($event.target as HTMLInputElement).checked)"
      />
      <ContactAvatar :name="suggestion.name" :photo-url="suggestion.photoUrl" :size="large ? 'size-16' : 'size-10'" />
      <div class="min-w-[10rem] flex-1">
        <component :is="large ? 'h2' : 'h3'" class="font-semibold" :class="large ? 'text-xl font-bold' : ''">{{ suggestion.name || $t("cleanup.noName") }}</component>
        <p class="text-xs text-base-content/60">
          {{ [suggestion.detail, suggestion.placeholder ? $t("contacts.placeholder") : suggestion.hasPhoto ? $t("profiles.hasPhoto") : $t("contacts.noPhoto")].filter(Boolean).join(" · ") }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" class="btn btn-ghost btn-xs" :disabled="busy || disabled" @click="act('skip')">{{ $t("profiles.skip") }}<kbd v-if="large" class="kbd kbd-xs">S</kbd></button>
        <button type="button" class="btn btn-ghost btn-xs" :disabled="busy || disabled" @click="act('none')">{{ $t("profiles.none") }}<kbd v-if="large" class="kbd kbd-xs">N</kbd></button>
        <button type="button" class="btn btn-primary btn-xs" :disabled="busy || disabled || !pick.ticked.length" @click="act('link')">
          <span v-if="busy" class="loading loading-spinner loading-xs"></span><Link v-else class="size-3.5" />{{ $t("profiles.linkN", { count: pick.ticked.length }, pick.ticked.length) }}<kbd v-if="large" class="kbd kbd-xs">Enter</kbd>
        </button>
      </div>
    </div>

    <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" :class="{ 'sm:pl-8': selectable }">
      <div v-for="(c, i) in suggestion.candidates" :key="c.person.id" class="rounded-xl border-2 p-2.5" :class="ticked(c) ? 'border-primary bg-primary/5' : 'border-base-300'">
        <label class="flex cursor-pointer items-center gap-3">
          <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" :checked="ticked(c)" :disabled="disabled" :aria-label="`${c.person.name ?? c.person.handle} · ${handle(c)}`" @change="tick(c)" />
          <ProfilePhoto :person="c.person" size="size-11" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold"><kbd v-if="large && i < 9" class="kbd kbd-xs mr-1">{{ i + 1 }}</kbd>{{ c.person.name ?? c.person.handle }}</div>
            <div class="truncate text-xs text-base-content/60">{{ handle(c) }}</div>
            <div class="mt-1 flex flex-wrap items-center gap-1.5"><NetworkMark :network="c.person.network" badge /><span class="text-[11px] text-base-content/60">{{ why(c) }}</span></div>
          </div>
          <a :href="c.person.url" target="_blank" rel="noopener" class="btn btn-ghost btn-xs btn-square" :aria-label="$t('profiles.open')" @click.stop><ExternalLink class="size-3.5" /></a>
        </label>
        <label v-if="ticked(c) && c.person.photoUrl" class="ml-8 mt-2 flex cursor-pointer items-center gap-2 text-xs" :class="pick.photoFrom === c.person.id ? 'font-medium text-primary' : 'text-base-content/60'">
          <input type="checkbox" class="checkbox checkbox-primary checkbox-xs rounded-full" :checked="pick.photoFrom === c.person.id" :disabled="disabled" @change="usePhoto(c)" />{{ $t("profiles.useThisPhoto") }}
        </label>
      </div>
    </div>
    <p v-if="suggestion.hasPhoto && !suggestion.placeholder" class="mt-2 text-xs text-base-content/50" :class="{ 'sm:pl-8': selectable }">{{ $t("profiles.keepsPhoto") }}</p>
  </section>
</template>
