<script setup lang="ts">
import { Coffee, HandHeart, Heart, RefreshCw } from "lucide-vue-next";

import BrandLogo from "../BrandLogo.vue";
import UpdateStatus from "./UpdateStatus.vue";
import { appName, donations, maintainerName, maintainerSite, repoUrl, upstreamAuthor, upstreamDonationUrl, upstreamName, upstreamUrl } from "../../brand";
import { checkForUpdates, checkingUpdates, desktopInfo, packageKey } from "../../desktopInfo";
import { isDesktop } from "../../settings";
</script>

<template>
  <div class="space-y-5">
    <section class="flex flex-wrap items-center gap-5 rounded-box border border-base-300 bg-base-100 p-6">
      <BrandLogo size="size-16" />
      <div class="min-w-[14rem] flex-1">
        <h2 class="text-xl font-bold">{{ appName }}</h2>
        <div class="mt-0.5 text-sm text-base-content/60" data-testid="about-version">
          <template v-if="isDesktop && desktopInfo">
            {{ $t("settings.updates.version", { version: desktopInfo.version }) }} · {{ $t(`settings.packages.${packageKey(desktopInfo.packageKind)}`) }} ·
            <a :href="`${repoUrl}/releases/tag/v${desktopInfo.version}`" target="_blank" class="link">{{ $t("settings.about.whatsNew") }}</a>
          </template>
          <template v-else>
            {{ $t("settings.about.webApp") }} · <a :href="`${repoUrl}/releases`" target="_blank" class="link">{{ $t("settings.about.whatsNew") }}</a>
          </template>
        </div>
        <UpdateStatus v-if="isDesktop && desktopInfo?.lastUpdate" class="mt-2" :result="desktopInfo.lastUpdate" />
      </div>
      <button v-if="isDesktop && desktopInfo?.updates !== 'none'" type="button" class="btn btn-sm" :disabled="checkingUpdates || !desktopInfo" @click="checkForUpdates">
        <RefreshCw class="size-4" :class="{ 'animate-spin': checkingUpdates }" />{{ $t("settings.updates.check") }}
      </button>
    </section>

    <div class="grid gap-5 xl:grid-cols-2">
      <section class="rounded-box border border-base-300 bg-base-100 p-6">
        <h2 class="font-semibold">{{ $t("settings.about.madeBy") }}</h2>
        <div class="mt-4 flex items-center gap-4">
          <span class="grid size-12 place-items-center rounded-full bg-linear-to-br from-primary to-secondary text-sm font-bold text-white" aria-hidden="true">CR</span>
          <div>
            <div class="font-medium">{{ maintainerName }}</div>
            <a :href="maintainerSite" target="_blank" class="link link-primary text-sm">{{ maintainerSite.replace("https://", "") }}</a>
          </div>
        </div>
        <h2 class="mt-7 font-semibold">{{ $t("settings.about.builtOn") }}</h2>
        <i18n-t keypath="settings.about.credit" tag="p" class="mt-2 text-sm leading-relaxed text-base-content/70">
          <template #project><a :href="upstreamUrl" target="_blank" class="link">{{ upstreamName }}</a></template>
          <template #author><strong class="font-semibold text-base-content">{{ upstreamAuthor }}</strong></template>
        </i18n-t>
        <a :href="upstreamDonationUrl" target="_blank" class="btn btn-ghost btn-sm mt-3 -ml-3"><Coffee class="size-4" />{{ $t("settings.about.supportOriginal") }}</a>
      </section>

      <section class="rounded-box border border-base-300 bg-base-100 p-6" data-testid="donations">
        <h2 class="flex items-center gap-2 font-semibold"><HandHeart class="size-5 text-secondary" />{{ $t("settings.about.supportTitle") }}</h2>
        <p class="mt-2 text-sm leading-relaxed text-base-content/70">{{ $t("settings.about.supportText") }}</p>
        <div class="mt-4 grid gap-2 sm:grid-cols-2">
          <a v-for="d in donations" :key="d.id" :href="d.url" target="_blank" class="btn btn-sm justify-start border-0" :class="d.className">
            <Coffee v-if="d.id === 'coffee'" class="size-4" /><Heart v-else class="size-4" />{{ d.name }}
          </a>
        </div>
      </section>
    </div>

    <p class="px-1 text-xs leading-relaxed text-base-content/50">
      {{ $t("settings.about.licence") }} ·
      <a :href="`${repoUrl}/blob/main/LICENSE`" target="_blank" class="link">{{ $t("settings.about.licenceLink") }}</a> ·
      <a :href="`${repoUrl}/network/dependencies`" target="_blank" class="link">{{ $t("settings.about.openSource") }}</a> ·
      <router-link to="/privacy" class="link">{{ $t("app.privacy") }}</router-link>
    </p>
  </div>
</template>
