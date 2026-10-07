<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { CircleCheck, CloudUpload, FolderOpen, Upload, X } from "lucide-vue-next";

import { api, withGoogleDetail } from "../../api";
import PhotoZoom from "../PhotoZoom.vue";
import { displayName, matchFile, shrinkImage } from "../../contactTools";
import { Contact } from "../../../../interfaces/api";

// Upload photos for many contacts at once (issue #55): each file is matched
// by name or phone number, the matches can be changed, and every photo goes
// up as a placeholder.
const props = defineProps<{ contacts: Contact[] }>();
const emit = defineEmits<{ close: []; uploaded: [contact: Contact] }>();
const { t } = useI18n();

interface Row {
  key: number;
  file: File;
  preview: string;
  contactId: string;
  by?: "name" | "phone";
  state: "waiting" | "uploading" | "done" | "failed";
  error?: string;
}
const rows = ref<Row[]>([]);
const skipReal = ref(true);
const running = ref(false);
const dragging = ref(false);
const fileInput = ref<HTMLInputElement>();
let next = 0;

const byId = computed(() => new Map(props.contacts.map((c) => [c.id, c])));
const sorted = computed(() => [...props.contacts].map((c) => ({ id: c.id, name: displayName(c) || "—" })).sort((a, b) => a.name.localeCompare(b.name)));

function add(files: FileList | File[]): void {
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/") || rows.value.some((r) => r.file.name === file.name && r.file.size === file.size)) continue;
    const match = matchFile(file.name, props.contacts);
    rows.value.push({ key: next++, file, preview: URL.createObjectURL(file), contactId: match.contactId ?? "", by: match.by, state: "waiting" });
  }
}
function drop(event: DragEvent): void {
  dragging.value = false;
  if (event.dataTransfer?.files) add(event.dataTransfer.files);
}
function removeRow(row: Row): void {
  URL.revokeObjectURL(row.preview);
  rows.value = rows.value.filter((r) => r !== row);
}

/** Why a row won't be uploaded, if it won't. */
function skipReason(row: Row): "noMatch" | "hasPhoto" | "twice" | undefined {
  if (!row.contactId) return "noMatch";
  const contact = byId.value.get(row.contactId);
  if (skipReal.value && contact?.hasPhoto && !contact.placeholder && row.state !== "done") return "hasPhoto";
  if (rows.value.find((r) => r.contactId === row.contactId) !== row) return "twice";
  return undefined;
}
const toUpload = computed(() => rows.value.filter((r) => r.state !== "done" && !skipReason(r)));
const doneCount = computed(() => rows.value.filter((r) => r.state === "done").length);

async function upload(): Promise<void> {
  running.value = true;
  for (const row of toUpload.value) {
    row.state = "uploading";
    try {
      const contact = await api.uploadPhoto(row.contactId, await shrinkImage(row.file));
      row.state = "done";
      emit("uploaded", contact);
    } catch (e) {
      row.state = "failed";
      row.error = withGoogleDetail(t("contacts.errors.photo"), e);
    }
  }
  running.value = false;
}

function close(): void {
  if (running.value) return;
  emit("close");
}
const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey);
  rows.value.forEach((r) => URL.revokeObjectURL(r.preview));
});
</script>

<template>
  <div class="fixed inset-0 z-30 grid place-items-center overflow-y-auto p-4">
    <div class="absolute inset-0 bg-base-content/25" @click="close"></div>
    <section class="relative w-full max-w-4xl rounded-box border border-base-300 bg-base-100 p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="upload-title" data-testid="photo-upload">
      <div class="flex items-center gap-3">
        <h2 id="upload-title" class="flex-1 text-lg font-semibold">{{ $t("contacts.upload.title") }}</h2>
        <button type="button" class="btn btn-ghost btn-sm btn-square" :aria-label="$t('contacts.close')" :disabled="running" @click="close"><X class="size-4" /></button>
      </div>
      <p class="mt-1 text-sm text-base-content/60">{{ $t("contacts.upload.lead") }}</p>

      <div
        class="mt-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed p-4 text-sm text-base-content/60"
        :class="dragging ? 'border-primary bg-primary/5' : 'border-base-300'"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="drop"
      >
        <CloudUpload class="size-6" /><span class="flex-1">{{ rows.length ? $t("contacts.upload.dropMore") : $t("contacts.upload.drop") }}</span>
        <button type="button" class="btn btn-sm" :disabled="running" @click="fileInput?.click()"><FolderOpen class="size-4" />{{ $t("contacts.upload.choose") }}</button>
        <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" data-testid="upload-input" @change="add(($event.target as HTMLInputElement).files ?? []); ($event.target as HTMLInputElement).value = ''" />
      </div>

      <div v-if="rows.length" class="mt-4 max-h-[50vh] overflow-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>{{ $t("contacts.upload.file") }}</th>
              <th>{{ $t("contacts.upload.contact") }}</th>
              <th>{{ $t("contacts.upload.matchedBy") }}</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.key">
              <td>
                <div class="flex items-center gap-3">
                  <PhotoZoom :src="row.preview" :name="row.file.name"><img :src="row.preview" alt="" class="size-10 shrink-0 rounded-lg object-cover" /></PhotoZoom>
                  <span class="break-all font-mono text-xs">{{ row.file.name }}</span>
                </div>
              </td>
              <td>
                <select v-model="row.contactId" class="select select-sm w-56" :disabled="running || row.state === 'done'" :aria-label="$t('contacts.upload.contactFor', { file: row.file.name })" @change="row.by = undefined">
                  <option value="">{{ $t("contacts.upload.pick") }}</option>
                  <option v-for="c in sorted" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </td>
              <td class="text-xs text-base-content/60">{{ row.by ? $t(`contacts.upload.by.${row.by}`) : row.contactId ? $t("contacts.upload.by.hand") : "—" }}</td>
              <td>
                <span v-if="row.state === 'done'" class="badge badge-success badge-soft badge-sm"><CircleCheck class="size-3" />{{ $t("contacts.upload.done") }}</span>
                <span v-else-if="row.state === 'uploading'" class="loading loading-spinner loading-xs"></span>
                <span v-else-if="row.state === 'failed'" class="badge badge-error badge-soft badge-sm" :title="row.error">{{ $t("contacts.upload.failed") }}</span>
                <span v-else-if="skipReason(row)" class="badge badge-sm" :class="skipReason(row) === 'noMatch' ? 'badge-ghost' : 'badge-warning badge-soft'">{{ $t(`contacts.upload.skip.${skipReason(row)}`) }}</span>
                <span v-else class="badge badge-success badge-soft badge-sm">{{ $t("contacts.upload.ready") }}</span>
              </td>
              <td class="text-right">
                <button v-if="row.state !== 'done'" type="button" class="btn btn-ghost btn-xs btn-square" :aria-label="$t('contacts.remove')" :disabled="running" @click="removeRow(row)"><X class="size-3.5" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <label class="mt-3 flex items-center gap-2 text-sm">
        <input v-model="skipReal" type="checkbox" class="checkbox checkbox-primary checkbox-xs" :disabled="running" />{{ $t("contacts.upload.skipReal") }}
      </label>
      <div class="mt-5 flex flex-wrap items-center gap-2">
        <span class="flex-1 text-xs text-base-content/50">
          {{ $t("contacts.upload.summary", { upload: toUpload.length, skipped: rows.length - toUpload.length - doneCount }) }}<template v-if="doneCount"> · {{ $t("contacts.upload.uploaded", { count: doneCount }) }}</template>
        </span>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="running" @click="close">{{ doneCount ? $t("contacts.close") : $t("common.cancel") }}</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="running || !toUpload.length" @click="upload">
          <span v-if="running" class="loading loading-spinner loading-xs"></span><Upload v-else class="size-4" />{{ $t("contacts.upload.start", toUpload.length) }}
        </button>
      </div>
    </section>
  </div>
</template>
