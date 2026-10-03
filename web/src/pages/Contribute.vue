<script lang="ts">
import { defineComponent } from "vue";
import { CircleAlert, Coffee, Mail } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";
import { track } from "../analytics";
import { repoUrl } from "../brand";

export default defineComponent({
  components: { FlowFrame, CircleAlert, Coffee, Mail },
  data: () => ({
    email: "",
    checkingPurchase: false,
    repoUrl,
    errorMessage: null as string | null,
  }),

  mounted() {
    if (this.$route.query.show_error) {
      this.errorMessage = this.$route.query.show_error === "verification"
        ? this.$t("contribute.errorVerification")
        : this.$t("contribute.errorWhatsApp");
      track("contribution_error_shown");
    }
  },

  methods: {
    coffeeClicked() {
      this.errorMessage = null;
      track("contribution_wa_validation_failed");
    },

    checkPurchase() {
      if (!this.email) return;
      this.checkingPurchase = true;

      fetch("/api/check_purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: this.email }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.purchased) {
            this.$router.push("/whatsapp");
          } else {
            this.errorMessage = this.$t("contribute.errorDefault");
            this.checkingPurchase = false;
            track("contribution_validation_failed");
          }
        });
    },
  },
});
</script>

<template>
  <FlowFrame step="contribute">
    <div class="mx-auto max-w-lg text-center">
      <h1 class="text-2xl font-bold tracking-tight">{{ $t("contribute.title") }}</h1>
      <i18n-t keypath="contribute.lead" tag="p" class="mt-3 text-sm text-base-content/70">
        <template #amount><strong>{{ $t("contribute.amount") }}</strong></template>
        <template #access><strong>{{ $t("contribute.access") }}</strong></template>
      </i18n-t>
      <i18n-t keypath="contribute.selfHost" tag="p" class="mt-2 text-sm text-base-content/70">
        <template #link><a class="link link-primary" :href="repoUrl">{{ $t("contribute.openSource") }}</a></template>
      </i18n-t>

      <div class="mt-8 rounded-box border border-base-300 p-5 text-left">
        <div class="text-sm font-semibold">{{ $t("contribute.stepCoffee") }}</div>
        <a class="btn mt-3 border-0 bg-[#FFDD00] text-neutral-900 hover:bg-[#f5d400]" href="https://www.buymeacoffee.com/guyzyl" target="_blank" @click="coffeeClicked">
          <Coffee class="size-4" />Buy Me a Coffee
        </a>
        <div class="mt-6 text-sm font-semibold">{{ $t("contribute.stepEmail") }}</div>
        <div class="mt-1 text-xs text-base-content/60">{{ $t("contribute.already") }}</div>
        <div class="mt-3 flex flex-wrap gap-2">
          <label class="input flex-1">
            <Mail class="size-4 opacity-60" />
            <input v-model="email" type="email" class="grow" :placeholder="$t('contribute.email')" @input="errorMessage = null" @keydown.enter="checkPurchase()" />
          </label>
          <button type="button" class="btn btn-primary" :disabled="!email || checkingPurchase" @click="checkPurchase()">
            <span v-if="checkingPurchase" class="loading loading-spinner loading-sm"></span>
            {{ checkingPurchase ? $t("contribute.verifying") : $t("contribute.check") }}
          </button>
        </div>
        <div v-if="errorMessage" role="alert" class="alert alert-error alert-soft mt-4">
          <CircleAlert class="size-5" /><span>{{ errorMessage }}</span>
        </div>
      </div>
    </div>
  </FlowFrame>
</template>
