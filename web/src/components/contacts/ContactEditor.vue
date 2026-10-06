<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowRight, Briefcase, Cake, Check, Copy, Link, Mail, MapPin, NotebookPen, Phone, Plus, Tag, Trash2, Upload, UserRound, X } from "lucide-vue-next";

import ContactAvatar from "../ContactAvatar.vue";
import { api, ApiError, withGoogleDetail } from "../../api";
import { displayName, shrinkImage } from "../../contactTools";
import { lookupError } from "../../profileLinks";
import { Contact, ContactAddress, ContactField, ContactInput, ContactLabel, LinkLookup } from "../../../../interfaces/api";

// The Contacts page's editor (issue #55): every field Google keeps, in a
// drawer over the list. Nothing is written until Save, except the photo,
// which has its own buttons, and Duplicate and Delete.
const props = defineProps<{ contact?: Contact; labels: ContactLabel[] }>();
const emit = defineEmits<{
  close: [];
  saved: [contact: Contact];
  deleted: [actionId: string, id: string];
  duplicated: [contact: Contact];
  labelCreated: [label: ContactLabel];
}>();
const { t, locale } = useI18n();

// Props are reactive proxies, which structuredClone refuses.
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const blank = (): ContactInput => ({ phones: [], emails: [], urls: [], addresses: [], labels: [] });
function inputOf(c?: Contact): ContactInput {
  if (!c) return blank();
  const { id: _id, name: _name, hasPhoto: _h, photoUrl: _p, placeholder: _pl, updatedAt: _u, ...input } = clone(c);
  return input;
}

// The contact as last read from the server: it changes when a photo is saved.
const current = ref<Contact | undefined>(props.contact && clone(props.contact));
const form = ref<ContactInput>(inputOf(props.contact));
const saved = ref(JSON.stringify(form.value));
const dirty = computed(() => JSON.stringify(form.value) !== saved.value || Boolean(pendingPhoto.value || pendingLink.value));

const busy = ref<"save" | "photo" | "delete" | "duplicate" | "label">();
const error = ref<string>();
const conflict = ref<Contact>();

const types = {
  phones: ["mobile", "home", "work", "main", "other"],
  emails: ["home", "work", "other"],
  urls: ["profile", "homePage", "blog", "work", "other"],
  addresses: ["home", "work", "other"],
};
const typeOptions = (kind: keyof typeof types, value?: string) => (value && !types[kind].includes(value) ? [...types[kind], value] : types[kind]);
const typeLabel = (value: string) => (["mobile", "home", "work", "main", "other", "profile", "homePage", "blog"].includes(value) ? t(`contacts.types.${value}`) : value);

function addEntry(kind: "phones" | "emails" | "urls"): void {
  form.value[kind].push({ value: "", type: kind === "urls" ? "profile" : kind === "phones" ? "mobile" : "home" });
  void nextTick(() => document.querySelector<HTMLInputElement>(`[data-entry="${kind}-${form.value[kind].length - 1}"]`)?.focus());
}
const removeEntry = (kind: "phones" | "emails" | "urls" | "addresses", i: number) => form.value[kind].splice(i, 1);
const addAddress = () => form.value.addresses.push({ type: "home" } as ContactAddress);

// Birthday: day and month, year optional.
const months = computed(() => Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(locale.value, { month: "long" }).format(new Date(2000, i, 1))));
const birthdayDay = computed({
  get: () => form.value.birthday?.day ?? 0,
  set: (day: number) => setBirthday({ day }),
});
const birthdayMonth = computed({
  get: () => form.value.birthday?.month ?? 0,
  set: (month: number) => setBirthday({ month }),
});
const birthdayYear = computed({
  get: () => form.value.birthday?.year ?? "",
  set: (year: string | number) => setBirthday({ year: Number(year) || undefined }),
});
// Kept half-filled until both day and month are there.
const partial = ref<{ day?: number; month?: number; year?: number }>({ ...form.value.birthday });
function setBirthday(change: { day?: number; month?: number; year?: number }): void {
  partial.value = { ...partial.value, ...change };
  const { day, month, year } = partial.value;
  form.value.birthday = day && month ? { day, month, ...(year ? { year } : {}) } : undefined;
}

// Labels.
const labelName = (id: string) => props.labels.find((l) => l.id === id)?.name ?? id;
const unusedLabels = computed(() => props.labels.filter((l) => !form.value.labels.includes(l.id)));
const newLabel = ref("");
const labelMenu = ref<HTMLDetailsElement>();
function addLabel(id: string): void {
  if (!form.value.labels.includes(id)) form.value.labels.push(id);
  if (labelMenu.value) labelMenu.value.open = false;
}
async function createLabel(): Promise<void> {
  const name = newLabel.value.trim();
  if (!name) return;
  busy.value = "label";
  try {
    const label = await api.createLabel(name);
    emit("labelCreated", label);
    addLabel(label.id);
    newLabel.value = "";
  } catch (e) {
    error.value = withGoogleDetail(t("contacts.errors.label"), e);
  }
  busy.value = undefined;
}

// Photo: uploaded right away for an existing contact, after Save for a new one.
const fileInput = ref<HTMLInputElement>();
const pendingPhoto = ref<Blob>();
const pendingPreview = ref<string>();
const photoUrl = computed(() => pendingPreview.value ?? (pendingLink.value ? `data:image/jpeg;base64,${pendingLink.value.photo}` : current.value?.photoUrl));
const isPlaceholder = computed(() => Boolean(pendingPhoto.value) || (!pendingLink.value && current.value?.placeholder));

async function choosePhoto(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = "";
  if (!file) return;
  error.value = undefined;
  let photo: Blob;
  try {
    photo = await shrinkImage(file);
  } catch {
    error.value = t("contacts.errors.image");
    return;
  }
  if (!current.value) {
    pendingLink.value = undefined;
    pendingPhoto.value = photo;
    if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value);
    pendingPreview.value = URL.createObjectURL(photo);
    return;
  }
  busy.value = "photo";
  try {
    updated(await api.uploadPhoto(current.value.id, photo));
  } catch (e) {
    error.value = withGoogleDetail(t("contacts.errors.photo"), e);
  }
  busy.value = undefined;
}

async function removePhoto(): Promise<void> {
  if (!current.value?.hasPhoto) {
    pendingPhoto.value = undefined;
    pendingLink.value = undefined;
    pendingPreview.value = undefined;
    return;
  }
  busy.value = "photo";
  try {
    updated(await api.removePhoto(current.value.id));
  } catch (e) {
    error.value = withGoogleDetail(t("contacts.errors.photo"), e);
  }
  busy.value = undefined;
}

/** A change the server already made (photo): the list is told, the form keeps its edits. */
function updated(contact: Contact): void {
  const editsBefore = form.value;
  current.value = contact;
  // The photo-from-link call also saved the link: keep the form's list, plus it.
  for (const url of contact.urls) if (!editsBefore.urls.some((u) => u.value === url.value)) editsBefore.urls.push(url);
  emit("saved", contact);
}

// Profile links: "Find photo" on any of them.
const lookingUp = ref<number>();
const found = ref<{ index: number; lookup: LinkLookup }>();
const linkError = ref<{ index: number; message: string }>();
const pendingLink = ref<LinkLookup>();
async function findPhoto(index: number): Promise<void> {
  const url = form.value.urls[index]?.value.trim();
  if (!url) return;
  lookingUp.value = index;
  linkError.value = undefined;
  found.value = undefined;
  try {
    found.value = { index, lookup: await api.linkLookup(url) };
  } catch (e) {
    linkError.value = { index, message: lookupError(e, t) };
  }
  lookingUp.value = undefined;
}
async function useFound(): Promise<void> {
  if (!found.value) return;
  const lookup = found.value.lookup;
  if (!current.value) {
    pendingPhoto.value = undefined;
    pendingPreview.value = undefined;
    pendingLink.value = lookup;
    found.value = undefined;
    return;
  }
  busy.value = "photo";
  try {
    updated(await api.photoFromLink(current.value.id, lookup.token));
    found.value = undefined;
  } catch (e) {
    error.value = withGoogleDetail(t("contacts.errors.photo"), e);
  }
  busy.value = undefined;
}

async function save(): Promise<void> {
  busy.value = "save";
  error.value = undefined;
  conflict.value = undefined;
  try {
    let contact: Contact;
    if (current.value) contact = await api.saveContact(current.value.id, form.value, current.value.updatedAt);
    else {
      contact = await api.createContact(form.value);
      if (pendingPhoto.value) contact = await api.uploadPhoto(contact.id, pendingPhoto.value);
      else if (pendingLink.value) contact = await api.photoFromLink(contact.id, pendingLink.value.token);
    }
    emit("saved", contact);
    saved.value = JSON.stringify(form.value);
    pendingPhoto.value = undefined;
    pendingLink.value = undefined;
    emit("close");
  } catch (e) {
    if (e instanceof ApiError && e.code === "changed" && e.body?.contact) {
      conflict.value = e.body.contact as Contact;
      error.value = t("contacts.errors.changed");
    } else if (e instanceof ApiError && e.code === "empty_contact") error.value = t("contacts.errors.empty");
    else error.value = withGoogleDetail(t("contacts.errors.save"), e);
  }
  busy.value = undefined;
}

/** Changed in Google meanwhile: start again from what's there now. */
function reload(): void {
  if (!conflict.value) return;
  current.value = conflict.value;
  form.value = inputOf(conflict.value);
  saved.value = JSON.stringify(form.value);
  partial.value = { ...form.value.birthday };
  emit("saved", conflict.value);
  conflict.value = undefined;
  error.value = undefined;
}

async function duplicate(): Promise<void> {
  if (!current.value) return;
  busy.value = "duplicate";
  try {
    emit("duplicated", await api.duplicateContact(current.value.id));
  } catch (e) {
    error.value = withGoogleDetail(t("contacts.errors.duplicate"), e);
  }
  busy.value = undefined;
}

async function remove(): Promise<void> {
  if (!current.value || !window.confirm(t("contacts.deleteConfirm", { name: displayName(current.value) || "—" }, 1))) return;
  busy.value = "delete";
  try {
    const { actionId } = await api.deleteContacts([current.value.id]);
    emit("deleted", actionId, current.value.id);
  } catch (e) {
    error.value = withGoogleDetail(t("contacts.errors.delete"), e);
    busy.value = undefined;
  }
}

function close(): void {
  if (dirty.value && !window.confirm(t("contacts.discard"))) return;
  emit("close");
}
const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
const panel = ref<HTMLElement>();
onMounted(() => {
  document.addEventListener("keydown", onKey);
  panel.value?.querySelector<HTMLInputElement>("input")?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey);
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value);
});
</script>

<template>
  <div class="fixed inset-0 z-30 flex justify-end">
    <div class="absolute inset-0 bg-base-content/25" @click="close"></div>
    <aside ref="panel" class="relative flex h-full w-full max-w-[34rem] flex-col border-l border-base-300 bg-base-100 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="contact-editor-title" data-testid="contact-editor">
      <header class="flex items-center gap-2 border-b border-base-300 px-6 py-4">
        <h2 id="contact-editor-title" class="flex-1 font-semibold">{{ current ? $t("contacts.edit") : $t("contacts.new") }}</h2>
        <template v-if="current">
          <button type="button" class="btn btn-ghost btn-sm" :disabled="Boolean(busy)" @click="duplicate"><Copy class="size-4" />{{ $t("contacts.duplicate") }}</button>
          <button type="button" class="btn btn-ghost btn-sm text-error" :disabled="Boolean(busy)" @click="remove"><Trash2 class="size-4" />{{ $t("contacts.delete") }}</button>
        </template>
        <button type="button" class="btn btn-ghost btn-sm btn-square" :aria-label="$t('contacts.close')" @click="close"><X class="size-4" /></button>
      </header>

      <form id="contact-form" class="flex-1 space-y-5 overflow-y-auto px-6 py-5" @submit.prevent="save">
        <!-- Photo -->
        <div class="flex items-center gap-4">
          <div class="relative">
            <ContactAvatar :name="displayName({ ...form, name: current?.name })" :photo-url="photoUrl" size="size-20" />
            <span v-if="photoUrl && isPlaceholder" class="badge badge-warning badge-soft badge-xs absolute -bottom-1 left-1/2 -translate-x-1/2">{{ $t("contacts.placeholder") }}</span>
          </div>
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-sm" :disabled="Boolean(busy)" @click="fileInput?.click()">
                <span v-if="busy === 'photo'" class="loading loading-spinner loading-xs"></span><Upload v-else class="size-4" />{{ $t("contacts.uploadPhoto") }}
              </button>
              <button v-if="photoUrl" type="button" class="btn btn-ghost btn-sm" :disabled="Boolean(busy)" @click="removePhoto"><Trash2 class="size-4" />{{ $t("contacts.removePhoto") }}</button>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" :aria-label="$t('contacts.uploadPhoto')" data-testid="photo-input" @change="choosePhoto" />
            </div>
            <p class="text-xs text-base-content/60">{{ $t("contacts.placeholderHint") }}</p>
          </div>
        </div>

        <fieldset>
          <legend class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50"><UserRound class="size-3.5" />{{ $t("contacts.fields.name") }}</legend>
          <div class="grid grid-cols-2 gap-2">
            <input v-model.trim="form.givenName" class="input input-sm w-full" :placeholder="$t('contacts.fields.givenName')" :aria-label="$t('contacts.fields.givenName')" />
            <input v-model.trim="form.familyName" class="input input-sm w-full" :placeholder="$t('contacts.fields.familyName')" :aria-label="$t('contacts.fields.familyName')" />
          </div>
        </fieldset>

        <fieldset>
          <legend class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50"><Briefcase class="size-3.5" />{{ $t("contacts.fields.work") }}</legend>
          <div class="grid grid-cols-2 gap-2">
            <input v-model.trim="form.company" class="input input-sm w-full" :placeholder="$t('contacts.fields.company')" :aria-label="$t('contacts.fields.company')" />
            <input v-model.trim="form.jobTitle" class="input input-sm w-full" :placeholder="$t('contacts.fields.jobTitle')" :aria-label="$t('contacts.fields.jobTitle')" />
          </div>
        </fieldset>

        <fieldset v-for="kind in (['phones', 'emails'] as const)" :key="kind">
          <legend class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">
            <Phone v-if="kind === 'phones'" class="size-3.5" /><Mail v-else class="size-3.5" />{{ $t(`contacts.fields.${kind}`) }}
          </legend>
          <div class="space-y-2">
            <div v-for="(entry, i) in (form[kind] as ContactField[])" :key="i" class="flex items-center gap-2">
              <label class="input input-sm min-w-0 flex-1">
                <Phone v-if="kind === 'phones'" class="size-4 opacity-50" /><Mail v-else class="size-4 opacity-50" />
                <input v-model.trim="entry.value" :type="kind === 'phones' ? 'tel' : 'email'" :data-entry="`${kind}-${i}`" :aria-label="$t(`contacts.fields.${kind}One`)" />
              </label>
              <select v-model="entry.type" class="select select-sm w-32" :aria-label="$t('contacts.fields.type')">
                <option v-for="type in typeOptions(kind, entry.type)" :key="type" :value="type">{{ typeLabel(type) }}</option>
              </select>
              <button type="button" class="btn btn-ghost btn-sm btn-square" :aria-label="$t('contacts.remove')" @click="removeEntry(kind, i)"><X class="size-4" /></button>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs mt-1" @click="addEntry(kind)"><Plus class="size-3.5" />{{ $t(`contacts.add.${kind}`) }}</button>
        </fieldset>

        <fieldset>
          <legend class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50"><Link class="size-3.5" />{{ $t("contacts.fields.urls") }}</legend>
          <div class="space-y-2">
            <div v-for="(entry, i) in form.urls" :key="i">
              <div class="flex items-center gap-2">
                <label class="input input-sm min-w-0 flex-1">
                  <Link class="size-4 opacity-50" />
                  <input v-model.trim="entry.value" type="text" inputmode="url" :placeholder="$t('links.placeholder')" :data-entry="`urls-${i}`" :aria-label="$t('contacts.fields.urlsOne')" />
                </label>
                <button type="button" class="btn btn-sm" :disabled="!entry.value || lookingUp !== undefined" @click="findPhoto(i)">
                  <span v-if="lookingUp === i" class="loading loading-spinner loading-xs"></span>{{ $t("links.find") }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm btn-square" :aria-label="$t('contacts.remove')" @click="removeEntry('urls', i)"><X class="size-4" /></button>
              </div>
              <p v-if="linkError?.index === i" class="mt-1 text-xs text-error" role="alert">{{ linkError.message }}</p>
              <div v-if="found?.index === i" class="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-base-300 p-3">
                <ContactAvatar :name="displayName({ ...form, name: current?.name })" :photo-url="photoUrl" size="size-10" />
                <ArrowRight class="size-4 text-base-content/40" />
                <img :src="`data:image/jpeg;base64,${found.lookup.photo}`" :alt="$t('links.foundOn', { network: found.lookup.network })" class="size-10 rounded-full object-cover" />
                <div class="min-w-[9rem] flex-1 text-sm">
                  <div class="font-medium">{{ $t("links.foundOn", { network: found.lookup.network }) }}</div>
                  <div class="text-xs text-base-content/60">{{ $t(isPlaceholder ? "contacts.useInsteadOfPlaceholder" : photoUrl ? "contacts.useInstead" : "contacts.useIt") }}</div>
                </div>
                <button type="button" class="btn btn-primary btn-xs" :disabled="Boolean(busy)" @click="useFound"><Check class="size-3.5" />{{ $t("contacts.usePhoto") }}</button>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs mt-1" @click="addEntry('urls')"><Plus class="size-3.5" />{{ $t("contacts.add.urls") }}</button>
        </fieldset>

        <fieldset>
          <legend class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50"><Cake class="size-3.5" />{{ $t("contacts.fields.birthday") }}</legend>
          <div class="grid grid-cols-3 gap-2">
            <select v-model.number="birthdayDay" class="select select-sm w-full" :aria-label="$t('contacts.fields.day')">
              <option :value="0">{{ $t("contacts.fields.day") }}</option>
              <option v-for="d in 31" :key="d" :value="d">{{ d }}</option>
            </select>
            <select v-model.number="birthdayMonth" class="select select-sm w-full" :aria-label="$t('contacts.fields.month')">
              <option :value="0">{{ $t("contacts.fields.month") }}</option>
              <option v-for="(m, i) in months" :key="i" :value="i + 1">{{ m }}</option>
            </select>
            <input v-model="birthdayYear" type="number" min="1" max="9999" class="input input-sm w-full" :placeholder="$t('contacts.fields.year')" :aria-label="$t('contacts.fields.year')" />
          </div>
        </fieldset>

        <fieldset>
          <legend class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50"><MapPin class="size-3.5" />{{ $t("contacts.fields.addresses") }}</legend>
          <div class="space-y-2">
            <div v-for="(address, i) in form.addresses" :key="i" class="space-y-2 rounded-xl border border-base-300 p-3">
              <div class="flex items-center gap-2">
                <input v-model.trim="address.street" class="input input-sm min-w-0 flex-1" :placeholder="$t('contacts.fields.street')" :aria-label="$t('contacts.fields.street')" />
                <select v-model="address.type" class="select select-sm w-28" :aria-label="$t('contacts.fields.type')">
                  <option v-for="type in typeOptions('addresses', address.type)" :key="type" :value="type">{{ typeLabel(type) }}</option>
                </select>
                <button type="button" class="btn btn-ghost btn-sm btn-square" :aria-label="$t('contacts.remove')" @click="removeEntry('addresses', i)"><X class="size-4" /></button>
              </div>
              <div class="grid grid-cols-[6rem_1fr_1fr] gap-2">
                <input v-model.trim="address.postalCode" class="input input-sm w-full" :placeholder="$t('contacts.fields.postalCode')" :aria-label="$t('contacts.fields.postalCode')" />
                <input v-model.trim="address.city" class="input input-sm w-full" :placeholder="$t('contacts.fields.city')" :aria-label="$t('contacts.fields.city')" />
                <input v-model.trim="address.country" class="input input-sm w-full" :placeholder="$t('contacts.fields.country')" :aria-label="$t('contacts.fields.country')" />
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs mt-1" @click="addAddress"><Plus class="size-3.5" />{{ $t("contacts.add.addresses") }}</button>
        </fieldset>

        <fieldset>
          <legend class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50"><Tag class="size-3.5" />{{ $t("contacts.fields.labels") }}</legend>
          <div class="flex flex-wrap items-center gap-1.5">
            <span v-for="id in form.labels" :key="id" class="badge badge-primary badge-soft gap-1">
              {{ labelName(id) }}
              <button type="button" :aria-label="$t('contacts.removeLabel', { name: labelName(id) })" @click="form.labels = form.labels.filter((l) => l !== id)"><X class="size-3" /></button>
            </span>
            <details ref="labelMenu" class="dropdown">
              <summary class="btn btn-ghost btn-xs"><Plus class="size-3.5" />{{ $t("contacts.addLabel") }}</summary>
              <div class="dropdown-content z-10 mt-1 w-64 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
                <ul class="max-h-48 overflow-y-auto">
                  <li v-for="label in unusedLabels" :key="label.id">
                    <button type="button" class="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-base-200" @click="addLabel(label.id)">{{ label.name }}</button>
                  </li>
                </ul>
                <div class="mt-1 flex gap-1 border-t border-base-300 pt-2">
                  <input v-model="newLabel" class="input input-xs min-w-0 flex-1" :placeholder="$t('contacts.newLabel')" :aria-label="$t('contacts.newLabel')" @keydown.enter.prevent="createLabel" />
                  <button type="button" class="btn btn-xs" :disabled="!newLabel.trim() || busy === 'label'" @click="createLabel">{{ $t("contacts.create") }}</button>
                </div>
              </div>
            </details>
          </div>
        </fieldset>

        <fieldset>
          <legend class="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50"><NotebookPen class="size-3.5" />{{ $t("contacts.fields.notes") }}</legend>
          <textarea v-model="form.notes" class="textarea textarea-sm w-full" rows="3" :aria-label="$t('contacts.fields.notes')"></textarea>
        </fieldset>
      </form>

      <footer class="border-t border-base-300 px-6 py-4">
        <p v-if="error" class="mb-3 flex flex-wrap items-center gap-2 text-sm text-error" role="alert">
          {{ error }}<button v-if="conflict" type="button" class="btn btn-xs" @click="reload">{{ $t("contacts.reload") }}</button>
        </p>
        <div class="flex items-center gap-2">
          <span class="flex-1 text-xs text-base-content/50">{{ $t("contacts.saveHint") }}</span>
          <button type="button" class="btn btn-ghost btn-sm" @click="close">{{ $t("common.cancel") }}</button>
          <button type="submit" form="contact-form" class="btn btn-primary btn-sm" :disabled="Boolean(busy)">
            <span v-if="busy === 'save'" class="loading loading-spinner loading-xs"></span><Check v-else class="size-4" />{{ $t("contacts.save") }}
          </button>
        </div>
      </footer>
    </aside>
  </div>
</template>
