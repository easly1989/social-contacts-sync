<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowLeftRight, ArrowRight, Check, ExternalLink, Link, Lock, Pin } from "lucide-vue-next";

import ContactAvatar from "../ContactAvatar.vue";
import NetworkMark from "./NetworkMark.vue";
import ProfilePhoto from "./ProfilePhoto.vue";
import ProfileLinkLookup from "../ProfileLinkLookup.vue";
import SourceBadge from "../SourceBadge.vue";
import { api, withGoogleDetail } from "../../api";
import { networkInfo } from "../../profileNetworks";
import { addLink, hasChoice, linkRequest, PhotoOption, photoCandidates, pickPhoto, ProfilePick, toggle } from "../../profilePick";
import { sourceInfo } from "../../sources";
import { notify, notifyError } from "../../toasts";
import { ProfileCandidate, ProfileSuggestion, SocialPerson, SourceId } from "../../../../interfaces/api";

// One contact in Sync's To review (issues #61, #65, #81): tick the profiles
// that are really them and pick one photo among theirs; Confirm does both.
// A sync adds its photos here, and asks about a pinned photo changed outside the app (issue #82).
const props = defineProps<{ suggestion: ProfileSuggestion; pick: ProfilePick; selected?: boolean; selectable?: boolean; disabled?: boolean; large?: boolean }>();
const emit = defineEmits<{ "update:pick": [pick: ProfilePick]; "update:selected": [selected: boolean]; done: [] }>();
const { t } = useI18n();

const busy = ref(false);
const photos = computed(() => photoCandidates(props.suggestion, props.pick));
const chosen = computed(() => photos.value.find((p) => p.id === props.pick.photoFrom));
const queued = computed(() => props.suggestion.queue);
const changed = computed(() => queued.value?.kind === "changed");
// A sync found a photo unlike the one the contact has.
const different = computed(() => queued.value?.kind === "photo" && props.suggestion.hasPhoto && !props.suggestion.placeholder);
const sourceName = (source: SourceId, network?: string) => network ?? sourceInfo[source].name;
/** Where a photo comes from, in words: "Instagram", "WhatsApp"… */
const optionName = (o: PhotoOption) => (o.person ? networkInfo[o.person.network].name : o.queued ? sourceName(o.queued.source, o.queued.network) : o.lookup!.network);
const caption = (o: PhotoOption) => (o.person ? (o.suggested ? handle(o.person) : t("sync.card.linked")) : o.queued ? o.queued.matchedBy : o.lookup!.url.replace(/^https:\/\//, ""));
const pinnedName = computed(() => (queued.value?.pinned ? sourceName(queued.value.pinned.source, queued.value.pinned.network) : ""));
const ticked = (c: ProfileCandidate) => props.pick.ticked.includes(c.person.id);
const why = (c: ProfileCandidate) =>
  [c.person.relation ? t(`profiles.relation.${c.person.relation}`) : t(`profiles.from.${c.person.source}`), t(`profiles.reason.${c.reason}`), c.person.detail].filter(Boolean).join(" · ");
const handle = (p: SocialPerson) => (p.network === "linkedin" || p.network === "facebook" ? p.url.replace(/^https:\/\//, "") : `@${p.handle}`);
const profilesN = computed(() => t("profiles.list.profilesN", props.pick.ticked.length));
const confirmLabel = computed(() => {
  const photo = Boolean(chosen.value);
  if (props.pick.ticked.length) return photo ? t("sync.card.confirmBoth", { profiles: profilesN.value }) : t("sync.card.confirmProfiles", { profiles: profilesN.value });
  if (chosen.value && !chosen.value.person) return t("sync.card.use", { source: optionName(chosen.value) });
  return photo ? t("sync.card.confirmPhoto") : t("sync.card.confirm");
});

const tick = (c: ProfileCandidate) => emit("update:pick", toggle(props.pick, c.person.id, props.suggestion));
const choose = (id: string | undefined) => emit("update:pick", pickPhoto(props.pick, id, props.suggestion));

/**
 * "link" confirms the card; "back" goes back to the pinned source's photo;
 * "keep" keeps the contact's photo and the sync's aren't offered again;
 * "none" is "None of these" for the profiles, and keeps the photo too.
 */
async function act(kind: "link" | "back" | "keep" | "none" | "skip"): Promise<void> {
  if (busy.value || props.disabled) return;
  // On a photo changed outside the app, Enter keeps it.
  if (kind === "link" && changed.value && !props.pick.ticked.length) kind = "keep";
  if (kind === "link" && !hasChoice(props.pick)) return;
  if (kind === "none" && !props.suggestion.candidates.length) kind = "keep";
  busy.value = true;
  try {
    if (kind === "link" || kind === "back") {
      const request = linkRequest(props.suggestion, props.pick);
      const { photoWanted, photoSet } = await api.linkProfiles(kind === "back" ? { ...request, photoFrom: queued.value!.photos[0].id } : request);
      notify(photoWanted && !photoSet ? t("profiles.linkedNoPhoto") : t("profiles.linkedDone", { name: props.suggestion.name }));
    } else if (kind === "keep") {
      await api.keepCurrentPhoto(props.suggestion.contactId);
    } else if (kind === "none") {
      await api.rejectProfiles(props.suggestion.contactId, props.suggestion.candidates.map((c) => c.person.id));
      if (queued.value) await api.keepCurrentPhoto(props.suggestion.contactId);
    } else {
      await api.skipProfiles(props.suggestion.contactId);
    }
    emit("done");
  } catch (e) {
    notifyError(withGoogleDetail(t("profiles.errors.link"), e), e);
  }
  busy.value = false;
}

defineExpose({ act, pickAt: (i: number) => photos.value[i] && choose(photos.value[i].id) });
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
      <ContactAvatar :name="suggestion.name" :photo-url="suggestion.photoUrl" :size="large ? 'size-14' : 'size-10'" />
      <div class="min-w-[10rem] flex-1">
        <component :is="large ? 'h2' : 'h3'" class="flex flex-wrap items-center gap-2 font-semibold" :class="large ? 'text-xl font-bold' : ''"
          >{{ suggestion.name || $t("cleanup.noName") }}<span v-if="suggestion.photoKept" class="badge badge-info badge-soft badge-xs gap-1 font-normal"><Lock class="size-3" />{{ $t("contacts.kept") }}</span
          ><span v-else-if="changed" class="badge badge-warning badge-soft badge-xs font-normal">{{ $t("sync.card.changed") }}</span
          ><span v-else-if="different" class="badge badge-primary badge-soft badge-xs font-normal">{{ $t("sync.card.different") }}</span></component
        >
        <p class="text-xs text-base-content/60">
          {{ [suggestion.detail, suggestion.placeholder ? $t("contacts.placeholder") : suggestion.hasPhoto ? $t("profiles.hasPhoto") : $t("contacts.noPhoto")].filter(Boolean).join(" · ") }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" class="btn btn-ghost btn-xs" :disabled="busy || disabled" @click="act('skip')">{{ $t("profiles.skip") }}<kbd v-if="large" class="kbd kbd-xs">S</kbd></button>
        <button v-if="suggestion.candidates.length" type="button" class="btn btn-ghost btn-xs" :disabled="busy || disabled" @click="act('none')">{{ $t("profiles.none") }}<kbd v-if="large" class="kbd kbd-xs">N</kbd></button>
        <button v-else-if="queued && !changed" type="button" class="btn btn-ghost btn-xs" :disabled="busy || disabled" @click="act('keep')">
          {{ suggestion.hasPhoto ? $t("sync.card.keepCurrent") : $t("sync.card.leaveEmpty") }}<kbd v-if="large" class="kbd kbd-xs">N</kbd>
        </button>
        <template v-if="changed">
          <button v-if="queued!.photos.length" type="button" class="btn btn-xs" :disabled="busy || disabled" @click="act('back')">{{ $t("sync.card.backTo", { source: pinnedName }) }}</button>
          <button v-if="!pick.ticked.length" type="button" class="btn btn-primary btn-xs" :disabled="busy || disabled" @click="act('keep')">
            <span v-if="busy" class="loading loading-spinner loading-xs"></span><Check v-else class="size-3.5" />{{ $t("sync.card.keepThis") }}<kbd v-if="large" class="kbd kbd-xs">Enter</kbd>
          </button>
        </template>
        <button v-if="!changed || pick.ticked.length" type="button" class="btn btn-primary btn-xs" :disabled="busy || disabled || !hasChoice(pick)" @click="act('link')">
          <span v-if="busy" class="loading loading-spinner loading-xs"></span><Check v-else class="size-3.5" />{{ confirmLabel }}<kbd v-if="large" class="kbd kbd-xs">Enter</kbd>
        </button>
      </div>
    </div>

    <div v-if="changed" class="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-warning/10 p-4" :class="{ 'sm:ml-8': selectable }" data-testid="changed-photo">
      <figure class="flex flex-col items-center gap-1.5 text-center">
        <ContactAvatar :name="suggestion.name" :photo-url="suggestion.photoUrl" size="size-14" />
        <figcaption class="text-[11px] text-base-content/60">{{ $t("sync.card.inGoogle") }}</figcaption>
      </figure>
      <ArrowLeftRight class="size-4 text-base-content/40" aria-hidden="true" />
      <figure class="flex flex-col items-center gap-1.5 text-center">
        <img v-if="queued!.photos.length" :src="api.queuePhotoUrl(queued!.photos[0].id)" :alt="$t('sync.card.fromSource', { source: pinnedName })" class="size-14 rounded-full object-cover" />
        <span v-else class="grid size-14 place-items-center rounded-full border-2 border-dashed border-base-300 text-[11px] text-base-content/50">?</span>
        <figcaption><SourceBadge :source="queued!.pinned?.source ?? 'links'" :label="queued!.pinned?.network" /></figcaption>
      </figure>
      <p class="min-w-[12rem] flex-1 text-sm text-base-content/70">{{ $t("sync.card.changedText", { source: pinnedName }) }}</p>
    </div>

    <div v-if="photos.length || suggestion.candidates.length" class="mt-4 grid gap-5" :class="[{ 'sm:pl-8': selectable }, photos.length && suggestion.candidates.length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]' : '']">
      <div v-if="photos.length">
        <h4 class="text-sm font-semibold">{{ $t("sync.card.photo") }}</h4>
        <div role="radiogroup" :aria-label="$t('sync.card.photoFor', { name: suggestion.name })" class="mt-3 flex flex-wrap items-start gap-x-4 gap-y-3">
          <label class="flex w-20 cursor-pointer flex-col items-center gap-1.5 rounded-xl p-1 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
            <input type="radio" class="sr-only" :name="`photo-${suggestion.contactId}`" :checked="!pick.photoFrom" :disabled="disabled" @change="choose(undefined)" />
            <span class="rounded-full p-0.5 ring-2" :class="pick.photoFrom ? 'ring-transparent' : 'ring-primary'">
              <ContactAvatar v-if="suggestion.hasPhoto" :name="suggestion.name" :photo-url="suggestion.photoUrl" size="size-14" />
              <span v-else class="grid size-14 place-items-center rounded-full border-2 border-dashed border-base-300 text-[11px] text-base-content/50">{{ $t("sync.card.none") }}</span>
            </span>
            <span class="text-[11px] text-base-content/60">{{ suggestion.hasPhoto ? $t("sync.card.current") : $t("sync.card.keepNone") }}</span>
          </label>
          <ArrowRight class="mt-6 size-4 shrink-0 text-base-content/30" aria-hidden="true" />
          <label
            v-for="(c, i) in photos"
            :key="c.id"
            class="flex w-24 cursor-pointer flex-col items-center gap-1.5 rounded-xl p-1 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
          >
            <input type="radio" class="sr-only" :name="`photo-${suggestion.contactId}`" :checked="pick.photoFrom === c.id" :disabled="disabled" :aria-label="`${optionName(c)} · ${c.person ? handle(c.person) : caption(c)}`" @change="choose(c.id)" />
            <span class="relative rounded-full p-0.5 ring-2" :class="pick.photoFrom === c.id ? 'ring-primary' : 'ring-transparent'">
              <ProfilePhoto v-if="c.person" :person="c.person" size="size-14" plain />
              <img v-else :src="c.queued ? api.queuePhotoUrl(c.id) : `data:image/jpeg;base64,${c.lookup!.photo}`" alt="" class="size-14 rounded-full object-cover" />
              <Check v-if="pick.photoFrom === c.id" class="absolute -right-1 -top-1 size-5 rounded-full bg-primary p-0.5 text-primary-content" aria-hidden="true" />
            </span>
            <span class="flex items-center gap-1"
              ><kbd v-if="large && i < 9" class="kbd kbd-xs">{{ i + 1 }}</kbd><NetworkMark v-if="c.person" :network="c.person.network" badge /><SourceBadge
                v-else
                :source="c.queued?.source ?? 'links'"
                :label="c.queued ? c.queued.network : c.lookup!.network"
            /></span>
            <span class="w-full truncate text-[11px] text-base-content/60">{{ caption(c) }}</span>
          </label>
        </div>
        <p v-if="chosen" class="mt-3 flex items-center gap-1.5 text-xs text-primary"><Pin class="size-3.5 shrink-0" />{{ $t("sync.card.pinNote", { network: optionName(chosen) }) }}</p>
        <p v-else-if="suggestion.hasPhoto && !suggestion.placeholder" class="mt-3 text-xs text-base-content/50">{{ $t("profiles.keepsPhoto") }}</p>
      </div>

      <div v-if="suggestion.candidates.length">
        <h4 class="text-sm font-semibold">{{ $t("sync.card.profiles") }}</h4>
        <div class="mt-3 grid gap-2" :class="{ 'sm:grid-cols-2 xl:grid-cols-3': !photos.length }">
          <div v-for="c in suggestion.candidates" :key="c.person.id" class="rounded-xl border-2 p-2.5" :class="ticked(c) ? 'border-primary bg-primary/5' : 'border-base-300'">
            <label class="flex cursor-pointer items-center gap-3">
              <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" :checked="ticked(c)" :disabled="disabled" :aria-label="`${c.person.name ?? c.person.handle} · ${handle(c.person)}`" @change="tick(c)" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5"><NetworkMark :network="c.person.network" badge /><span class="truncate text-sm font-semibold">{{ handle(c.person) }}</span></div>
                <div class="mt-0.5 text-[11px] text-base-content/60">{{ [c.person.name, why(c)].filter(Boolean).join(" · ") }}</div>
              </div>
              <a :href="c.person.url" target="_blank" rel="noopener" class="btn btn-ghost btn-xs btn-square" :aria-label="$t('profiles.open')" @click.stop><ExternalLink class="size-3.5" /></a>
            </label>
          </div>
        </div>
      </div>
    </div>
    <p v-if="suggestion.photoKept" class="mt-3 flex items-center gap-1.5 text-xs text-base-content/60" :class="{ 'sm:pl-8': selectable }"><Lock class="size-3.5" />{{ $t("profiles.photoKept") }}</p>
    <details v-else-if="!changed" class="mt-3 text-xs" :class="{ 'sm:pl-8': selectable }" data-testid="card-link">
      <summary class="flex cursor-pointer items-center gap-1.5 text-base-content/60"><Link class="size-3.5" />{{ $t("links.reviewPrompt") }}</summary>
      <ProfileLinkLookup class="mt-2 max-w-md" :label="$t('sync.card.linkFor', { name: suggestion.name })" @found="emit('update:pick', addLink(pick, $event))" />
    </details>
  </section>
</template>
