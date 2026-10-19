<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowLeftRight, ArrowRight, Check, ExternalLink, Link, Lock, Pin, Upload } from "lucide-vue-next";

import ContactAvatar from "../ContactAvatar.vue";
import LoginSearchButtons from "./LoginSearchButtons.vue";
import NetworkMark from "./NetworkMark.vue";
import PhotoZoom from "../PhotoZoom.vue";
import ProfilePhoto from "./ProfilePhoto.vue";
import ProfileLinkLookup from "../ProfileLinkLookup.vue";
import SourceBadge from "../SourceBadge.vue";
import { api, withGoogleDetail } from "../../api";
import { socialLogins } from "../../loginSearch";
import { networkInfo } from "../../profileNetworks";
import { addLink, forStep, hasChoice, linkRequest, PhotoOption, photoCandidates, pickPhoto, ProfilePick, toggle, wantsPhotoFor } from "../../profilePick";
import { sourceInfo } from "../../sources";
import { notify, notifyError } from "../../toasts";
import { ProfileCandidate, ProfileSuggestion, ReviewStep, SocialPerson, SourceId } from "../../../../interfaces/api";

// One contact in Sync's To review (issues #61, #65, #81): tick the profiles
// that are really them and pick one photo among theirs; Confirm does both.
// A sync adds its photos here, and asks about a pinned photo changed outside the app (issue #82).
// `mode` (issue #107): the Sync step showing the card, with only its profiles, its photos, or the ways to find something.
const props = defineProps<{ suggestion: ProfileSuggestion; pick: ProfilePick; selected?: boolean; selectable?: boolean; disabled?: boolean; large?: boolean; mode?: ReviewStep }>();
const emit = defineEmits<{ "update:pick": [pick: ProfilePick]; "update:selected": [selected: boolean]; done: [] }>();
const { t } = useI18n();

// What the step shows of the card: Profiles leaves the photos to Photos, and Photos the profiles to Profiles.
const card = computed<ProfileSuggestion>(() => forStep(props.mode, props.suggestion, props.pick).suggestion);
const shownPick = computed<ProfilePick>(() => forStep(props.mode, props.suggestion, props.pick).pick);
const busy = ref(false);
const options = computed(() => (props.mode === "profiles" ? [] : photoCandidates(card.value, shownPick.value)));
// In To search a found profile's photo is picked on its own tile, next to the profile.
const photos = computed(() => (props.mode === "search" ? options.value.filter((o) => !o.suggested) : options.value));
const chosen = computed(() => options.value.find((p) => p.id === shownPick.value.photoFrom));
const tilePhoto = (c: ProfileCandidate) => props.mode === "search" && shownPick.value.photoFrom === c.person.id;
// What each site's search found stays on the card, where it was asked.
const searched = computed(() =>
  props.mode === "photos"
    ? []
    : (card.value.searched ?? []).map((s) => {
        const network = networkInfo[s.network].name;
        return { ...s, text: s.found ? t("sync.search.found", { network, count: s.toLink }, s.toLink) : t("sync.search.none", { network, name: card.value.name }) };
      })
);
const queued = computed(() => card.value.queue);
const changed = computed(() => queued.value?.kind === "changed");
// A sync found a photo unlike the one the contact has.
const different = computed(() => queued.value?.kind === "photo" && card.value.hasPhoto && !card.value.placeholder);
const sourceName = (source: SourceId, network?: string) => network ?? sourceInfo[source].name;
/** Where a photo comes from, in words: "Instagram", "WhatsApp"… */
const optionName = (o: PhotoOption) => (o.person ? networkInfo[o.person.network].name : o.queued ? sourceName(o.queued.source, o.queued.network) : o.lookup!.network);
const caption = (o: PhotoOption) => (o.person ? (o.suggested ? handle(o.person) : t("sync.card.linked")) : o.queued ? o.queued.matchedBy : o.lookup!.url.replace(/^https:\/\//, ""));
const optionSrc = (o: PhotoOption) => (o.queued ? api.queuePhotoUrl(o.id) : `data:image/jpeg;base64,${o.lookup!.photo}`);
const pinnedName = computed(() => (queued.value?.pinned ? sourceName(queued.value.pinned.source, queued.value.pinned.network) : ""));
const currentName = computed(() => (card.value.currentFrom ? sourceName(card.value.currentFrom.source, card.value.currentFrom.network) : ""));
// Without a photo (issue #104): "No photo" leaves it out of To review for good, and with nothing found the card offers ways to find a profile.
const noPhoto = computed(() => wantsPhotoFor(card.value));
const nothingFound = computed(() => props.mode === "search" || (props.mode !== "profiles" && noPhoto.value && !photos.value.length && !card.value.candidates.length && !changed.value));
const linkedNow = (o: PhotoOption) => Boolean(o.person && card.value.linkedNow?.includes(o.person.id));

// To search (issue #107): a photo chosen by hand, uploaded like the Contacts page does.
async function upload(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || busy.value) return;
  busy.value = true;
  try {
    await api.uploadPhoto(props.suggestion.contactId, file);
    notify(t("sync.card.uploaded", { name: props.suggestion.name }));
    emit("done");
  } catch (e) {
    notifyError(withGoogleDetail(t("contacts.errors.photo"), e), e);
  }
  busy.value = false;
}
const ticked = (c: ProfileCandidate) => shownPick.value.ticked.includes(c.person.id);
const why = (c: ProfileCandidate) =>
  [c.person.relation ? t(`profiles.relation.${c.person.relation}`) : t(`profiles.from.${c.person.source}`), t(`profiles.reason.${c.reason}`), c.person.detail].filter(Boolean).join(" · ");
const handle = (p: SocialPerson) => (p.network === "linkedin" || p.network === "facebook" ? p.url.replace(/^https:\/\//, "") : `@${p.handle}`);
const profilesN = computed(() => t("profiles.list.profilesN", shownPick.value.ticked.length));
const confirmLabel = computed(() => {
  const photo = Boolean(chosen.value);
  if (shownPick.value.ticked.length) return photo ? t("sync.card.confirmBoth", { profiles: profilesN.value }) : t("sync.card.confirmProfiles", { profiles: profilesN.value });
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
async function act(kind: "link" | "back" | "keep" | "none" | "skip" | "noPhoto"): Promise<void> {
  if (busy.value || props.disabled) return;
  // On a photo changed outside the app, Enter keeps it.
  if (kind === "link" && changed.value && !shownPick.value.ticked.length) kind = "keep";
  if (kind === "link" && !hasChoice(shownPick.value)) return;
  if (kind === "none" && !card.value.candidates.length) kind = noPhoto.value ? "noPhoto" : "keep";
  busy.value = true;
  try {
    if (kind === "link" || kind === "back") {
      const request = linkRequest(card.value, shownPick.value);
      const { photoWanted, photoSet } = await api.linkProfiles(kind === "back" ? { ...request, photoFrom: queued.value!.photos[0].id } : request);
      notify(photoWanted && !photoSet ? t("profiles.linkedNoPhoto") : t("profiles.linkedDone", { name: card.value.name }));
    } else if (kind === "keep") {
      await api.keepCurrentPhoto(card.value.contactId);
    } else if (kind === "noPhoto") {
      if (card.value.candidates.length) await api.rejectProfiles(card.value.contactId, card.value.candidates.map((c) => c.person.id));
      await api.leaveWithoutPhoto(card.value.contactId);
    } else if (kind === "none") {
      await api.rejectProfiles(card.value.contactId, card.value.candidates.map((c) => c.person.id));
      if (queued.value) await api.keepCurrentPhoto(card.value.contactId);
    } else {
      await api.skipProfiles(card.value.contactId);
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
        :aria-label="$t('profiles.list.select', { name: card.name })"
        @change="emit('update:selected', ($event.target as HTMLInputElement).checked)"
      />
      <ContactAvatar :name="card.name" :photo-url="card.photoUrl" :size="large ? 'size-14' : 'size-10'" />
      <div class="min-w-[10rem] flex-1">
        <component :is="large ? 'h2' : 'h3'" class="flex flex-wrap items-center gap-2 font-semibold" :class="large ? 'text-xl font-bold' : ''"
          >{{ card.name || $t("cleanup.noName") }}<span v-if="card.photoKept" class="badge badge-info badge-soft badge-xs gap-1 font-normal"><Lock class="size-3" />{{ $t("contacts.kept") }}</span
          ><span v-else-if="changed" class="badge badge-warning badge-soft badge-xs font-normal">{{ $t("sync.card.changed") }}</span
          ><span v-else-if="different" class="badge badge-primary badge-soft badge-xs font-normal">{{ $t("sync.card.different") }}</span></component
        >
        <p class="text-xs text-base-content/60">
          {{ [card.detail, card.placeholder ? $t("contacts.placeholder") : card.hasPhoto ? $t("profiles.hasPhoto") : $t("contacts.noPhoto")].filter(Boolean).join(" · ") }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" class="btn btn-ghost btn-xs" :disabled="busy || disabled" @click="act('skip')">{{ $t("profiles.skip") }}<kbd v-if="large" class="kbd kbd-xs">S</kbd></button>
        <button v-if="card.candidates.length" type="button" class="btn btn-ghost btn-xs" :disabled="busy || disabled" @click="act('none')">{{ $t("profiles.none") }}<kbd v-if="large" class="kbd kbd-xs">N</kbd></button>
        <button v-if="noPhoto && mode !== 'profiles'" type="button" class="btn btn-ghost btn-xs" :title="$t('sync.card.noPhotoHint')" :disabled="busy || disabled" @click="act('noPhoto')">
          {{ $t("sync.card.noPhoto") }}<kbd v-if="large && !card.candidates.length" class="kbd kbd-xs">N</kbd>
        </button>
        <button v-else-if="queued && !changed && !card.candidates.length" type="button" class="btn btn-ghost btn-xs" :disabled="busy || disabled" @click="act('keep')">
          {{ $t("sync.card.keepCurrent") }}<kbd v-if="large" class="kbd kbd-xs">N</kbd>
        </button>
        <template v-if="changed">
          <button v-if="queued!.photos.length" type="button" class="btn btn-xs" :disabled="busy || disabled" @click="act('back')">{{ $t("sync.card.backTo", { source: pinnedName }) }}</button>
          <button v-if="!shownPick.ticked.length" type="button" class="btn btn-primary btn-xs" :disabled="busy || disabled" @click="act('keep')">
            <span v-if="busy" class="loading loading-spinner loading-xs"></span><Check v-else class="size-3.5" />{{ $t("sync.card.keepThis") }}<kbd v-if="large" class="kbd kbd-xs">Enter</kbd>
          </button>
        </template>
        <button v-if="(!changed || shownPick.ticked.length) && (!nothingFound || hasChoice(shownPick))" type="button" class="btn btn-primary btn-xs" :disabled="busy || disabled || !hasChoice(shownPick)" @click="act('link')">
          <span v-if="busy" class="loading loading-spinner loading-xs"></span><Check v-else class="size-3.5" />{{ confirmLabel }}<kbd v-if="large" class="kbd kbd-xs">Enter</kbd>
        </button>
      </div>
    </div>

    <div v-if="changed" class="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-warning/10 p-4" :class="{ 'sm:ml-8': selectable }" data-testid="changed-photo">
      <figure class="flex flex-col items-center gap-1.5 text-center">
        <ContactAvatar :name="card.name" :photo-url="card.photoUrl" size="size-14" />
        <figcaption class="text-[11px] text-base-content/60">{{ $t("sync.card.inGoogle") }}</figcaption>
      </figure>
      <ArrowLeftRight class="size-4 text-base-content/40" aria-hidden="true" />
      <figure class="flex flex-col items-center gap-1.5 text-center">
        <PhotoZoom v-if="queued!.photos.length" :src="api.queuePhotoUrl(queued!.photos[0].id)" :name="pinnedName">
          <img :src="api.queuePhotoUrl(queued!.photos[0].id)" :alt="$t('sync.card.fromSource', { source: pinnedName })" class="size-14 rounded-full object-cover" />
        </PhotoZoom>
        <span v-else class="grid size-14 place-items-center rounded-full border-2 border-dashed border-base-300 text-[11px] text-base-content/50">?</span>
        <figcaption><SourceBadge :source="queued!.pinned?.source ?? 'links'" :network="queued!.pinned?.network" /></figcaption>
      </figure>
      <p class="min-w-[12rem] flex-1 text-sm text-base-content/70">{{ $t("sync.card.changedText", { source: pinnedName }) }}</p>
    </div>

    <div v-if="photos.length || card.candidates.length" class="mt-4 grid gap-5" :class="[{ 'sm:pl-8': selectable }, photos.length && card.candidates.length ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]' : '']">
      <div v-if="photos.length">
        <h4 class="text-sm font-semibold">{{ $t("sync.card.photo") }}</h4>
        <div role="radiogroup" :aria-label="$t('sync.card.photoFor', { name: card.name })" class="mt-3 flex flex-wrap items-start gap-x-4 gap-y-3">
          <label class="flex min-w-20 cursor-pointer flex-col items-center gap-1.5 rounded-xl p-1 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
            <input type="radio" class="sr-only" :name="`photo-${card.contactId}`" :checked="!shownPick.photoFrom" :disabled="disabled" @change="choose(undefined)" />
            <span class="inline-flex rounded-full p-0.5 ring-2" :class="shownPick.photoFrom ? 'ring-transparent' : 'ring-primary'">
              <ContactAvatar v-if="card.hasPhoto" :name="card.name" :photo-url="card.photoUrl" size="size-14" />
              <span v-else class="grid size-14 place-items-center rounded-full border-2 border-dashed border-base-300 text-[11px] text-base-content/50">{{ $t("sync.card.none") }}</span>
            </span>
            <SourceBadge v-if="card.currentFrom" :source="card.currentFrom.source" :network="card.currentFrom.network" :label="$t('sync.card.currentFrom', { source: currentName })" />
            <span v-else class="text-[11px] text-base-content/60">{{ card.hasPhoto ? $t("sync.card.current") : $t("sync.card.keepNone") }}</span>
          </label>
          <ArrowRight class="mt-6 size-4 shrink-0 text-base-content/30" aria-hidden="true" />
          <label
            v-for="(c, i) in photos"
            :key="c.id"
            class="flex w-24 cursor-pointer flex-col items-center gap-1.5 rounded-xl p-1 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
          >
            <input type="radio" class="sr-only" :name="`photo-${card.contactId}`" :checked="shownPick.photoFrom === c.id" :disabled="disabled" :aria-label="`${optionName(c)} · ${c.person ? handle(c.person) : caption(c)}`" @change="choose(c.id)" />
            <span class="relative inline-flex rounded-full p-0.5 ring-2" :class="shownPick.photoFrom === c.id ? 'ring-primary' : 'ring-transparent'">
              <ProfilePhoto v-if="c.person" :person="c.person" size="size-14" />
              <PhotoZoom v-else :src="optionSrc(c)" :name="optionName(c)"><img :src="optionSrc(c)" alt="" class="size-14 rounded-full object-cover" /></PhotoZoom>
              <Check v-if="shownPick.photoFrom === c.id" class="absolute -right-1 -top-1 size-5 rounded-full bg-primary p-0.5 text-primary-content" aria-hidden="true" />
            </span>
            <span class="flex items-center gap-1"
              ><kbd v-if="large && i < 9" class="kbd kbd-xs">{{ i + 1 }}</kbd><NetworkMark v-if="c.person" :network="c.person.network" badge /><SourceBadge
                v-else
                :source="c.queued?.source ?? 'links'"
                :network="c.queued ? c.queued.network : c.lookup!.network"
            /></span>
            <span class="w-full truncate text-[11px] text-base-content/60">{{ caption(c) }}</span>
            <span v-if="c.queued?.small" class="badge badge-ghost badge-xs" :title="$t('sync.card.smallHint')">{{ $t("sync.card.small") }}</span>
            <span v-if="linkedNow(c)" class="badge badge-primary badge-soft badge-xs" :title="$t('sync.card.linkedNowHint')">{{ $t("sync.card.linkedNow") }}</span>
          </label>
        </div>
        <p v-if="chosen" class="mt-3 flex items-center gap-1.5 text-xs text-primary"><Pin class="size-3.5 shrink-0" />{{ $t("sync.card.pinNote", { network: optionName(chosen) }) }}</p>
        <p v-else-if="card.currentFrom" class="mt-3 text-xs text-base-content/50">{{ $t("sync.card.currentKept", { source: currentName }) }}</p>
        <p v-else-if="card.hasPhoto && !card.placeholder" class="mt-3 text-xs text-base-content/50">{{ $t("profiles.keepsPhoto") }}</p>
      </div>

      <div v-if="card.candidates.length" class="min-w-0">
        <h4 class="text-sm font-semibold">{{ $t("sync.card.profiles") }}</h4>
        <ul v-if="searched.length" class="mt-2 space-y-1 text-xs" data-testid="search-results">
          <li v-for="s in searched" :key="s.network" class="flex items-center gap-2" :class="{ 'text-base-content/60': !s.toLink }"><NetworkMark :network="s.network" size="size-4 rounded-full" />{{ s.text }}</li>
        </ul>
        <div class="mt-3 grid gap-2" :class="{ 'sm:grid-cols-2 xl:grid-cols-3': !photos.length }">
          <div v-for="c in card.candidates" :key="c.person.id" class="min-w-0 rounded-xl border-2 p-2.5" :class="ticked(c) ? 'border-primary bg-primary/5' : 'border-base-300'">
            <label class="flex cursor-pointer items-center gap-3">
              <input type="checkbox" class="checkbox checkbox-primary checkbox-sm" :checked="ticked(c)" :disabled="disabled" :aria-label="`${c.person.name ?? c.person.handle} · ${handle(c.person)}`" @change="tick(c)" />
              <!-- size-fit: stretched by the row, the ring would turn oval. -->
              <span class="relative inline-flex size-fit shrink-0 self-center rounded-full p-0.5 ring-2" :class="tilePhoto(c) ? 'ring-primary' : 'ring-transparent'">
                <ProfilePhoto :person="c.person" size="size-16" />
                <Check v-if="tilePhoto(c)" class="absolute -right-1 -top-1 size-5 rounded-full bg-primary p-0.5 text-primary-content" aria-hidden="true" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5"><NetworkMark :network="c.person.network" badge /><span class="max-w-full min-w-0 truncate text-sm font-semibold">{{ handle(c.person) }}</span></div>
                <div class="mt-0.5 text-[11px] text-base-content/60">{{ [c.person.name, why(c)].filter(Boolean).join(" · ") }}</div>
                <p v-if="tilePhoto(c)" class="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-primary">
                  <span class="whitespace-nowrap">{{ $t("sync.card.contactPhoto") }}</span><button type="button" class="btn btn-ghost btn-xs h-auto min-h-0 px-1 py-0.5" :disabled="disabled" @click.prevent="choose(undefined)">{{ $t("sync.card.dropPhoto") }}</button>
                </p>
                <button v-else-if="mode === 'search' && ticked(c) && c.person.photoUrl && noPhoto" type="button" class="btn btn-ghost btn-xs -ml-2 mt-0.5 text-primary" :disabled="disabled" @click.prevent="choose(c.person.id)">
                  {{ $t("sync.card.usePhoto") }}
                </button>
              </div>
              <a :href="c.person.url" target="_blank" rel="noopener" class="btn btn-ghost btn-xs btn-square" :aria-label="$t('profiles.open')" @click.stop><ExternalLink class="size-3.5" /></a>
            </label>
          </div>
        </div>
      </div>
    </div>
    <!-- Once a search found profiles, the other ways to find one fold away under them. -->
    <component :is="card.candidates.length ? 'details' : 'div'" v-if="nothingFound" class="mt-4" :class="{ 'sm:pl-8': selectable }" data-testid="find-profile">
      <component :is="card.candidates.length ? 'summary' : 'h4'" :class="card.candidates.length ? 'cursor-pointer text-xs text-base-content/60' : 'text-sm font-semibold'">
        {{ card.candidates.length ? $t("sync.card.notThese") : $t("sync.card.findProfile") }}
      </component>
      <LoginSearchButtons class="mt-2" :suggestion="card" :disabled="disabled" @changed="emit('done')" />
      <ul v-if="searched.length && !card.candidates.length" class="mt-2 space-y-1 text-xs text-base-content/60" data-testid="search-results">
        <li v-for="s in searched" :key="s.network" class="flex items-center gap-2"><NetworkMark :network="s.network" size="size-4 rounded-full" />{{ s.text }}</li>
      </ul>
      <ProfileLinkLookup class="mt-3 max-w-md" :label="$t('sync.card.linkFor', { name: card.name })" @found="emit('update:pick', addLink(props.pick, $event))" />
      <label v-if="mode === 'search'" class="btn btn-sm mt-3" :class="{ 'btn-disabled': busy || disabled }">
        <Upload class="size-4" />{{ $t("sync.card.upload") }}<input type="file" accept="image/*" class="sr-only" :disabled="busy || disabled" @change="upload" />
      </label>
    </component>
    <p v-if="card.photoKept" class="mt-3 flex items-center gap-1.5 text-xs text-base-content/60" :class="{ 'sm:pl-8': selectable }"><Lock class="size-3.5" />{{ $t("profiles.photoKept") }}</p>
    <details v-else-if="!changed && !nothingFound && (mode !== 'profiles' || socialLogins.length)" class="mt-3 text-xs" :class="{ 'sm:pl-8': selectable }" data-testid="card-link">
      <summary class="flex cursor-pointer items-center gap-1.5 text-base-content/60"><Link class="size-3.5" />{{ mode === "profiles" ? $t("sync.card.searchMore") : $t("links.reviewPrompt") }}</summary>
      <!-- A search finds profiles, which Profiles links; a typed link gives a photo, which Photos sets. -->
      <LoginSearchButtons v-if="mode !== 'photos'" class="mt-2" :suggestion="card" :disabled="disabled" @changed="emit('done')" />
      <ProfileLinkLookup v-if="mode !== 'profiles'" class="mt-3 max-w-md" :label="$t('sync.card.linkFor', { name: card.name })" @found="emit('update:pick', addLink(props.pick, $event))" />
    </details>
  </section>
</template>
