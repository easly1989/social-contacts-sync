<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ImageOff, ImageUp, Images, Link, MoreVertical, RefreshCw, Search, Tag, Trash2, UserPlus, UsersRound, GitMerge, X } from "lucide-vue-next";

import AppShell from "../../components/AppShell.vue";
import ContactAvatar from "../../components/ContactAvatar.vue";
import ContactEditor from "../../components/contacts/ContactEditor.vue";
import PhotoUpload from "../../components/contacts/PhotoUpload.vue";
import MergePanel from "../../components/cleanup/MergePanel.vue";
import { api, withGoogleDetail } from "../../api";
import { displayName, matchesSearch, shrinkImage, toCleanupContact } from "../../contactTools";
import { number } from "../../format";
import { Contact, ContactLabel, MergeRequest } from "../../../../interfaces/api";

// Every Google contact (issue #55): the ones without a photo one click away,
// edit, add, delete, merge, labels and photos uploaded by hand.
const { t, locale } = useI18n();

const contacts = ref<Contact[]>();
const labels = ref<ContactLabel[]>([]);
const loadError = ref(false);
const notice = ref<{ text: string; error?: boolean; undo?: string }>();

type Filter = "all" | "noPhoto" | "placeholder";
const filter = ref<Filter>("noPhoto");
const query = ref("");
const label = ref("");
const shown = ref(100);

async function load(): Promise<void> {
  loadError.value = false;
  try {
    const list = await api.contacts();
    contacts.value = list.contacts;
    labels.value = list.labels;
  } catch {
    loadError.value = true;
  }
}
onMounted(load);

const counts = computed(() => ({
  all: contacts.value?.length ?? 0,
  noPhoto: contacts.value?.filter((c) => !c.hasPhoto).length ?? 0,
  placeholder: contacts.value?.filter((c) => c.placeholder).length ?? 0,
}));
const tiles = [
  { key: "all", icon: UsersRound },
  { key: "noPhoto", icon: ImageOff },
  { key: "placeholder", icon: ImageUp },
] as const;

const filtered = computed(() =>
  (contacts.value ?? [])
    .filter((c) => (filter.value === "noPhoto" ? !c.hasPhoto : filter.value === "placeholder" ? c.placeholder : true))
    .filter((c) => !label.value || c.labels.includes(label.value))
    .filter((c) => matchesSearch(c, query.value))
    .sort((a, b) => (displayName(a) || "￿").localeCompare(displayName(b) || "￿", locale.value))
);
const rows = computed(() => filtered.value.slice(0, shown.value));
watch([filter, query, label], () => (shown.value = 100));

const labelName = (id: string) => labels.value.find((l) => l.id === id)?.name;
const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");

/** A contact the server sent back replaces the one in the list (or joins it). */
function replace(contact: Contact): void {
  if (!contacts.value) return;
  const i = contacts.value.findIndex((c) => c.id === contact.id);
  if (i >= 0) contacts.value[i] = contact;
  else contacts.value.push(contact);
}
const drop = (ids: string[]) => contacts.value && (contacts.value = contacts.value.filter((c) => !ids.includes(c.id)));

// Selection.
const selected = ref<string[]>([]);
const allShownSelected = computed(() => rows.value.length > 0 && rows.value.every((c) => selected.value.includes(c.id)));
function toggleAll(on: boolean): void {
  selected.value = on ? [...new Set([...selected.value, ...rows.value.map((c) => c.id)])] : selected.value.filter((id) => !rows.value.some((c) => c.id === id));
}
const toggle = (id: string, on: boolean) => (selected.value = on ? [...selected.value, id] : selected.value.filter((s) => s !== id));

// Editor.
const editing = ref<{ contact?: Contact; key: number }>();
let editorKey = 0;
const openEditor = (contact?: Contact) => (editing.value = { contact, key: editorKey++ });
function onDeleted(actionId: string, id: string): void {
  drop([id]);
  selected.value = selected.value.filter((s) => s !== id);
  editing.value = undefined;
  notice.value = { text: t("contacts.deleted", 1), undo: actionId };
}
function onDuplicated(copy: Contact): void {
  replace(copy);
  openEditor(copy);
  notice.value = { text: t("contacts.duplicated") };
}

// Row menu.
const busyRow = ref<string>();
async function duplicate(contact: Contact): Promise<void> {
  busyRow.value = contact.id;
  try {
    onDuplicated(await api.duplicateContact(contact.id));
  } catch (e) {
    notice.value = { text: withGoogleDetail(t("contacts.errors.duplicate"), e), error: true };
  }
  busyRow.value = undefined;
}

// "Add photo" on a row: straight to the file picker.
const rowPhoto = ref<HTMLInputElement>();
const photoFor = ref<string>();
function addPhoto(contact: Contact): void {
  photoFor.value = contact.id;
  rowPhoto.value?.click();
}
async function rowPhotoChosen(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  const id = photoFor.value;
  if (!file || !id) return;
  busyRow.value = id;
  try {
    replace(await api.uploadPhoto(id, await shrinkImage(file)));
    notice.value = { text: t("contacts.photoAdded") };
  } catch (e) {
    notice.value = { text: withGoogleDetail(t("contacts.errors.photo"), e), error: true };
  }
  busyRow.value = undefined;
}

// Bulk actions.
const bulkBusy = ref(false);
async function deleteSelected(ids = [...selected.value]): Promise<void> {
  if (!window.confirm(t("contacts.deleteConfirm", { name: displayName(contacts.value!.find((c) => c.id === ids[0])!) || "—", count: ids.length }, ids.length))) return;
  bulkBusy.value = true;
  try {
    const { actionId, deleted } = await api.deleteContacts(ids);
    drop(deleted);
    selected.value = selected.value.filter((id) => !deleted.includes(id));
    notice.value = { text: t("contacts.deleted", deleted.length), undo: actionId };
  } catch (e) {
    notice.value = { text: withGoogleDetail(t("contacts.errors.delete"), e), error: true };
    await load();
  }
  bulkBusy.value = false;
}

const labelMenu = ref<HTMLDetailsElement>();
const newLabel = ref("");
async function applyLabel(id: string, add: boolean): Promise<void> {
  if (labelMenu.value) labelMenu.value.open = false;
  bulkBusy.value = true;
  try {
    const { contacts: changed } = await api.applyLabel(selected.value, id, add);
    changed.forEach(replace);
    notice.value = { text: t(add ? "contacts.labelAdded" : "contacts.labelRemoved", { name: labelName(id), count: selected.value.length }) };
  } catch (e) {
    notice.value = { text: withGoogleDetail(t("contacts.errors.label"), e), error: true };
    await load();
  }
  bulkBusy.value = false;
}
async function createAndApply(): Promise<void> {
  const name = newLabel.value.trim();
  if (!name) return;
  try {
    const created = await api.createLabel(name);
    if (!labels.value.some((l) => l.id === created.id)) labels.value = [...labels.value, created].sort((a, b) => a.name.localeCompare(b.name));
    newLabel.value = "";
    await applyLabel(created.id, true);
  } catch (e) {
    notice.value = { text: withGoogleDetail(t("contacts.errors.label"), e), error: true };
  }
}
function labelCreated(created: ContactLabel): void {
  if (!labels.value.some((l) => l.id === created.id)) labels.value = [...labels.value, created].sort((a, b) => a.name.localeCompare(b.name));
}

// Merge: Clean up's merge table, for the selected contacts.
const merging = ref<string[]>();
// Only those still in the list: the merged-away ones leave it before the panel closes.
const mergeContacts = computed(() =>
  Object.fromEntries((merging.value ?? []).flatMap((id) => contacts.value?.filter((c) => c.id === id).map((c) => [id, toCleanupContact(c)]) ?? []))
);
function startMerge(): void {
  // The most recently edited first: it's the one kept.
  const updated = (id: string) => contacts.value!.find((c) => c.id === id)?.updatedAt ?? "";
  merging.value = [...selected.value].sort((a, b) => updated(b).localeCompare(updated(a)));
}
async function mergeWith(request: MergeRequest): Promise<string> {
  const ids = merging.value!;
  const { groupId: _groupId, ...rest } = request;
  const updatedAt = Object.fromEntries(ids.map((id) => [id, contacts.value!.find((c) => c.id === id)?.updatedAt]));
  const result = await api.mergeContacts(ids, rest, updatedAt);
  drop(result.deleted);
  replace(result.contact);
  return result.actionId;
}
function merged(actionId: string): void {
  merging.value = undefined;
  selected.value = [];
  notice.value = { text: t("contacts.merged"), undo: actionId };
}

// Undo from the notice, the same as from History.
async function undo(actionId: string): Promise<void> {
  notice.value = undefined;
  try {
    await api.undoCleanup(actionId);
    await load();
    notice.value = { text: t("contacts.undone") };
  } catch (e) {
    notice.value = { text: withGoogleDetail(t("contacts.errors.undo"), e), error: true };
  }
}

const uploading = ref(false);
</script>

<template>
  <AppShell :title="$t('contacts.title')" :subtitle="$t('contacts.subtitle')">
    <template #actions>
      <button type="button" class="btn btn-sm" :disabled="!contacts" @click="uploading = true"><Images class="size-4" />{{ $t("contacts.uploadPhotos") }}</button>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!contacts" @click="openEditor()"><UserPlus class="size-4" />{{ $t("contacts.new") }}</button>
    </template>

    <div v-if="contacts" class="flex flex-col gap-4">
      <div class="grid grid-cols-3 gap-2 sm:gap-4" role="group" :aria-label="$t('contacts.filters')">
        <button
          v-for="tile in tiles"
          :key="tile.key"
          type="button"
          class="rounded-box border p-3 text-left sm:p-4"
          :class="filter === tile.key ? 'border-primary bg-primary/5' : 'border-base-300 bg-base-100 hover:border-base-content/20'"
          :aria-pressed="filter === tile.key"
          :data-testid="`tile-${tile.key}`"
          @click="filter = tile.key"
        >
          <span class="flex items-start gap-2 text-xs text-base-content/70 sm:items-center sm:text-sm"><component :is="tile.icon" class="size-4 shrink-0" />{{ $t(`contacts.tiles.${tile.key}`) }}</span>
          <span class="mt-1 block text-2xl font-bold">{{ number(counts[tile.key], locale) }}</span>
        </button>
      </div>

      <section class="rounded-box border border-base-300 bg-base-100 px-4 pt-4 sm:px-5">
        <div class="flex flex-wrap items-center gap-3">
          <label class="input input-sm w-full sm:w-72">
            <Search class="size-4 opacity-50" /><input v-model="query" type="search" :placeholder="$t('contacts.search')" :aria-label="$t('contacts.search')" />
          </label>
          <label class="select select-sm w-auto">
            <Tag class="size-4 opacity-50" />
            <select v-model="label" :aria-label="$t('contacts.labelFilter')">
              <option value="">{{ $t("contacts.allLabels") }}</option>
              <option v-for="l in labels" :key="l.id" :value="l.id">{{ l.name }}</option>
            </select>
          </label>
          <span class="flex-1"></span>
          <div v-if="selected.length" class="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-1 text-sm" data-testid="selection-bar">
            <span class="font-medium text-primary">{{ $t("contacts.selected", { count: selected.length }) }}</span>
            <button type="button" class="btn btn-primary btn-xs" :disabled="bulkBusy || selected.length < 2 || selected.length > 10" :title="selected.length > 10 ? $t('contacts.mergeMax') : undefined" @click="startMerge">
              <GitMerge class="size-3.5" />{{ $t("contacts.merge") }}
            </button>
            <details ref="labelMenu" class="dropdown dropdown-end">
              <summary class="btn btn-ghost btn-xs" :class="{ 'btn-disabled': bulkBusy }"><Tag class="size-3.5" />{{ $t("contacts.label") }}</summary>
              <div class="dropdown-content z-10 mt-1 w-72 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
                <ul class="max-h-56 overflow-y-auto">
                  <li v-for="l in labels" :key="l.id" class="flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-base-200">
                    <span class="flex-1 truncate">{{ l.name }}</span>
                    <button type="button" class="btn btn-ghost btn-xs" @click="applyLabel(l.id, true)">{{ $t("contacts.labelAdd") }}</button>
                    <button type="button" class="btn btn-ghost btn-xs" @click="applyLabel(l.id, false)">{{ $t("contacts.labelRemove") }}</button>
                  </li>
                </ul>
                <div class="mt-1 flex gap-1 border-t border-base-300 pt-2">
                  <input v-model="newLabel" class="input input-xs min-w-0 flex-1" :placeholder="$t('contacts.newLabel')" :aria-label="$t('contacts.newLabel')" @keydown.enter.prevent="createAndApply" />
                  <button type="button" class="btn btn-xs" :disabled="!newLabel.trim()" @click="createAndApply">{{ $t("contacts.create") }}</button>
                </div>
              </div>
            </details>
            <button type="button" class="btn btn-ghost btn-xs" :disabled="bulkBusy" @click="deleteSelected()"><Trash2 class="size-3.5" />{{ $t("contacts.delete") }}</button>
            <button type="button" class="btn btn-ghost btn-xs btn-square" :aria-label="$t('contacts.clearSelection')" @click="selected = []"><X class="size-3.5" /></button>
          </div>
        </div>

        <div v-if="rows.length" class="mt-3 overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th class="w-8"><input type="checkbox" class="checkbox checkbox-xs" :checked="allShownSelected" :aria-label="$t('contacts.selectAll')" @change="toggleAll(($event.target as HTMLInputElement).checked)" /></th>
                <th>{{ $t("contacts.columns.contact") }}</th>
                <th class="hidden md:table-cell">{{ $t("contacts.columns.reach") }}</th>
                <th class="hidden lg:table-cell">{{ $t("contacts.columns.links") }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="contact in rows" :key="contact.id" :class="{ 'bg-primary/5': selected.includes(contact.id) }">
                <td>
                  <input type="checkbox" class="checkbox checkbox-xs" :checked="selected.includes(contact.id)" :aria-label="$t('contacts.select', { name: displayName(contact) || '—' })" @change="toggle(contact.id, ($event.target as HTMLInputElement).checked)" />
                </td>
                <td>
                  <button type="button" class="flex items-center gap-3 text-left" @click="openEditor(contact)">
                    <ContactAvatar :name="displayName(contact)" :photo-url="contact.photoUrl" />
                    <span class="min-w-0">
                      <span class="flex flex-wrap items-center gap-1.5 font-medium">
                        {{ displayName(contact) || $t("cleanup.noName") }}
                        <span v-for="id in contact.labels" :key="id" class="badge badge-ghost badge-xs">{{ labelName(id) }}</span>
                      </span>
                      <span v-if="contact.placeholder" class="badge badge-warning badge-soft badge-xs">{{ $t("contacts.placeholder") }}</span>
                      <span v-else-if="!contact.hasPhoto" class="block text-[11px] text-base-content/50">{{ $t("contacts.noPhoto") }}</span>
                    </span>
                  </button>
                </td>
                <td class="hidden text-base-content/60 md:table-cell">{{ [contact.phones[0]?.value, contact.emails[0]?.value].filter(Boolean).join(" · ") || "—" }}</td>
                <td class="hidden lg:table-cell">
                  <div class="flex flex-wrap gap-1">
                    <span v-for="url in contact.urls.slice(0, 3)" :key="url.value" class="inline-flex items-center gap-1 rounded-full border border-base-300 px-1.5 py-px text-[11px] text-base-content/70"><Link class="size-3" />{{ host(url.value) }}</span>
                    <span v-if="!contact.urls.length" class="text-base-content/40">—</span>
                  </div>
                </td>
                <td class="whitespace-nowrap text-right">
                  <span v-if="busyRow === contact.id" class="loading loading-spinner loading-xs mr-2"></span>
                  <button v-else-if="!contact.hasPhoto || contact.placeholder" type="button" class="btn btn-ghost btn-xs" @click="addPhoto(contact)"><ImageUp class="size-3.5" />{{ $t("contacts.addPhoto") }}</button>
                  <details class="dropdown dropdown-end">
                    <summary class="btn btn-ghost btn-xs btn-square" :aria-label="$t('contacts.more', { name: displayName(contact) || '—' })"><MoreVertical class="size-3.5" /></summary>
                    <ul class="menu dropdown-content z-10 w-44 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg">
                      <li><button type="button" @click="openEditor(contact)">{{ $t("contacts.edit") }}</button></li>
                      <li><button type="button" @click="duplicate(contact)">{{ $t("contacts.duplicate") }}</button></li>
                      <li>
                        <button type="button" class="text-error" @click="deleteSelected([contact.id])">{{ $t("contacts.delete") }}</button>
                      </li>
                    </ul>
                  </details>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="py-10 text-center text-sm text-base-content/50">{{ query || label ? $t("contacts.noResults") : $t(`contacts.empty.${filter}`) }}</p>
        <div class="flex flex-wrap items-center gap-3 py-3 text-xs text-base-content/50">
          <span class="flex-1">{{ $t("contacts.showing", { shown: number(rows.length, locale), total: number(filtered.length, locale) }) }}</span>
          <button v-if="rows.length < filtered.length" type="button" class="btn btn-ghost btn-xs" @click="shown += 200">{{ $t("contacts.showMore") }}</button>
        </div>
      </section>
    </div>
    <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-12 text-sm text-base-content/60">
      {{ $t("contacts.errors.load") }}<button type="button" class="btn btn-sm" @click="load"><RefreshCw class="size-4" />{{ $t("contacts.retry") }}</button>
    </div>
    <div v-else class="grid place-items-center py-12"><span class="loading loading-spinner"></span></div>

    <input ref="rowPhoto" type="file" accept="image/*" class="hidden" data-testid="row-photo-input" @change="rowPhotoChosen" />

    <div v-if="notice" class="toast toast-center z-40" role="status">
      <div class="alert" :class="notice.error ? 'alert-error' : ''">
        <span>{{ notice.text }}</span>
        <button v-if="notice.undo" type="button" class="btn btn-sm" @click="undo(notice.undo)">{{ $t("report.undo") }}</button>
        <button type="button" class="btn btn-ghost btn-sm btn-square" :aria-label="$t('contacts.close')" @click="notice = undefined"><X class="size-4" /></button>
      </div>
    </div>

    <ContactEditor
      v-if="editing"
      :key="editing.key"
      :contact="editing.contact"
      :labels="labels"
      @close="editing = undefined"
      @saved="replace"
      @deleted="onDeleted"
      @duplicated="onDuplicated"
      @label-created="labelCreated"
    />
    <PhotoUpload v-if="uploading && contacts" :contacts="contacts" @close="uploading = false" @uploaded="replace" />
    <div v-if="merging" class="fixed inset-0 z-30 grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true" :aria-label="$t('contacts.mergeTitle', { count: merging.length })">
      <div class="absolute inset-0 bg-base-content/25" @click="merging = undefined"></div>
      <div class="relative w-full max-w-4xl">
        <MergePanel
          :group="{ id: 'contacts', contactIds: merging, reasons: [] }"
          :contacts="mergeContacts"
          :merge-with="mergeWith"
          :intro="$t('contacts.mergeIntro', { count: merging.length })"
          @merged="merged"
          @skip="merging = undefined"
        />
      </div>
    </div>
  </AppShell>
</template>
