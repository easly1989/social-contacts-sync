<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Check, Copy, FileUp, Info, LogIn, ScanSearch, ShieldAlert, Square, TriangleAlert } from "lucide-vue-next";

import NetworkMark from "./NetworkMark.vue";
import { api, ApiError } from "../../api";
import { dateTime, number } from "../../format";
import { exportNetworks, networkInfo, scanNetworks, searchNetworks } from "../../profileNetworks";
import { notify, notifyError } from "../../toasts";
import { ProfilesOverview, SocialNetwork } from "../../../../interfaces/api";

// Where suggestions come from (issues #61, #65): the user's data exports, a
// public search by name, and (desktop, experimental) a scan with the user's
// login. One full-width row per network, with when it was last read.
const props = defineProps<{ overview: ProfilesOverview }>();
const emit = defineEmits<{ changed: [] }>();
const { t, locale } = useI18n();

const source = (network: SocialNetwork) => props.overview.sources.find((s) => s.network === network);
const people = (network: SocialNetwork) => source(network)?.people ?? 0;
const when = (iso?: string) => (iso ? dateTime(iso, locale.value) : "");

// Exports.
async function importFiles(network: "instagram" | "linkedin", event: Event): Promise<void> {
  const files = [...((event.target as HTMLInputElement).files ?? [])];
  (event.target as HTMLInputElement).value = "";
  let read = 0;
  try {
    for (const file of files) read += (await api.importProfiles(network, file)).read;
    notify(t("profiles.sources.imported", { count: number(read, locale.value) }));
  } catch (e) {
    const code = e instanceof ApiError ? e.code : undefined;
    notifyError(t(`profiles.errors.${code === "no_people" ? "noPeople" : "unreadable"}`), e);
  }
  emit("changed");
}
const exportStatus = (network: SocialNetwork) => {
  const s = source(network);
  return [
    s?.imported ? t("profiles.sources.people", { count: number(people(network), locale.value) }, people(network)) : t("profiles.sources.notImported"),
    s?.imported ? t("profiles.sources.importedAt", { when: when(s.imported) }) : "",
    t(`profiles.sources.files.${network}`),
  ]
    .filter(Boolean)
    .join(" · ");
};

// Public search.
const searchOn = ref<Record<string, boolean>>({ bluesky: true, mastodon: true, github: false });
async function startSearch(): Promise<void> {
  await api.searchProfiles(searchNetworks.filter((n) => searchOn.value[n])).catch((e) => notifyError(t("profiles.errors.search"), e));
  emit("changed");
}
async function stopSearch(): Promise<void> {
  await api.stopProfileSearch().catch(() => undefined);
  emit("changed");
}
const searchStatus = (network: SocialNetwork) => {
  const s = source(network);
  return [
    s?.searched ? t("profiles.sources.found", { count: number(people(network), locale.value) }) : t("profiles.sources.notSearched"),
    s?.searched ? t("profiles.sources.searchedAt", { when: when(s.searched) }) : "",
    network === "github" ? t("profiles.sources.githubSlow") : "",
  ]
    .filter(Boolean)
    .join(" · ");
};

// Login scan.
const scan = (network: SocialNetwork) => props.overview.scans?.find((s) => s.network === network);
const risk = ref<SocialNetwork>();
const accepted = ref(false);
const busy = ref<SocialNetwork>();
async function scanAction(action: "login" | "logout" | "start" | "stop", network: SocialNetwork): Promise<void> {
  busy.value = network;
  try {
    await api.profileScan(action, network, action === "start");
  } catch (e) {
    notifyError(t("profiles.errors.scan"), e);
  }
  busy.value = undefined;
  risk.value = undefined;
  accepted.value = false;
  emit("changed");
}
const scanStatus = (network: SocialNetwork) => {
  const s = scan(network);
  if (s?.running) return t("profiles.scan.reading", { count: s.read ?? 0 });
  return [
    s?.loggedIn ? t("profiles.scan.loggedIn") : t("profiles.scan.notLoggedIn"),
    s?.finishedAt ? t("profiles.scan.read", { count: s.read ?? 0 }) : "",
    s?.finishedAt ? t("profiles.sources.scannedAt", { when: when(s.finishedAt) }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
};
const stoppedText = (stopped: string) => (["signin", "limited", "stopped"].includes(stopped) ? t(`profiles.scan.stopped.${stopped}`) : t("profiles.scan.stopped.error"));
/** What the site actually answered, for a report. */
const stoppedDetail = (stopped: string) => (stopped.startsWith("error:") ? stopped.slice(6) : undefined);
const copied = ref<SocialNetwork>();
async function copy(network: SocialNetwork, text: string): Promise<void> {
  await navigator.clipboard?.writeText(text).catch(() => undefined);
  copied.value = network;
  window.setTimeout(() => (copied.value = undefined), 2000);
}
</script>

<template>
  <div class="max-w-4xl space-y-5" data-testid="profile-sources">
    <!-- Exports -->
    <section class="rounded-box border border-base-300 bg-base-100 px-6 pb-2 pt-5">
      <h2 class="flex items-center gap-2 font-semibold"><FileUp class="size-5 text-primary" />{{ $t("profiles.sources.exports") }}</h2>
      <p class="mt-1 text-xs text-base-content/60">{{ $t("profiles.sources.exportsLead") }}</p>
      <div v-for="network in exportNetworks" :key="network" class="flex flex-wrap items-center gap-4 border-b border-base-300 py-3.5 last:border-0" :data-testid="`source-${network}`">
        <NetworkMark :network="network" size="size-9" />
        <div class="min-w-[12rem] flex-1">
          <div class="text-sm font-semibold">{{ networkInfo[network].name }}</div>
          <div class="text-xs text-base-content/60">{{ exportStatus(network) }}</div>
        </div>
        <label class="btn btn-sm">
          <FileUp class="size-4" />{{ source(network)?.imported ? $t("profiles.sources.importAgain") : $t("profiles.sources.choose") }}
          <input type="file" class="hidden" :accept="network === 'instagram' ? '.json,application/json' : '.csv,text/csv'" :multiple="network === 'instagram'" :data-testid="`import-${network}`" @change="importFiles(network, $event)" />
        </label>
      </div>
      <p class="flex gap-1.5 pb-3 text-xs text-base-content/50"><Info class="mt-px size-3.5 shrink-0" />{{ $t("profiles.sources.howTo") }} {{ $t("profiles.sources.facebookExport") }}</p>
    </section>

    <!-- Public search -->
    <section class="rounded-box border border-base-300 bg-base-100 px-6 pb-5 pt-5">
      <h2 class="flex items-center gap-2 font-semibold"><ScanSearch class="size-5 text-primary" />{{ $t("profiles.sources.search") }}</h2>
      <p class="mt-1 text-xs text-base-content/60">{{ $t("profiles.sources.searchLead") }}</p>
      <label v-for="network in searchNetworks" :key="network" class="flex cursor-pointer items-center gap-4 border-b border-base-300 py-3.5">
        <NetworkMark :network="network" size="size-9" />
        <span class="min-w-[12rem] flex-1">
          <span class="block text-sm font-semibold">{{ networkInfo[network].name }}</span>
          <span class="block text-xs text-base-content/60">{{ searchStatus(network) }}</span>
        </span>
        <input v-model="searchOn[network]" type="checkbox" class="toggle toggle-primary toggle-sm" :disabled="overview.search.running" :aria-label="networkInfo[network].name" />
      </label>
      <div v-if="overview.search.running || overview.search.total" class="mt-4" data-testid="search-progress">
        <div class="flex justify-between gap-2 text-xs text-base-content/60">
          <span>{{ overview.search.running ? $t("profiles.sources.searching", { checked: overview.search.checked, total: overview.search.total }) : $t("profiles.sources.searched", { total: overview.search.total }) }}</span>
          <span>{{ Object.entries(overview.search.found).map(([n, c]) => `${networkInfo[n as SocialNetwork].name} ${c}`).join(" · ") }}</span>
        </div>
        <progress class="progress progress-primary mt-1 h-1.5 w-full" :value="overview.search.checked" :max="overview.search.total || 1"></progress>
        <p v-if="overview.search.error?.startsWith('limited:')" class="mt-1 text-xs text-warning">{{ $t("profiles.sources.limited", { network: networkInfo[overview.search.error.slice(8) as SocialNetwork]?.name }) }}</p>
      </div>
      <div class="mt-4">
        <button v-if="overview.search.running" type="button" class="btn btn-sm" @click="stopSearch"><Square class="size-4" />{{ $t("profiles.sources.stop") }}</button>
        <button v-else type="button" class="btn btn-primary btn-sm" :disabled="!searchNetworks.some((n) => searchOn[n])" @click="startSearch"><ScanSearch class="size-4" />{{ $t("profiles.sources.startSearch") }}</button>
      </div>
    </section>

    <!-- Login scan (desktop app) -->
    <section class="rounded-box border border-base-300 bg-base-100 px-6 pb-2 pt-5" data-testid="profile-scan">
      <h2 class="flex flex-wrap items-center gap-2 font-semibold"><LogIn class="size-5 text-warning" />{{ $t("profiles.sources.login") }}<span class="badge badge-warning badge-soft badge-xs">{{ $t("profiles.sources.experimental") }}</span></h2>
      <p class="mt-1 text-xs text-base-content/60">{{ $t("profiles.sources.loginLead") }}</p>
      <div class="mt-3 flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs"><ShieldAlert class="size-4 shrink-0 text-warning" /><span>{{ $t("profiles.sources.loginRisk") }}</span></div>
      <template v-if="overview.scans">
        <div v-for="network in scanNetworks" :key="network" class="border-b border-base-300 py-3.5 last:border-0" :data-testid="`scan-${network}`">
          <div class="flex flex-wrap items-center gap-4">
            <NetworkMark :network="network" size="size-9" />
            <div class="min-w-[12rem] flex-1">
              <div class="text-sm font-semibold">{{ networkInfo[network].name }}</div>
              <div class="text-xs text-base-content/60">{{ scanStatus(network) }}</div>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="busy === network" class="loading loading-spinner loading-xs"></span>
              <button v-else-if="scan(network)?.running" type="button" class="btn btn-sm" @click="scanAction('stop', network)">{{ $t("profiles.sources.stop") }}</button>
              <template v-else-if="scan(network)?.loggedIn">
                <button type="button" class="btn btn-warning btn-soft btn-sm" @click="risk = network">{{ $t(`profiles.scan.start.${network}`) }}</button>
                <button type="button" class="btn btn-ghost btn-sm" @click="scanAction('logout', network)">{{ $t("profiles.scan.logout") }}</button>
              </template>
              <button v-else type="button" class="btn btn-sm" @click="scanAction('login', network)">{{ $t("profiles.scan.login") }}</button>
            </div>
          </div>
          <div v-if="scan(network)?.stopped && !scan(network)?.running" class="mt-2 rounded-xl border border-warning/40 bg-warning/10 p-3 sm:ml-[3.25rem]" role="status">
            <p class="flex items-center gap-2 text-sm font-medium text-warning"><TriangleAlert class="size-4 shrink-0" />{{ stoppedText(scan(network)!.stopped!) }}</p>
            <div v-if="stoppedDetail(scan(network)!.stopped!)" class="mt-2 flex items-start gap-2">
              <code class="min-w-0 flex-1 select-all break-words rounded bg-base-100 px-2 py-1 text-xs text-base-content/70">{{ stoppedDetail(scan(network)!.stopped!) }}</code>
              <button type="button" class="btn btn-xs" @click="copy(network, stoppedDetail(scan(network)!.stopped!)!)">
                <Check v-if="copied === network" class="size-3.5 text-success" /><Copy v-else class="size-3.5" />{{ copied === network ? $t("toasts.copied") : $t("toasts.copyShort") }}
              </button>
            </div>
          </div>
        </div>
      </template>
      <p v-else class="py-3 text-sm text-base-content/60">{{ $t("profiles.sources.desktopOnly") }}</p>
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
