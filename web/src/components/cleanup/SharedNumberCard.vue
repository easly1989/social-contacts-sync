<script setup lang="ts">
import { computed, ref } from "vue";
import { GitMerge } from "lucide-vue-next";

import ContactAvatar from "../ContactAvatar.vue";
import { CleanupContact, SharedNumber } from "../../../../interfaces/api";

// One shared number of mockup 4 (cleanupShared): pick who it belongs to,
// merge the contacts, or mark the number as shared.
const props = defineProps<{ item: SharedNumber; contacts: Record<string, CleanupContact>; busy?: boolean }>();
const emit = defineEmits<{ keep: [contactId: string]; merge: []; markShared: [] }>();
const selected = ref<string>();

// The number as a contact saved it with a country code, else E.164.
const display = computed(() => {
  const saved = props.item.contactIds.flatMap((id) => props.contacts[id]?.phones ?? []).filter((p) => p.e164 === props.item.e164);
  return saved.find((p) => p.value.trim().startsWith("+"))?.value ?? props.item.e164;
});
const landline = computed(() => props.item.contactIds.length > 2);
</script>

<template>
  <section class="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-box border border-base-300 bg-base-100 p-5" :data-testid="`shared-${item.e164}`">
    <div class="w-44">
      <div class="font-semibold tabular-nums">{{ display }}</div>
      <div class="text-xs text-base-content/60">{{ $t("cleanup.contacts", { count: item.contactIds.length }) }}</div>
    </div>
    <div class="flex min-w-[12rem] flex-1 flex-wrap gap-2" role="radiogroup" :aria-label="$t('cleanup.belongsTo', { number: display })">
      <button
        v-for="id in item.contactIds"
        :key="id"
        type="button"
        role="radio"
        :aria-checked="selected === id"
        class="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm"
        :class="selected === id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-base-300 hover:bg-base-200'"
        @click="selected = id"
      >
        <ContactAvatar :name="contacts[id]?.name" :photo-url="contacts[id]?.photoUrl" size="size-7" />{{ contacts[id]?.name ?? $t("cleanup.noName") }}
      </button>
    </div>
    <div class="flex flex-col items-end gap-2">
      <p class="max-w-72 text-right text-xs text-base-content/60">{{ $t(landline ? "cleanup.landlineHint" : "cleanup.samePersonHint") }}</p>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="btn btn-sm" :class="landline ? '' : 'btn-ghost'" :disabled="busy" @click="emit('markShared')">{{ $t("cleanup.markShared") }}</button>
        <button type="button" class="btn btn-sm" :disabled="busy || !selected" :title="selected ? undefined : $t('cleanup.selectFirst')" @click="emit('keep', selected!)">{{ $t("cleanup.keepOnSelected") }}</button>
        <button type="button" class="btn btn-outline btn-secondary btn-sm" :disabled="busy" @click="emit('merge')"><GitMerge class="size-4" />{{ $t("cleanup.mergeShort") }}</button>
      </div>
    </div>
  </section>
</template>
