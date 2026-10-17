import { ref } from "vue";

import { api } from "./api";

/** How many contacts wait in Sync's To review (issue #81), for the sidebar badge. */
export const reviewCount = ref<number>();

let loading: Promise<void> | undefined;

/** `again`: a sync queued contacts since the count was read. */
export function loadReviewCount(again = false): Promise<void> {
  if (again) loading = undefined;
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
