#!/usr/bin/env bash
# Exercises upstream-sync.sh against throwaway local repositories, with the
# `gh` CLI replaced by a stub that records its calls.
set -euo pipefail

script="$(cd "$(dirname "$0")" && pwd)/upstream-sync.sh"
root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT

export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.com
export GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

# --- gh stub -----------------------------------------------------------------
# `pr list` / `issue list` print the contents of $STUB/open_pr and
# $STUB/conflict_issue; every call is appended to $STUB/calls.
export STUB="$root/stub"
mkdir -p "$STUB/bin"
cat >"$STUB/bin/gh" <<'EOF'
#!/usr/bin/env bash
if [[ "${GH_REPO:-}" != "test/fork" ]]; then
  echo "gh called without GH_REPO=test/fork" >&2
  exit 1
fi
echo "$*" >>"$STUB/calls"
case "$1 $2" in
  "pr list") cat "$STUB/open_pr" 2>/dev/null || true ;;
  "issue list") cat "$STUB/conflict_issue" 2>/dev/null || true ;;
esac
EOF
chmod +x "$STUB/bin/gh"
export PATH="$STUB/bin:$PATH"

# --- fixtures ----------------------------------------------------------------
commit() { # repo file content message
  printf '%s\n' "$3" >"$1/$2"
  git -C "$1" add "$2"
  git -C "$1" commit --quiet -m "$4"
}

git init --quiet --bare -b main "$root/upstream.git"
git init --quiet -b main "$root/up"
commit "$root/up" app.txt "v1" "initial"
git -C "$root/up" push --quiet "$root/upstream.git" main

git clone --quiet --bare "$root/upstream.git" "$root/origin.git"
git clone --quiet "$root/origin.git" "$root/fork"
commit "$root/fork" fork.txt "fork only" "fork change"
git -C "$root/fork" push --quiet origin main

export UPSTREAM_URL="$root/upstream.git" UPSTREAM_NAME="up/stream"
export GITHUB_REPOSITORY="test/fork"
unset GH_REPO

run_sync() {
  : >"$STUB/calls"
  (cd "$root/fork" && bash "$script") >"$root/out" 2>&1 || {
    cat "$root/out"
    fail "sync script exited with an error"
  }
}
fail() { echo "FAIL: $*" >&2; exit 1; }
called() { grep -q -- "$1" "$STUB/calls"; }
remote_has_branch() { git -C "$root/origin.git" rev-parse --verify --quiet "refs/heads/$1" >/dev/null; }

# 1. Fork already contains upstream: nothing happens.
run_sync
called "pr create" && fail "up to date: opened a PR"
called "issue create" && fail "up to date: opened an issue"
remote_has_branch upstream-sync && fail "up to date: pushed a branch"
echo "ok - up to date"

# 2. Upstream moves ahead: branch pushed, PR opened.
commit "$root/up" app.txt "v2" "upstream feature"
git -C "$root/up" push --quiet "$root/upstream.git" main
run_sync
remote_has_branch upstream-sync || fail "ahead: branch not pushed"
called "pr create" || fail "ahead: no PR opened"
git -C "$root/origin.git" log --format=%s upstream-sync | grep -q "upstream feature" ||
  fail "ahead: upstream commit missing from sync branch"
git -C "$root/origin.git" log --format=%s upstream-sync | grep -q "fork change" ||
  fail "ahead: fork commit missing from sync branch"
echo "ok - opens a PR"

# 3. PR already open and upstream moves again: the same PR is updated.
echo 7 >"$STUB/open_pr"
commit "$root/up" app.txt "v3" "upstream fix"
git -C "$root/up" push --quiet "$root/upstream.git" main
run_sync
called "pr edit 7" || fail "open PR: not updated"
called "pr create" && fail "open PR: opened a second PR"
git -C "$root/origin.git" log --format=%s upstream-sync | grep -q "upstream fix" ||
  fail "open PR: new upstream commit missing"
echo "ok - updates the open PR"

# 4. Nothing new while the PR is open: no calls that change anything.
run_sync
called "pr edit" && fail "no change: PR edited"
echo "ok - idle while PR is open"

# 5. Conflict: no push, an issue is opened.
rm "$STUB/open_pr"
git -C "$root/fork" checkout --quiet main
commit "$root/fork" app.txt "fork edit" "fork edits app"
git -C "$root/fork" push --quiet origin main
git -C "$root/origin.git" branch -D upstream-sync >/dev/null
commit "$root/up" app.txt "v4" "upstream edits app"
git -C "$root/up" push --quiet "$root/upstream.git" main
run_sync
called "issue create" || fail "conflict: no issue opened"
called "pr create" && fail "conflict: opened a PR"
remote_has_branch upstream-sync && fail "conflict: pushed a branch"
git -C "$root/fork" diff --quiet || fail "conflict: left the work tree dirty"
echo "ok - reports conflicts"

# 6. Conflict still there with an open issue: the issue is updated.
echo 3 >"$STUB/conflict_issue"
run_sync
called "issue edit 3" || fail "conflict again: issue not updated"
called "issue create" && fail "conflict again: second issue opened"
echo "ok - updates the conflict issue"

# 7. Conflict resolved on main: issue closed, nothing else.
git -C "$root/fork" checkout --quiet main
git -C "$root/fork" pull --quiet --no-rebase origin main
git -C "$root/fork" fetch --quiet "$root/upstream.git" main
git -C "$root/fork" merge --quiet FETCH_HEAD -m "manual merge" >/dev/null 2>&1 || true
printf 'resolved\n' >"$root/fork/app.txt"
git -C "$root/fork" add app.txt
git -C "$root/fork" commit --quiet --no-edit
git -C "$root/fork" push --quiet origin main
run_sync
called "issue close 3" || fail "resolved: conflict issue not closed"
echo "ok - closes the conflict issue"

echo "all upstream-sync tests passed"
