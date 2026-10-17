import { ref } from "vue";

import { api } from "./api";

/** How many contacts wait in Sync's To review (issue #81), for the sidebar badge. */
export const reviewCount = ref<number>();

let loading: Promise<void> | undefined;

export function loadReviewCount(): Promise<void> {
  loading ??= api
    .profilesCount()
    .then(({ count }) => {
      reviewCount.value = count;
    })
    .catch(() => {
      loading = undefined;
    });
  return loading;
}
