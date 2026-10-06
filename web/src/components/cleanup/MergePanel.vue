<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { GitMerge, ShieldCheck } from "lucide-vue-next";

import ContactAvatar from "../ContactAvatar.vue";
import { api, ApiError, withGoogleDetail } from "../../api";
import { birthday, relativeTime } from "../../format";
import { CleanupContact, DuplicateGroup, MergeRequest } from "../../../../interfaces/api";

// The merge table of mockup 4 in issue #8: one column per contact, one
// value per row (radio) or combined lists (checkboxes).
// The Contacts page (issue #55) merges contacts the user picked: `mergeWith`
// sends the request there, and `intro` replaces the "why they match" line.
const props = defineProps<{ group: DuplicateGroup; contacts: Record<string, CleanupContact>; mergeWith?: (request: MergeRequest) => Promise<string>; intro?: string }>();
const emit = defineEmits<{ merged: [actionId: string]; notDuplicates: []; skip: [] }>();
const { locale, t } = useI18n();

type Single = "name" | "photo" | "company" | "birthday";
type Multi = "phones" | "emails" | "addresses";

const people = computed(() => props.group.contactIds.map((id) => props.contacts[id]).filter(Boolean));
const keepId = computed(() => props.group.contactIds[0]);

const has: Record<Single | Multi, (c: CleanupContact) => boolean> = {
  name: (c) => Boolean(c.name),
  photo: (c) => c.hasPhoto,
  company: (c) => Boolean(c.company),
  birthday: (c) => Boolean(c.birthday),
  phones: (c) => c.phones.length > 0,
  emails: (c) => c.emails.length > 0,
  addresses: (c) => c.addresses.length > 0,
};
const rows = computed(() =>
  (["name", "photo", "phones", "emails", "company", "birthday", "addresses"] as const).filter((row) => row === "name" || people.value.some(has[row]))
);
const isMulti = (row: Single | Multi): row is Multi => ["phones", "emails", "addresses"].includes(row);

const single = ref<Record<Single, string>>({ name: "", photo: "", company: "", birthday: "" });
const multi = ref<Record<Multi, string[]>>({ phones: [], emails: [], addresses: [] });
const busy = ref(false);
const error = ref<string>();

// The kept contact's value, else the first one that has it.
function reset(): void {
  const pick = (field: Single) => (has[field](props.contacts[keepId.value]) ? keepId.value : people.value.find(has[field])?.id ?? keepId.value);
  single.value = { name: pick("name"), photo: pick("photo"), company: pick("company"), birthday: pick("birthday") };
  multi.value = { phones: people.value.filter(has.phones).map((c) => c.id), emails: people.value.filter(has.emails).map((c) => c.id), addresses: people.value.filter(has.addresses).map((c) => c.id) };
  error.value = undefined;
}
watch(() => props.group.id, reset, { immediate: true });

function toggle(row: Multi, id: string, on: boolean): void {
  multi.value[row] = on ? [...multi.value[row], id] : multi.value[row].filter((x) => x !== id);
}

// What the group shares, for the explanation under the name.
const shared = computed(() => {
  if (props.intro) return props.intro;
  const [first, ...rest] = people.value;
  if (props.group.reasons.includes("phone")) {
    const number = first.phones.find((p) => p.e164 && rest.every((c) => c.phones.some((q) => q.e164 === p.e164)));
    if (number) return t("cleanup.sharePhone", { count: people.value.length, value: number.value });
  }
  if (props.group.reasons.includes("email")) {
    const email = first.emails.find((e) => rest.every((c) => c.emails.some((f) => f.value.toLowerCase() === e.value.toLowerCase())));
    if (email) return t("cleanup.shareEmail", { count: people.value.length, value: email.value });
  }
  return t("cleanup.shareName", { count: people.value.length });
});
const likely = computed(() => props.group.reasons.some((r) => r !== "name"));

async function merge(): Promise<void> {
  busy.value = true;
  error.value = undefined;
  const value = (field: Single) => (has[field](props.contacts[single.value[field]]) ? single.value[field] : null);
  const request: MergeRequest = {
    groupId: props.group.id,
    keepId: keepId.value,
    name: single.value.name,
    photo: value("photo"),
    company: value("company"),
    birthday: value("birthday"),
    ...multi.value,
  };
  try {
    emit("merged", props.mergeWith ? await props.mergeWith(request) : (await api.merge(request)).actionId);
  } catch (e) {
    const changed = props.mergeWith ? t("contacts.errors.mergeChanged") : t("cleanup.changed");
    error.value = e instanceof ApiError && e.code === "changed_since_scan" ? changed : withGoogleDetail(t("cleanup.mergeError"), e);
  }
  busy.value = false;
}
</script>

<template>
  <section class="flex min-w-0 flex-col rounded-box border border-base-300 bg-base-100 p-6" data-testid="merge-panel">
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-[14rem] flex-1">
        <h2 class="text-xl font-bold">{{ contacts[keepId]?.name ?? $t("cleanup.noName") }}</h2>
        <p class="mt-1 text-sm text-base-content/60">{{ shared }} {{ $t("cleanup.pick") }}</p>
      </div>
      <span v-if="!mergeWith" class="badge badge-soft" :class="likely ? 'badge-warning' : 'badge-ghost'">{{ $t(likely ? "cleanup.likely" : "cleanup.possible") }}</span>
    </div>

    <div class="mt-5 overflow-x-auto">
      <table class="table table-sm min-w-[36rem]">
        <thead>
          <tr>
            <th class="w-28"></th>
            <th v-for="(c, i) in people" :key="c.id" class="font-medium">
              <div class="flex items-center gap-2">
                <ContactAvatar :name="c.name" :photo-url="c.photoUrl" size="size-8" />
                <span>
                  {{ $t("cleanup.contact", { letter: String.fromCharCode(65 + i) }) }}
                  <template v-if="c.updatedAt"> · {{ $t("cleanup.edited", { when: relativeTime(c.updatedAt, locale) }) }}</template>
                  <span v-if="i === 0" class="block text-xs font-normal text-base-content/50">{{ $t("cleanup.kept") }}</span>
                </span>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row">
            <th class="align-top font-normal text-base-content/60">{{ $t(`cleanup.fields.${row}`) }}</th>
            <td
              v-for="c in people"
              :key="c.id"
              class="align-top"
              :class="(isMulti(row) ? multi[row].includes(c.id) && has[row](c) : single[row] === c.id) ? 'bg-primary/5' : ''"
            >
              <label class="flex cursor-pointer items-start gap-2.5" :class="{ 'cursor-default': row === 'name' && !has.name(c) }">
                <input
                  v-if="isMulti(row)"
                  type="checkbox"
                  class="checkbox checkbox-primary checkbox-sm mt-0.5"
                  :aria-label="`${$t(`cleanup.fields.${row}`)} · ${c.name ?? c.id}`"
                  :disabled="!has[row](c)"
                  :checked="multi[row].includes(c.id) && has[row](c)"
                  @change="toggle(row, c.id, ($event.target as HTMLInputElement).checked)"
                />
                <input
                  v-else
                  v-model="single[row]"
                  type="radio"
                  class="radio radio-primary radio-sm mt-0.5"
                  :name="`${group.id}-${row}`"
                  :value="c.id"
                  :aria-label="`${$t(`cleanup.fields.${row}`)} · ${c.name ?? c.id}`"
                  :disabled="row === 'name' && !has.name(c)"
                />
                <span class="min-w-0 text-sm">
                  <template v-if="!has[row](c)"><span class="text-base-content/40">—</span></template>
                  <template v-else-if="row === 'name'">{{ c.name }}</template>
                  <img v-else-if="row === 'photo'" :src="c.photoUrl" alt="" class="size-10 rounded-lg object-cover" referrerpolicy="no-referrer" />
                  <template v-else-if="row === 'company'">{{ c.company }}</template>
                  <template v-else-if="row === 'birthday'">{{ birthday(c.birthday!, locale) }}</template>
                  <template v-else-if="row === 'phones'"><span v-for="p in c.phones" :key="p.value" class="block">{{ p.value }}<span v-if="p.type" class="text-base-content/50"> ({{ p.type }})</span></span></template>
                  <template v-else-if="row === 'emails'"><span v-for="e in c.emails" :key="e.value" class="block break-all">{{ e.value }}</span></template>
                  <template v-else><span v-for="a in c.addresses" :key="a.value" class="block">{{ a.value }}</span></template>
                </span>
              </label>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-xs text-base-content/50">{{ $t("cleanup.labelsNote") }}</p>

    <span class="flex-1"></span>
    <p v-if="error" class="mt-4 text-sm text-error" role="alert">{{ error }}</p>
    <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-base-300 pt-5">
      <p class="flex min-w-[14rem] flex-1 items-start gap-2 text-xs text-base-content/60"><ShieldCheck class="size-4 shrink-0 text-success" />{{ $t("cleanup.backupNote") }}</p>
      <button v-if="!mergeWith" type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="emit('notDuplicates')">{{ $t("cleanup.notDuplicates") }}</button>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="emit('skip')">{{ mergeWith ? $t("common.cancel") : $t("cleanup.skip") }}</button>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="merge">
        <span v-if="busy" class="loading loading-spinner loading-xs"></span><GitMerge v-else class="size-4" />{{ busy ? $t("cleanup.merging") : $t("cleanup.merge") }}
      </button>
    </div>
  </section>
</template>
