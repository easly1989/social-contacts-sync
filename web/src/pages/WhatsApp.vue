<script setup lang="ts">
import { CircleHelp, Phone } from "lucide-vue-next";

import FlowFrame from "../components/FlowFrame.vue";
import WhatsAppLink from "../components/WhatsAppLink.vue";
</script>

<template>
  <FlowFrame step="whatsapp">
    <div class="grid items-center gap-10 md:grid-cols-[1fr_auto]">
      <div>
        <div class="flex items-center gap-3">
          <div class="grid size-10 place-items-center rounded-xl bg-[#25D366] text-white"><Phone class="size-5" /></div>
          <h1 class="text-2xl font-bold tracking-tight">{{ $t("whatsapp.title") }}</h1>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-base-content/70">{{ $t("whatsapp.lead") }}</p>
        <ol class="mt-6 space-y-3 text-sm">
          <li v-for="n in 3" :key="n" class="flex items-center gap-3">
            <span class="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{{ n }}</span>
            {{ $t(`whatsapp.step${n}`) }}
          </li>
        </ol>
        <a class="link link-hover mt-6 inline-flex items-center gap-1.5 text-sm text-base-content/60" href="https://faq.whatsapp.com/539218963354346/?locale=en_US" target="_blank">
          <CircleHelp class="size-4" />{{ $t("whatsapp.help") }}
        </a>
      </div>

      <WhatsAppLink />
    </div>
  </FlowFrame>
</template>
