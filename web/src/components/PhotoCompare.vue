<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { ArrowRight } from "lucide-vue-next";

import SourceBadge from "./SourceBadge.vue";
import { SourceId } from "../../../interfaces/api";

// The report's small before → after photos, with a larger side-by-side
// preview on hover, focus or tap (issue #44).
const props = defineProps<{ name?: string; source?: SourceId; matchedBy?: string; before?: string; after?: string }>();

const trigger = ref<HTMLButtonElement>();
const card = ref<HTMLElement>();
const open = ref(false);
const position = ref({ top: 0, left: 0, above: false });
const letter = () => (props.name ?? "?").trim().charAt(0).toUpperCase() || "?";

/** Below the photos, or above when there isn't room; always inside the window. */
async function place(): Promise<void> {
  await nextTick();
  const rect = trigger.value?.getBoundingClientRect();
  const box = card.value?.getBoundingClientRect();
  if (!rect || !box) return;
  const gap = 8;
  const above = rect.bottom + gap + box.height > window.innerHeight && rect.top - gap - box.height > 0;
  const top = above ? rect.top - gap - box.height : rect.bottom + gap;
  const left = Math.min(Math.max(rect.left - 24, gap), window.innerWidth - box.width - gap);
  position.value = { top, left, above };
}

function show(): void {
  if (open.value) return;
  open.value = true;
  void place();
  document.addEventListener("pointerdown", outside);
}

function hide(): void {
  open.value = false;
  document.removeEventListener("pointerdown", outside);
}

// Touch screens have no hover: a tap opens it, a tap elsewhere closes it.
function outside(event: PointerEvent): void {
  if (!trigger.value?.contains(event.target as Node)) hide();
}

onBeforeUnmount(hide);
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="flex items-center gap-2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :aria-label="$t('report.compare', { name: name ?? '—' })"
    :aria-expanded="open"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
    @click="show"
    @keydown.esc="hide"
  >
    <img v-if="before" :src="before" alt="" class="size-7 rounded-full object-cover" />
    <span v-else class="grid size-7 place-items-center rounded-full bg-base-300 text-xs font-semibold text-base-content/50">{{ letter() }}</span>
    <ArrowRight class="size-3.5 text-base-content/40" />
    <img v-if="after" :src="after" alt="" class="size-7 rounded-full object-cover" />
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      ref="card"
      role="tooltip"
      data-testid="photo-compare"
      class="pointer-events-none fixed z-50 w-[23.5rem] rounded-box border border-base-300 bg-base-100 p-4 text-left shadow-2xl"
      :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <span class="truncate font-semibold">{{ name ?? "—" }}</span>
        <SourceBadge v-if="source" :source="source" />
      </div>
      <div class="flex items-center gap-3">
        <figure class="shrink-0 text-center">
          <img v-if="before" :src="before" :alt="$t('report.before')" class="size-36 rounded-2xl object-cover" />
          <span v-else class="grid size-36 place-items-center rounded-2xl bg-base-300 text-5xl font-semibold text-base-content/50">{{ letter() }}</span>
          <figcaption class="mt-1.5 text-xs text-base-content/60">{{ $t("report.before") }}</figcaption>
        </figure>
        <ArrowRight class="size-5 shrink-0 text-base-content/40" />
        <figure class="shrink-0 text-center">
          <img v-if="after" :src="after" :alt="$t('report.after')" class="size-36 rounded-2xl object-cover" />
          <figcaption class="mt-1.5 text-xs text-base-content/60">{{ $t("report.after") }}</figcaption>
        </figure>
      </div>
      <div v-if="matchedBy" class="mt-3 truncate text-xs text-base-content/50">{{ $t("report.matchedBy") }} {{ matchedBy }}</div>
    </div>
  </Teleport>
</template>
