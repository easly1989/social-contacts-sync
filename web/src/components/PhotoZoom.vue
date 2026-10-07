<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";

// Any small photo in the app, shown larger while the pointer is over it,
// like the report's before → after preview (issue #44). Decorative: the
// photo itself stays where it is, so this needs no focus or role.
const props = defineProps<{ src?: string; name?: string }>();

const trigger = ref<HTMLElement>();
const card = ref<HTMLElement>();
const open = ref(false);
const position = ref({ top: 0, left: 0 });

/** Next to the photo, on the side with room; always inside the window. */
async function place(): Promise<void> {
  await nextTick();
  const rect = trigger.value?.getBoundingClientRect();
  const box = card.value?.getBoundingClientRect();
  if (!rect || !box) return;
  const gap = 10;
  const right = rect.right + gap + box.width <= window.innerWidth;
  const left = right ? rect.right + gap : Math.max(gap, rect.left - gap - box.width);
  const top = Math.min(Math.max(rect.top + rect.height / 2 - box.height / 2, gap), window.innerHeight - box.height - gap);
  position.value = { top, left };
}

function show(event: PointerEvent): void {
  // Touch has no hover: a tap is for whatever the photo sits in (a button, a row).
  if (!props.src || event.pointerType === "touch") return;
  open.value = true;
  void place();
}
const hide = () => (open.value = false);
onBeforeUnmount(hide);
</script>

<template>
  <span ref="trigger" class="inline-flex shrink-0" @pointerenter="show" @pointerleave="hide">
    <slot />
  </span>
  <Teleport to="body">
    <div
      v-if="open && src"
      ref="card"
      data-testid="photo-zoom"
      aria-hidden="true"
      class="pointer-events-none fixed z-50 rounded-box border border-base-300 bg-base-100 p-2 shadow-2xl"
      :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    >
      <img :src="src" alt="" class="size-56 rounded-xl object-cover" referrerpolicy="no-referrer" />
      <p v-if="name" class="max-w-56 truncate px-1 pt-1.5 text-center text-sm font-medium">{{ name }}</p>
    </div>
  </Teleport>
</template>
