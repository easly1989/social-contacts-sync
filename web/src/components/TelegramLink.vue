<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { CircleCheck, Send } from "lucide-vue-next";

import { api, ApiError } from "../api";
import { browserRegion } from "../cleanupState";
import { TelegramState } from "../../../interfaces/api";

// Signing in to Telegram (mockup 1.4 in issue #8, issue #36): phone number,
// then the code Telegram sends in its app, then the two-step verification
// password when the account has one.
const emit = defineEmits<{ change: [state: TelegramState] }>();
const { t } = useI18n();
const state = ref<TelegramState>();
const phone = ref("");
const code = ref("");
const password = ref("");
const busy = ref(false);
const error = ref<string>();

// Country calling codes for the prefilled prefix; anything else is typed.
const callingCodes: Record<string, string> = {
  IT: "39", GB: "44", US: "1", CA: "1", DE: "49", FR: "33", ES: "34", PT: "351", NL: "31", BE: "32", CH: "41", AT: "43",
  IE: "353", SE: "46", NO: "47", DK: "45", FI: "358", PL: "48", GR: "30", IL: "972", BR: "55", MX: "52", AR: "54", IN: "91",
  AU: "61", RU: "7", UA: "380", TR: "90", RO: "40", JP: "81",
};

function update(next: TelegramState): void {
  state.value = next;
  emit("change", next);
}

async function run(action: () => Promise<TelegramState>): Promise<void> {
  busy.value = true;
  error.value = undefined;
  try {
    update(await action());
  } catch (e) {
    const reason = e instanceof ApiError ? e.code : undefined;
    const known = ["invalid_phone", "invalid_code", "code_expired", "invalid_password", "no_account", "flood_wait", "not_configured"];
    error.value = t(`telegram.errors.${reason && known.includes(reason) ? reason : "unavailable"}`);
  }
  busy.value = false;
}

const sendCode = () => run(() => api.telegramSendCode(phone.value));
const signIn = () => run(() => api.telegramSignIn(code.value));
const checkPassword = () => run(() => api.telegramPassword(password.value));
const signOut = () => run(() => api.telegramSignOut());
const restart = () => {
  code.value = "";
  password.value = "";
  update({ ...state.value!, step: undefined });
};

onMounted(async () => {
  const region = browserRegion();
  phone.value = region && callingCodes[region] ? `+${callingCodes[region]} ` : "+";
  update(await api.telegram().catch(() => ({ available: false, connected: false })));
});
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="telegram-link">
    <div v-if="!state" class="grid place-items-center py-6"><span class="loading loading-spinner"></span></div>

    <p v-else-if="!state.available" class="text-sm text-base-content/60">{{ $t("telegram.unavailable") }}</p>

    <div v-else-if="state.connected" class="flex flex-wrap items-center gap-2 text-sm font-medium text-success">
      <CircleCheck class="size-4" /><span class="flex-1">{{ $t("telegram.connected", { phone: state.phone ?? "" }) }}</span>
      <button type="button" class="btn btn-ghost btn-xs text-base-content/60" :disabled="busy" @click="signOut">{{ $t("setup.signin.signOut") }}</button>
    </div>

    <form v-else-if="state.step === 'code'" class="flex flex-col gap-3" @submit.prevent="signIn">
      <p class="text-sm text-base-content/70">{{ $t("telegram.codeSent", { phone: state.phone ?? "" }) }}</p>
      <label class="text-sm font-medium" for="telegram-code">{{ $t("telegram.code") }}</label>
      <input id="telegram-code" v-model="code" class="input w-full tracking-widest" inputmode="numeric" autocomplete="one-time-code" placeholder="12345" required />
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="restart">{{ $t("telegram.otherNumber") }}</button>
        <span class="flex-1"></span>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="busy || !code.trim()">{{ $t("telegram.signIn") }}</button>
      </div>
    </form>

    <form v-else-if="state.step === 'password'" class="flex flex-col gap-3" @submit.prevent="checkPassword">
      <p class="text-sm text-base-content/70">{{ $t("telegram.passwordHint") }}</p>
      <label class="text-sm font-medium" for="telegram-password">{{ $t("telegram.password") }}</label>
      <input id="telegram-password" v-model="password" type="password" class="input w-full" autocomplete="current-password" required />
      <div class="flex items-center gap-2">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="restart">{{ $t("telegram.otherNumber") }}</button>
        <span class="flex-1"></span>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="busy || !password">{{ $t("telegram.signIn") }}</button>
      </div>
    </form>

    <form v-else class="flex flex-col gap-3" @submit.prevent="sendCode">
      <p class="text-sm text-base-content/70">{{ $t("telegram.lead") }}</p>
      <label class="text-sm font-medium" for="telegram-phone">{{ $t("telegram.phone") }}</label>
      <input id="telegram-phone" v-model="phone" type="tel" class="input w-full" autocomplete="tel" placeholder="+39 333 123 4567" required />
      <button type="submit" class="btn btn-sm" :disabled="busy || phone.replace(/\D/g, '').length < 6">
        <span v-if="busy" class="loading loading-spinner loading-xs"></span><Send v-else class="size-4" />{{ $t("telegram.sendCode") }}
      </button>
    </form>

    <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>
  </div>
</template>
