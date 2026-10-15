<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ExternalLink, Link } from "lucide-vue-next";

import ContactAvatar from "../ContactAvatar.vue";
import PhotoZoom from "../PhotoZoom.vue";
import NetworkMark from "./NetworkMark.vue";
import { api, withGoogleDetail } from "../../api";
import { ProfileCandidate, ProfileSuggestion } from "../../../../interfaces/api";

// One contact at a time, with the profiles that may be theirs (issue #61).
const props = defineProps<{ suggestion: ProfileSuggestion; position: number; total: number }>();
const emit = defineEmits<{ done: [notice?: string] }>();
const { t } = useI18n();

const chosen = ref(0);
const usePhoto = ref(true);
const busy = ref(false);
const error = ref<string>();

watch(
  () => props.suggestion.contactId,
  () => {
    chosen.value = 0;
    usePhoto.value = !props.suggestion.hasPhoto || Boolean(props.suggestion.placeholder);
    error.value = undefined;
  },
  { immediate: true }
);

const candidate = computed<ProfileCandidate | undefined>(() => props.suggestion.candidates[chosen.value]);
const why = (c: ProfileCandidate) =>
  [c.person.relation ? t(`profiles.relation.${c.person.relation}`) : t(`profiles.from.${c.person.source}`), t(`profiles.reason.${c.reason}`), c.person.detail].filter(Boolean).join(" · ");
const handle = (c: ProfileCandidate) => (c.person.network === "linkedin" || c.person.network === "facebook" ? c.person.url.replace(/^https:\/\//, "") : `@${c.person.handle}`);

async function act(kind: "link" | "none" | "skip"): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = undefined;
  try {
    if (kind === "link" && candidate.value) {
      const { linked, photoWanted } = await api.linkProfile(props.suggestion.contactId, candidate.value.person.id, usePhoto.value);
      emit("done", photoWanted && !linked.photoSet ? t("profiles.linkedNoPhoto") : t("profiles.linkedDone", { name: props.suggestion.name }));
    } else if (kind === "none") {
      await api.rejectProfiles(props.suggestion.contactId, props.suggestion.candidates.map((c) => c.person.id));
      emit("done");
    } else {
      await api.skipProfiles(props.suggestion.contactId);
      emit("done");
    }
  } catch (e) {
    error.value = withGoogleDetail(t("profiles.errors.link"), e);
  }
  busy.value = false;
}

function onKey(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === "Enter") act("link");
  else if (event.key.toLowerCase() === "n") act("none");
  else if (event.key.toLowerCase() === "s") act("skip");
  else if (event.key === "ArrowDown" || event.key === "ArrowRight") chosen.value = Math.min(chosen.value + 1, props.suggestion.candidates.length - 1);
  else if (event.key === "ArrowUp" || event.key === "ArrowLeft") chosen.value = Math.max(chosen.value - 1, 0);
  else return;
  event.preventDefault();
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));
</script>

<template>
  <section class="rounded-box border border-base-300 bg-base-100 p-6" data-testid="profile-review">
    <div class="flex flex-wrap items-center gap-4">
      <ContactAvatar :name="suggestion.name" :photo-url="suggestion.photoUrl" size="size-16" />
      <div class="min-w-[12rem] flex-1">
        <h2 class="text-xl font-bold">{{ suggestion.name || $t("cleanup.noName") }}</h2>
        <p class="text-sm text-base-content/60">
          {{ [suggestion.detail, suggestion.placeholder ? $t("contacts.placeholder") : suggestion.hasPhoto ? "" : $t("contacts.noPhoto")].filter(Boolean).join(" · ") }}
        </p>
      </div>
      <span class="text-sm text-base-content/60">{{ $t("profiles.toReview", total) }}</span>
    </div>

    <div class="mt-6 text-xs font-semibold uppercase tracking-wide text-base-content/50">{{ $t("profiles.couldBe") }}</div>
    <div class="mt-2 grid gap-3 md:grid-cols-2" role="radiogroup" :aria-label="$t('profiles.couldBe')">
      <label
        v-for="(c, i) in suggestion.candidates"
        :key="c.person.id"
        class="flex cursor-pointer items-center gap-4 rounded-xl border-2 p-3"
        :class="chosen === i ? 'border-primary bg-primary/5' : 'border-base-300'"
      >
        <input v-model="chosen" type="radio" class="radio radio-primary radio-sm" :value="i" :aria-label="`${c.person.name ?? c.person.handle} · ${handle(c)}`" />
        <PhotoZoom v-if="c.person.photoUrl" :src="c.person.photoUrl" :name="c.person.name"><img :src="c.person.photoUrl" alt="" class="size-14 rounded-full object-cover" referrerpolicy="no-referrer" /></PhotoZoom>
        <NetworkMark v-else :network="c.person.network" size="size-14" />
        <div class="min-w-0 flex-1">
          <div class="truncate font-semibold">{{ c.person.name ?? c.person.handle }}</div>
          <div class="truncate text-xs text-base-content/60">{{ handle(c) }}</div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5"><NetworkMark :network="c.person.network" badge /><span class="text-[11px] text-base-content/60">{{ why(c) }}</span></div>
        </div>
        <a :href="c.person.url" target="_blank" rel="noopener" class="btn btn-ghost btn-xs" @click.stop><ExternalLink class="size-3.5" />{{ $t("profiles.open") }}</a>
      </label>
    </div>

    <p v-if="error" class="mt-4 text-sm text-error" role="alert">{{ error }}</p>
    <div class="mt-6 flex flex-wrap items-center gap-3 border-t border-base-300 pt-5">
      <label class="flex items-center gap-2 text-sm">
        <input v-model="usePhoto" type="checkbox" class="checkbox checkbox-primary checkbox-sm" />{{ suggestion.hasPhoto && !suggestion.placeholder ? $t("profiles.usePhotoReplace") : $t("profiles.usePhoto") }}
      </label>
      <span class="flex-1"></span>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="act('skip')">{{ $t("profiles.skip") }} <kbd class="kbd kbd-xs">S</kbd></button>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="act('none')">{{ $t("profiles.none") }} <kbd class="kbd kbd-xs">N</kbd></button>
      <button type="button" class="btn btn-primary btn-sm" :disabled="busy || !candidate" @click="act('link')">
        <span v-if="busy" class="loading loading-spinner loading-xs"></span><Link v-else class="size-4" />{{ $t("profiles.link") }} <kbd class="kbd kbd-xs">Enter</kbd>
      </button>
    </div>
    <p class="mt-2 text-xs text-base-content/50">{{ $t("profiles.moreThanOne") }}</p>
  </section>
</template>
