#!/usr/bin/env bash
# Publishes the end-to-end screenshots of a pull request to the `assets`
# branch (pr-<number>/) and keeps a single PR comment showing them.
#
# Usage: publish-screenshots.sh <directory with PNGs>
# Needs PR, HEAD_SHA, an authenticated gh (GH_TOKEN) and a clone whose origin
# can be pushed to.
set -euo pipefail

src="$(cd "$1" && pwd)"
: "${PR:?PR must be the pull request number}"
: "${HEAD_SHA:?HEAD_SHA must be the pull request head commit}"
export GH_REPO="${GH_REPO:-${GITHUB_REPOSITORY:?}}"
branch="assets"
marker="<!-- e2e-screenshots -->"
dir="pr-$PR"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

work="$(mktemp -d)"
trap 'git worktree remove --force "$work" 2>/dev/null || true; rm -rf "$work"' EXIT

publish() {
  if git fetch --quiet --no-tags origin "$branch" 2>/dev/null; then
    git worktree add --quiet --force -B "$branch" "$work" "refs/remotes/origin/$branch"
  else
    git worktree add --quiet --force --detach "$work"
    git -C "$work" checkout --quiet --orphan "$branch"
    git -C "$work" rm -rfq . 2>/dev/null || true
    printf '# Assets\n\nScreenshots and mockups referenced from issues and pull requests.\n' >"$work/README.md"
  fi
  rm -rf "${work:?}/$dir"
  mkdir -p "$work/$dir"
  cp "$src"/*.png "$work/$dir/"
  git -C "$work" add -A
  if git -C "$work" diff --cached --quiet; then
    return 0
  fi
  git -C "$work" commit --quiet -m "Screenshots for #$PR (${HEAD_SHA:0:7})"
  git -C "$work" push --quiet origin "HEAD:refs/heads/$branch"
}

# Several PRs may publish at once; retry on a rejected (non fast-forward) push.
# `set -e` is ignored inside a function used as a condition, so run it in a
# subshell that re-enables it.
for attempt in 1 2 3; do
  set +e
  (set -e; publish)
  status=$?
  set -e
  [[ "$status" == 0 ]] && break
  [[ "$attempt" == 3 ]] && exit 1
  git worktree remove --force "$work"
  mkdir -p "$work"
  sleep $((attempt * 5))
done

sha="$(git -C "$work" rev-parse HEAD)"
base="https://raw.githubusercontent.com/$GH_REPO/$sha/$dir"

body="$(mktemp)"
{
  echo "$marker"
  echo "### Screenshots"
  echo
  echo "From the end-to-end tests on ${HEAD_SHA:0:7} (mocked backend, 1280×800)."
  echo
  for file in "$src"/*.png; do
    name="$(basename "$file" .png)"
    echo "<details><summary><code>$name</code></summary>"
    echo
    echo "![$name]($base/$name.png)"
    echo
    echo "</details>"
  done
} >"$body"

comment_id="$(gh api "repos/$GH_REPO/issues/$PR/comments" --paginate \
  --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -n 1)"
if [[ -n "$comment_id" ]]; then
  gh api --method PATCH "repos/$GH_REPO/issues/comments/$comment_id" \
    -F "body=@$body" >/dev/null
else
  gh pr comment "$PR" --body-file "$body" >/dev/null
fi
rm -f "$body"
echo "Published $(find "$src" -name '*.png' | wc -l) screenshots to $branch/$dir."
