<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Link } from "lucide-vue-next";

import { api, ApiError } from "../api";
import { LinkLookup } from "../../../interfaces/api";

// Looks up the profile picture behind a pasted link (issue #51), for the
// report's "No photo found" rows and for review.
const props = defineProps<{ label?: string; autofocus?: boolean }>();
const emit = defineEmits<{ found: [lookup: LinkLookup] }>();
const { t } = useI18n();

const url = ref("");
const busy = ref(false);
const error = ref<string>();

async function find(): Promise<void> {
  if (!url.value.trim() || busy.value) return;
  busy.value = true;
  error.value = undefined;
  try {
    emit("found", await api.linkLookup(url.value.trim()));
  } catch (e) {
    const code = e instanceof ApiError ? e.code : undefined;
    const network = e instanceof ApiError ? String(e.body?.network ?? "") : "";
    error.value = ["unsupported_link", "no_photo", "signin_required", "unreachable"].includes(code ?? "")
      ? t(`links.errors.${code}`, { network })
      : t("links.errors.unknown");
  }
  busy.value = false;
}
</script>

<template>
  <form class="flex min-w-0 flex-1 flex-col gap-1.5" @submit.prevent="find">
    <div class="flex items-center gap-2">
      <label class="input input-sm min-w-0 flex-1">
        <Link class="size-4 opacity-50" />
        <input v-model="url" type="text" inputmode="url" :autofocus="props.autofocus" :placeholder="$t('links.placeholder')" :aria-label="props.label ?? $t('links.field')" />
      </label>
      <button type="submit" class="btn btn-sm" :disabled="busy || !url.trim()">
        <span v-if="busy" class="loading loading-spinner loading-xs"></span>{{ $t("links.find") }}
      </button>
    </div>
    <p v-if="error" class="text-xs text-error" role="alert">{{ error }}</p>
  </form>
</template>
