<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { FileUp, Info, LogIn, ScanSearch, ShieldAlert, Square } from "lucide-vue-next";

import NetworkMark from "./NetworkMark.vue";
import { api, ApiError } from "../../api";
import { number } from "../../format";
import { exportNetworks, networkInfo, scanNetworks, searchNetworks } from "../../profileNetworks";
import { ProfilesOverview, SocialNetwork } from "../../../../interfaces/api";

// Where suggestions come from (issue #61): the user's data exports, a public
// search by name, and (desktop, experimental) a scan with the user's login.
const props = defineProps<{ overview: ProfilesOverview }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();

const people = (network: SocialNetwork) => props.overview.sources.find((s) => s.network === network)?.people ?? 0;
const message = ref<{ network: SocialNetwork; text: string; error?: boolean }>();
const scanMessage = ref<{ network: SocialNetwork; text: string }>();

// Exports.
async function importFiles(network: "instagram" | "linkedin", event: Event): Promise<void> {
  const files = [...((event.target as HTMLInputElement).files ?? [])];
  (event.target as HTMLInputElement).value = "";
  let read = 0;
  try {
    for (const file of files) read += (await api.importProfiles(network, file)).read;
    message.value = { network, text: t("profiles.sources.imported", { count: number(read, locale.value) }) };
  } catch (e) {
    const code = e instanceof ApiError ? e.code : undefined;
    message.value = { network, text: t(`profiles.errors.${code === "no_people" ? "noPeople" : "unreadable"}`), error: true };
  }
  emit("changed");
}

// Public search.
const searchOn = ref<Record<string, boolean>>({ bluesky: true, mastodon: true, github: false });
async function startSearch(): Promise<void> {
  await api.searchProfiles(searchNetworks.filter((n) => searchOn.value[n])).catch(() => undefined);
  emit("changed");
}
async function stopSearch(): Promise<void> {
  await api.stopProfileSearch().catch(() => undefined);
  emit("changed");
}

// Login scan.
const scan = (network: SocialNetwork) => props.overview.scans?.find((s) => s.network === network);
const risk = ref<SocialNetwork>();
const accepted = ref(false);
const busy = ref<SocialNetwork>();
async function scanAction(action: "login" | "logout" | "start" | "stop", network: SocialNetwork): Promise<void> {
  busy.value = network;
  try {
    await api.profileScan(action, network, action === "start");
  } catch {
    scanMessage.value = { network, text: t("profiles.errors.scan") };
  }
  busy.value = undefined;
  risk.value = undefined;
  accepted.value = false;
  emit("changed");
}
const stoppedText = (stopped?: string) =>
  !stopped ? "" : stopped === "signin" || stopped === "limited" || stopped === "stopped" ? t(`profiles.scan.stopped.${stopped}`) : t("profiles.scan.stopped.error");
</script>

<template>
  <div class="grid items-start gap-5 xl:grid-cols-3" data-testid="profile-sources">
    <!-- Exports -->
    <section class="space-y-4 rounded-box border border-base-300 bg-base-100 p-5">
      <h2 class="flex items-center gap-2 font-semibold"><FileUp class="size-5 text-primary" />{{ $t("profiles.sources.exports") }}</h2>
      <p class="text-xs text-base-content/60">{{ $t("profiles.sources.exportsLead") }}</p>
      <div v-for="network in exportNetworks" :key="network" class="flex flex-wrap items-center gap-3">
        <NetworkMark :network="network" />
        <div class="min-w-[8rem] flex-1 text-sm">
          <div class="font-medium">{{ networkInfo[network].name }}</div>
          <div class="text-xs text-base-content/60">{{ $t(`profiles.sources.files.${network}`) }}</div>
        </div>
        <span v-if="overview.sources.find((s) => s.network === network)?.imported" class="badge badge-success badge-soft badge-sm">{{ $t("profiles.sources.people", { count: number(people(network), locale) }, people(network)) }}</span>
        <label class="btn btn-xs">
          <FileUp class="size-3.5" />{{ $t("profiles.sources.choose") }}
          <input type="file" class="hidden" :accept="network === 'instagram' ? '.json,application/json' : '.csv,text/csv'" :multiple="network === 'instagram'" :data-testid="`import-${network}`" @change="importFiles(network, $event)" />
        </label>
        <p v-if="message?.network === network" class="w-full text-xs" :class="message.error ? 'text-error' : 'text-success'" role="status">{{ message.text }}</p>
      </div>
      <p class="flex gap-1.5 text-xs text-base-content/50"><Info class="mt-px size-3.5 shrink-0" />{{ $t("profiles.sources.howTo") }}</p>
      <p class="text-xs text-base-content/50">{{ $t("profiles.sources.facebookExport") }}</p>
    </section>

    <!-- Public search -->
    <section class="space-y-4 rounded-box border border-base-300 bg-base-100 p-5">
      <h2 class="flex items-center gap-2 font-semibold"><ScanSearch class="size-5 text-primary" />{{ $t("profiles.sources.search") }}</h2>
      <p class="text-xs text-base-content/60">{{ $t("profiles.sources.searchLead") }}</p>
      <label v-for="network in searchNetworks" :key="network" class="flex items-center gap-3">
        <NetworkMark :network="network" />
        <span class="flex-1 text-sm font-medium">{{ networkInfo[network].name }}<span v-if="network === 'github'" class="block text-xs font-normal text-base-content/50">{{ $t("profiles.sources.githubSlow") }}</span></span>
        <input v-model="searchOn[network]" type="checkbox" class="toggle toggle-primary toggle-sm" :disabled="overview.search.running" :aria-label="networkInfo[network].name" />
      </label>
      <div v-if="overview.search.running || overview.search.total" data-testid="search-progress">
        <div class="flex justify-between gap-2 text-xs text-base-content/60">
          <span>{{ overview.search.running ? $t("profiles.sources.searching", { checked: overview.search.checked, total: overview.search.total }) : $t("profiles.sources.searched", { total: overview.search.total }) }}</span>
          <span>{{ Object.entries(overview.search.found).map(([n, c]) => `${networkInfo[n as SocialNetwork].name} ${c}`).join(" · ") }}</span>
        </div>
        <progress class="progress progress-primary mt-1 h-1.5 w-full" :value="overview.search.checked" :max="overview.search.total || 1"></progress>
        <p v-if="overview.search.error?.startsWith('limited:')" class="mt-1 text-xs text-warning">{{ $t("profiles.sources.limited", { network: networkInfo[overview.search.error.slice(8) as SocialNetwork]?.name }) }}</p>
      </div>
      <button v-if="overview.search.running" type="button" class="btn btn-sm" @click="stopSearch"><Square class="size-4" />{{ $t("profiles.sources.stop") }}</button>
      <button v-else type="button" class="btn btn-primary btn-sm" :disabled="!searchNetworks.some((n) => searchOn[n])" @click="startSearch"><ScanSearch class="size-4" />{{ $t("profiles.sources.startSearch") }}</button>
    </section>

    <!-- Login scan (desktop app) -->
    <section class="space-y-4 rounded-box border border-base-300 bg-base-100 p-5" data-testid="profile-scan">
      <h2 class="flex flex-wrap items-center gap-2 font-semibold"><LogIn class="size-5 text-warning" />{{ $t("profiles.sources.login") }}<span class="badge badge-warning badge-soft badge-xs">{{ $t("profiles.sources.experimental") }}</span></h2>
      <p class="text-xs text-base-content/60">{{ $t("profiles.sources.loginLead") }}</p>
      <div class="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs"><ShieldAlert class="size-4 shrink-0 text-warning" /><span>{{ $t("profiles.sources.loginRisk") }}</span></div>
      <template v-if="overview.scans">
        <div v-for="network in scanNetworks" :key="network" class="flex flex-wrap items-center gap-3">
          <NetworkMark :network="network" />
          <div class="min-w-[8rem] flex-1 text-sm">
            <div class="font-medium">{{ networkInfo[network].name }}</div>
            <div class="text-xs text-base-content/60">
              <template v-if="scan(network)?.running">{{ $t("profiles.scan.reading", { count: scan(network)?.read ?? 0 }) }}</template>
              <template v-else-if="scan(network)?.loggedIn">{{ $t("profiles.scan.loggedIn") }}<template v-if="scan(network)?.finishedAt"> · {{ $t("profiles.scan.read", { count: scan(network)?.read ?? 0 }) }}</template></template>
              <template v-else>{{ $t("profiles.scan.notLoggedIn") }}</template>
              <span v-if="scan(network)?.stopped" class="block text-warning">{{ stoppedText(scan(network)?.stopped) }}</span>
            </div>
          </div>
          <span v-if="busy === network" class="loading loading-spinner loading-xs"></span>
          <template v-else-if="scan(network)?.running"><button type="button" class="btn btn-xs" @click="scanAction('stop', network)">{{ $t("profiles.sources.stop") }}</button></template>
          <template v-else-if="scan(network)?.loggedIn">
            <button type="button" class="btn btn-warning btn-soft btn-xs" @click="risk = network">{{ $t(`profiles.scan.start.${network}`) }}</button>
            <button type="button" class="btn btn-ghost btn-xs" @click="scanAction('logout', network)">{{ $t("profiles.scan.logout") }}</button>
          </template>
          <button v-else type="button" class="btn btn-xs" @click="scanAction('login', network)">{{ $t("profiles.scan.login") }}</button>
          <p v-if="scanMessage?.network === network" class="w-full text-xs text-error" role="alert">{{ scanMessage.text }}</p>
        </div>
      </template>
      <p v-else class="text-sm text-base-content/60">{{ $t("profiles.sources.desktopOnly") }}</p>
    </section>

    <div v-if="risk" class="fixed inset-0 z-30 grid place-items-center p-4" role="dialog" aria-modal="true" :aria-label="$t(`profiles.scan.riskTitle.${risk}`)" data-testid="scan-risk">
      <div class="absolute inset-0 bg-base-content/25" @click="risk = undefined"></div>
      <div class="relative w-full max-w-lg rounded-box border border-base-300 bg-base-100 p-6 shadow-xl">
        <div class="flex items-center gap-3"><NetworkMark :network="risk" size="size-10" /><h2 class="flex-1 text-lg font-semibold">{{ $t(`profiles.scan.riskTitle.${risk}`) }}</h2></div>
        <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-base-content/80">
          <li>{{ $t(`profiles.scan.riskWhat.${risk}`) }}</li>
          <li>{{ $t("profiles.scan.riskTerms", { network: networkInfo[risk].name }) }}</li>
          <li>{{ $t("profiles.scan.riskSlow") }}</li>
          <li>{{ $t("profiles.scan.riskLocal", { network: networkInfo[risk].name }) }}</li>
        </ul>
        <label class="mt-4 flex items-start gap-2 text-sm"><input v-model="accepted" type="checkbox" class="checkbox checkbox-warning checkbox-sm mt-0.5" />{{ $t("profiles.scan.accept", { network: networkInfo[risk].name }) }}</label>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn btn-ghost btn-sm" @click="risk = undefined">{{ $t("common.cancel") }}</button>
          <button type="button" class="btn btn-warning btn-sm" :disabled="!accepted" @click="scanAction('start', risk)">{{ $t(`profiles.scan.start.${risk}`) }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
