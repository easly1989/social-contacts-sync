<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { FileText, FolderOpen, History, Trash2 } from "lucide-vue-next";

import SettingRow from "./SettingRow.vue";
import SettingsCard from "./SettingsCard.vue";
import { api } from "../../api";
import { desktopInfo } from "../../desktopInfo";
import { bytes } from "../../format";

// Desktop app only.
const { locale } = useI18n();
const dialog = ref<HTMLDialogElement>();
const deleting = ref(false);
const deleteError = ref(false);

async function deleteAll(): Promise<void> {
  deleting.value = true;
  deleteError.value = false;
  try {
    // The app restarts on the setup wizard once its files are gone.
    await api.deleteAllData();
  } catch {
    deleteError.value = true;
    deleting.value = false;
  }
}
</script>

<template>
  <SettingsCard>
    <SettingRow :title="$t('settings.data.folder')">
      <template #description>
        <code class="break-all font-mono text-[13px]" data-testid="data-dir">{{ desktopInfo?.dataDir ?? "…" }}</code>
        · {{ desktopInfo?.portable ? $t("settings.data.portable") : $t("settings.data.userFolder") }}
      </template>
      <button type="button" class="btn btn-ghost btn-sm" @click="api.openFolder('data')"><FolderOpen class="size-4" />{{ $t("settings.data.open") }}</button>
    </SettingRow>
    <SettingRow :title="$t('settings.data.config')">
      <template #description><code class="font-mono text-[13px]">config.env</code> · {{ $t("settings.data.configHint") }}</template>
      <button type="button" class="btn btn-ghost btn-sm" @click="api.openFolder('config')"><FileText class="size-4" />{{ $t("settings.data.show") }}</button>
    </SettingRow>
    <SettingRow :title="$t('settings.data.backups')">
      <template #description>
        {{ $t("settings.data.backupsHint") }}<template v-if="desktopInfo">
          · {{ $t("settings.data.backupsUsage", { count: desktopInfo.history.runs, size: bytes(desktopInfo.history.bytes, locale) }, desktopInfo.history.runs) }}</template>
      </template>
      <router-link to="/app/history" class="btn btn-ghost btn-sm"><History class="size-4" />{{ $t("settings.data.manage") }}</router-link>
    </SettingRow>
    <SettingRow :title="$t('settings.data.delete')" :description="$t('settings.data.deleteHint')">
      <button type="button" class="btn btn-outline btn-error btn-sm" @click="dialog?.showModal()"><Trash2 class="size-4" />{{ $t("settings.data.deleteButton") }}</button>
    </SettingRow>
  </SettingsCard>

  <dialog ref="dialog" class="modal" aria-labelledby="delete-title">
    <div class="modal-box">
      <h3 id="delete-title" class="text-lg font-bold">{{ $t("settings.data.deleteTitle") }}</h3>
      <p class="mt-2 text-sm text-base-content/70">{{ $t("settings.data.deleteText") }}</p>
      <p v-if="deleteError" class="mt-3 text-sm text-error">{{ $t("settings.saveError") }}</p>
      <div class="modal-action">
        <form method="dialog"><button class="btn btn-ghost" :disabled="deleting">{{ $t("common.cancel") }}</button></form>
        <button type="button" class="btn btn-error" :disabled="deleting" @click="deleteAll">
          <span v-if="deleting" class="loading loading-spinner loading-sm"></span><Trash2 v-else class="size-4" />
          {{ deleting ? $t("settings.data.deleting") : $t("settings.data.deleteConfirm") }}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button tabindex="-1" aria-hidden="true">{{ $t("common.cancel") }}</button></form>
  </dialog>
</template>
