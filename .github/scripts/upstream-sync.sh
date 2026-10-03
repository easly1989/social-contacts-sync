#!/usr/bin/env bash
# Keep this fork aligned with the original repository.
#
# Merges the upstream branch into a bot-owned sync branch and opens (or
# updates) a pull request against the fork's base branch. When the merge
# conflicts nothing is pushed; an issue listing the conflicting files is opened
# (or updated) instead, and closed again by the first sync that merges cleanly.
#
# Expects to run inside a clone of the fork whose `origin` remote can be pushed
# to, with an authenticated `gh` CLI (GH_TOKEN) for that repository.
set -euo pipefail

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/guyzyl/whatsapp-contact-sync.git}"
UPSTREAM_NAME="${UPSTREAM_NAME:-guyzyl/whatsapp-contact-sync}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
BASE_BRANCH="${BASE_BRANCH:-main}"
SYNC_BRANCH="${SYNC_BRANCH:-upstream-sync}"
SYNC_LABEL="${SYNC_LABEL:-upstream-sync}"
CONFLICT_LABEL="${CONFLICT_LABEL:-upstream-conflict}"

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT

if ! git config user.name >/dev/null; then
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
fi

if git remote get-url upstream >/dev/null 2>&1; then
  git remote set-url upstream "$UPSTREAM_URL"
else
  git remote add upstream "$UPSTREAM_URL"
fi
git fetch --quiet --no-tags upstream "$UPSTREAM_BRANCH"
git fetch --quiet --no-tags origin "$BASE_BRANCH"

upstream_sha="$(git rev-parse "refs/remotes/upstream/$UPSTREAM_BRANCH")"
short_sha="${upstream_sha:0:7}"
base_ref="refs/remotes/origin/$BASE_BRANCH"

gh label create "$SYNC_LABEL" --color 0E8A16 \
  --description "Automated merge from the upstream repository" --force >/dev/null
gh label create "$CONFLICT_LABEL" --color D93F0B \
  --description "Upstream changes need a manual merge" --force >/dev/null

conflict_issue="$(gh issue list --label "$CONFLICT_LABEL" --state open \
  --json number --jq '.[0].number // empty')"
open_pr="$(gh pr list --head "$SYNC_BRANCH" --base "$BASE_BRANCH" --state open \
  --json number --jq '.[0].number // empty')"

close_conflict_issue() {
  if [[ -n "$conflict_issue" ]]; then
    gh issue close "$conflict_issue" \
      --comment "$1"
  fi
}

if git merge-base --is-ancestor "$upstream_sha" "$base_ref"; then
  echo "$BASE_BRANCH already contains $UPSTREAM_NAME@$short_sha; nothing to do."
  close_conflict_issue "\`$BASE_BRANCH\` now contains \`$UPSTREAM_NAME@$short_sha\`. Closing."
  exit 0
fi

# Reuse the branch of an open PR so fixes pushed to it by hand are kept;
# otherwise start over from the base branch (an old branch is overwritten).
if [[ -n "$open_pr" ]]; then
  git fetch --quiet --no-tags origin "$SYNC_BRANCH"
  git checkout --quiet -B "$SYNC_BRANCH" "refs/remotes/origin/$SYNC_BRANCH"
  push_args=()
  if git merge-base --is-ancestor "$upstream_sha" HEAD; then
    echo "PR #$open_pr already contains $UPSTREAM_NAME@$short_sha; nothing to do."
    exit 0
  fi
else
  git checkout --quiet -B "$SYNC_BRANCH" "$base_ref"
  push_args=(--force)
fi

if ! git merge --quiet --no-ff --no-edit \
  -m "Merge $UPSTREAM_NAME@$UPSTREAM_BRANCH ($short_sha)" "$upstream_sha"; then
  conflicts="$(git diff --name-only --diff-filter=U)"
  git merge --abort

  {
    echo "Merging \`$UPSTREAM_NAME@$UPSTREAM_BRANCH\` (\`$short_sha\`) into \`$SYNC_BRANCH\` conflicts, so no pull request was opened."
    echo
    echo "### Conflicting files"
    echo
    while IFS= read -r file; do echo "- \`$file\`"; done <<<"$conflicts"
    echo
    echo "### Resolve locally"
    echo
    echo '```bash'
    echo "git remote add upstream $UPSTREAM_URL  # once"
    echo "git fetch upstream $UPSTREAM_BRANCH"
    echo "git checkout -B $SYNC_BRANCH origin/$BASE_BRANCH"
    echo "git merge upstream/$UPSTREAM_BRANCH"
    echo "# fix the conflicts, then"
    echo "git commit && git push --force origin $SYNC_BRANCH"
    echo '```'
    echo
    echo "Then open a PR from \`$SYNC_BRANCH\` and merge it with **Create a merge commit**. This issue closes itself on the next successful sync."
  } >"$body_file"

  if [[ -n "$conflict_issue" ]]; then
    gh issue edit "$conflict_issue" --body-file "$body_file" >/dev/null
    echo "::warning::Upstream merge conflicts; updated issue #$conflict_issue."
  else
    gh issue create --title "Upstream changes conflict with this fork" \
      --label "$CONFLICT_LABEL" --body-file "$body_file" >/dev/null
    echo "::warning::Upstream merge conflicts; opened an issue."
  fi
  exit 0
fi

git push --quiet "${push_args[@]}" origin "HEAD:refs/heads/$SYNC_BRANCH"

{
  echo "Merges the latest changes from [\`$UPSTREAM_NAME\`](https://github.com/$UPSTREAM_NAME) (\`$UPSTREAM_BRANCH\` @ \`$short_sha\`)."
  echo
  echo "> [!IMPORTANT]"
  echo "> Merge with **Create a merge commit**. Squash or rebase would drop the upstream history and make every later sync conflict."
  echo
  echo "### Incoming commits"
  echo
  git log --no-merges --format='- %h %s (%an)' "$base_ref..$upstream_sha" | head -n 100
  echo
  echo "_Opened by the \`upstream-sync\` workflow._"
} >"$body_file"

if [[ -n "$open_pr" ]]; then
  gh pr edit "$open_pr" --body-file "$body_file" >/dev/null
  echo "Updated PR #$open_pr."
else
  gh pr create --base "$BASE_BRANCH" --head "$SYNC_BRANCH" \
    --title "Sync with upstream $UPSTREAM_NAME" \
    --label "$SYNC_LABEL" --body-file "$body_file" >/dev/null
  echo "Opened a PR from $SYNC_BRANCH."
fi

close_conflict_issue "A later sync merged \`$UPSTREAM_NAME@$short_sha\` cleanly. Closing."
