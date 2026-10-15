<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { KeyRound, LogOut } from "lucide-vue-next";

import SettingRow from "./SettingRow.vue";
import PhotoZoom from "../PhotoZoom.vue";
import GoogleSignIn from "../GoogleSignIn.vue";
import SettingsCard from "./SettingsCard.vue";
import { api } from "../../api";
import { number } from "../../format";
import { applyStatus, isDesktop, sessionStatus } from "../../settings";
import { GoogleAccount } from "../../../../interfaces/api";

const { locale } = useI18n();
const account = ref<GoogleAccount>();
const signingOut = ref(false);

async function signOut(): Promise<void> {
  signingOut.value = true;
  await api.googleSignOut().catch(() => undefined);
  // Set up once: signing in again happens right here, not in the wizard.
  applyStatus(await api.status());
  account.value = undefined;
  signingOut.value = false;
}

onMounted(async () => {
  if (sessionStatus.value?.googleConnected === false) return;
  account.value = await api.account().catch(() => ({}));
});
</script>

<template>
  <SettingsCard v-if="isDesktop && sessionStatus?.googleConnected === false">
    <div class="flex items-center gap-4">
      <span class="grid size-12 place-items-center rounded-full border border-base-300"><img src="/google_logo.svg" alt="" class="size-5" /></span>
      <div class="min-w-[12rem] flex-1">
        <div class="font-semibold">Google</div>
        <div class="text-sm text-base-content/60">{{ $t("settings.google.signedOut") }}</div>
      </div>
      <span class="badge badge-soft badge-warning">{{ $t("settings.google.notConnected") }}</span>
    </div>
    <GoogleSignIn class="mt-2" />
    <SettingRow class="mt-4" :title="$t('settings.google.project')" :description="$t('settings.google.projectHint')">
      <router-link to="/setup/google" class="btn btn-ghost btn-sm"><KeyRound class="size-4" />{{ $t("settings.google.change") }}</router-link>
    </SettingRow>
  </SettingsCard>
  <SettingsCard v-else>
    <div class="flex flex-wrap items-center gap-4 pb-5" data-testid="google-account">
      <PhotoZoom v-if="account?.photoUrl" :src="account.photoUrl" :name="account.name"><img :src="account.photoUrl" alt="" class="size-12 rounded-full" referrerpolicy="no-referrer" /></PhotoZoom>
      <span v-else class="grid size-12 place-items-center rounded-full border border-base-300"><img src="/google_logo.svg" alt="" class="size-5" /></span>
      <div class="min-w-[12rem] flex-1">
        <div class="font-semibold">{{ account?.name ?? account?.email ?? "Google" }}</div>
        <div class="text-sm text-base-content/60">
          <template v-if="account?.name && account.email">{{ account.email }} · </template>
          <template v-if="account?.totalContacts !== undefined">{{ $t("setup.signin.contacts", { count: number(account.totalContacts, locale) }) }}</template>
        </div>
      </div>
      <span class="badge badge-soft badge-success">{{ $t("dashboard.connected") }}</span>
    </div>
    <template v-if="isDesktop">
      <SettingRow :title="$t('settings.google.signOut')" :description="$t('settings.google.signOutHint')">
        <button type="button" class="btn btn-sm" :disabled="signingOut" @click="signOut"><LogOut class="size-4" />{{ $t("setup.signin.signOut") }}</button>
      </SettingRow>
      <SettingRow :title="$t('settings.google.project')" :description="$t('settings.google.projectHint')">
        <router-link to="/setup/google" class="btn btn-ghost btn-sm"><KeyRound class="size-4" />{{ $t("settings.google.change") }}</router-link>
      </SettingRow>
    </template>
    <p v-else class="pt-5 text-sm text-base-content/60">{{ $t("settings.google.webNote") }}</p>
  </SettingsCard>
</template>
