<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleAlert, CircleCheck, CircleHelp, ExternalLink, Upload } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";
import { repoUrl } from "../brand";

// Mockup 1.2 in issue #8: a guided checklist for creating the user's own
// Google OAuth client, then its downloaded JSON (or pasted values).
const steps = [
  { key: "project", url: "https://console.cloud.google.com/projectcreate" },
  { key: "api", url: "https://console.cloud.google.com/apis/library/people.googleapis.com" },
  { key: "consent", url: "https://console.cloud.google.com/auth/branding" },
  { key: "client", url: "https://console.cloud.google.com/auth/clients/create" },
] as const;
type StepKey = (typeof steps)[number]["key"];

const doneKey = "scs.setup.googleSteps";
function readDone(): StepKey[] {
  try {
    return JSON.parse(localStorage.getItem(doneKey) ?? "[]");
  } catch {
    return [];
  }
}

const done = ref<StepKey[]>(readDone());
const opened = ref<StepKey>();
const current = computed(() => opened.value ?? steps.find((s) => !done.value.includes(s.key))?.key);

function markDone(key: StepKey): void {
  if (!done.value.includes(key)) done.value = [...done.value, key];
  opened.value = undefined;
  try {
    localStorage.setItem(doneKey, JSON.stringify(done.value));
  } catch {
    // Only a convenience.
  }
}

const clientId = ref("");
const clientSecret = ref("");
const dragging = ref(false);
const checking = ref(false);
const saved = ref(false);
const error = ref<string>();
const fileInput = ref<HTMLInputElement>();
const router = useRouter();

async function submit(body: Record<string, string>): Promise<void> {
  checking.value = true;
  error.value = undefined;
  saved.value = false;
  try {
    const response = await fetch("/api/desktop/google_credentials", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.ok) {
      saved.value = true;
      steps.forEach((s) => markDone(s.key));
    } else error.value = result.error ?? "unknown";
  } catch {
    error.value = "unknown";
  } finally {
    checking.value = false;
  }
}

async function readFile(file: File | undefined): Promise<void> {
  if (file) await submit({ json: await file.text() });
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  void readFile(event.dataTransfer?.files[0]);
}

// Coming back to this step after saving: allow continuing straight away.
onMounted(async () => {
  const status = await fetch("/api/status", { credentials: "include" }).then((r) => r.json()).catch(() => ({}));
  if (status.googleConfigured) saved.value = true;
});

function errorText(code: string): string {
  const known = ["invalid_json", "wrong_client_type", "missing_fields", "invalid_client_id", "invalid", "unreachable", "save_failed"];
  return `setup.google.errors.${known.includes(code) ? code : "unknown"}`;
}
</script>

<template>
  <FlowFrame step="googleProject">
    <div class="grid gap-10 md:grid-cols-[1fr_300px]">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ $t("setup.google.title") }}</h1>
        <p class="mt-2 text-sm leading-relaxed text-base-content/70">{{ $t("setup.google.lead") }}</p>
        <ol class="mt-5 space-y-2">
          <li v-for="(s, i) in steps" :key="s.key">
            <div v-if="s.key === current" class="rounded-xl border border-primary/40 bg-primary/5 px-4 py-4">
              <div class="flex items-center gap-3">
                <span class="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-content">{{ i + 1 }}</span>
                <span class="flex-1 text-sm font-semibold">{{ $t(`setup.google.${s.key}.title`) }}</span>
                <a class="btn btn-primary btn-sm" :href="s.url" target="_blank">{{ $t(`setup.google.${s.key}.cta`) }}<ExternalLink class="size-3.5" /></a>
              </div>
              <p class="ml-9 mt-2 text-sm leading-snug text-base-content/70">{{ $t(`setup.google.${s.key}.text`) }}</p>
              <div class="ml-9 mt-3">
                <button type="button" class="btn btn-xs" @click="markDone(s.key)"><Check class="size-3.5" />{{ $t("setup.google.markDone") }}</button>
              </div>
            </div>
            <button
              v-else
              type="button"
              class="flex w-full items-center gap-3 rounded-xl border border-base-300 px-4 py-2.5 text-left"
              :class="{ 'text-base-content/60': done.includes(s.key) }"
              @click="opened = s.key"
            >
              <span v-if="done.includes(s.key)" class="grid size-6 place-items-center rounded-full bg-success text-success-content"><Check class="size-3.5" /></span>
              <span v-else class="grid size-6 place-items-center rounded-full bg-base-300 text-xs font-semibold">{{ i + 1 }}</span>
              <span class="flex-1 text-sm font-medium">{{ $t(`setup.google.${s.key}.title`) }}</span>
              <span v-if="done.includes(s.key)" class="text-xs font-medium text-success">{{ $t("setup.google.done") }}</span>
              <ChevronRight v-else class="size-4 text-base-content/40" />
            </button>
          </li>
        </ol>
      </div>

      <div class="flex flex-col gap-4">
        <div
          class="grid h-56 place-items-center rounded-box border-2 border-dashed p-5 text-center transition-colors"
          :class="dragging ? 'border-primary bg-primary/10' : 'border-primary/40 bg-primary/5'"
          data-testid="credentials-drop"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <div>
            <div class="mx-auto grid size-11 place-items-center rounded-full bg-primary/15 text-primary"><Upload class="size-5" /></div>
            <div class="mt-3 text-sm font-semibold">{{ $t("setup.google.drop") }}</div>
            <div class="mt-1 break-all text-xs text-base-content/60">{{ $t("setup.google.dropHint") }}</div>
            <button type="button" class="btn btn-outline btn-primary btn-sm mt-3" @click="fileInput?.click()">{{ $t("setup.google.browse") }}</button>
            <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" data-testid="credentials-file" @change="readFile(($event.target as HTMLInputElement).files?.[0])" />
          </div>
        </div>
        <form class="text-sm" @submit.prevent="submit({ clientId, clientSecret })">
          <div class="flex items-center gap-2 text-xs text-base-content/60">
            <span class="h-px flex-1 bg-base-300"></span>{{ $t("setup.google.orPaste") }}<span class="h-px flex-1 bg-base-300"></span>
          </div>
          <label class="mt-3 block text-xs font-medium text-base-content/70" for="client-id">{{ $t("setup.google.clientId") }}</label>
          <input id="client-id" v-model="clientId" class="input input-sm mt-1 w-full" placeholder="1234-abc.apps.googleusercontent.com" autocomplete="off" />
          <label class="mt-3 block text-xs font-medium text-base-content/70" for="client-secret">{{ $t("setup.google.clientSecret") }}</label>
          <input id="client-secret" v-model="clientSecret" type="password" class="input input-sm mt-1 w-full" placeholder="GOCSPX-…" autocomplete="off" />
          <button type="submit" class="btn btn-sm mt-3 w-full" :disabled="checking || !clientId || !clientSecret">{{ $t("setup.google.check") }}</button>
        </form>
        <div v-if="checking" class="flex items-center gap-2 text-sm text-base-content/70"><span class="loading loading-spinner loading-sm"></span>{{ $t("setup.google.checking") }}</div>
        <div v-if="error" role="alert" class="alert alert-error alert-soft text-sm"><CircleAlert class="size-5" /><span>{{ $t(errorText(error)) }}</span></div>
        <div v-if="saved" role="status" class="alert alert-success alert-soft text-sm"><CircleCheck class="size-5" /><span>{{ $t("setup.google.saved") }}</span></div>
      </div>
    </div>

    <template #actions>
      <router-link to="/" class="btn btn-ghost"><ArrowLeft class="size-4" />{{ $t("common.back") }}</router-link>
      <a class="link ml-2 flex items-center gap-1 text-sm text-base-content/60" :href="`${repoUrl}/blob/main/docs/google-setup.md`" target="_blank">
        <CircleHelp class="size-4" />{{ $t("setup.google.guide") }}
      </a>
      <span class="flex-1"></span>
      <span v-if="!saved" class="mr-2 text-sm text-base-content/50">{{ $t("setup.google.waiting") }}</span>
      <button type="button" class="btn btn-primary" :disabled="!saved" @click="router.push('/setup/signin')">
        {{ $t("common.continue") }}<ArrowRight class="size-4" />
      </button>
    </template>
  </FlowFrame>
</template>
