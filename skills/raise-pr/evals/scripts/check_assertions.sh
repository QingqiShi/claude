#!/usr/bin/env bash
# check_assertions.sh — Programmatic assertion checker for raise-pr evals.
#
# Usage: check_assertions.sh <test_id> <repo_dir> <capture_dir> [transcript_file]
#
# Runs assertions based on test_id and outputs JSON results.
# Each assertion has: name, passed (bool), evidence (string).

set -euo pipefail

TEST_ID="$1"
REPO_DIR="$2"
CAPTURE_DIR="$3"
TRANSCRIPT="${4:-}"

passed_count=0
failed_count=0
results=()

# Helper: add assertion result
assert() {
  local name="$1" passed="$2" evidence="$3"
  results+=("{\"text\":\"$name\",\"passed\":$passed,\"evidence\":$(printf '%s' "$evidence" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}")
  if [[ "$passed" == "true" ]]; then
    ((passed_count++)) || true
  else
    ((failed_count++)) || true
  fi
}

# Helper: check if file contains string
file_contains() {
  grep -qF -- "$2" "$1" 2>/dev/null
}

# Helper: check transcript for string
transcript_contains() {
  [[ -n "$TRANSCRIPT" ]] && file_contains "$TRANSCRIPT" "$1"
}

transcript_not_contains() {
  [[ -z "$TRANSCRIPT" ]] || ! grep -qF "$1" "$TRANSCRIPT" 2>/dev/null
}

# --- Common assertions for happy-path tests (1, 3, 4, 5, 6) ---
check_branch_name_format() {
  cd "$REPO_DIR"
  local branch
  branch="$(git branch --show-current 2>/dev/null || echo '')"
  if [[ "$branch" =~ ^(feat|fix|refactor|perf|style|test|docs|build|ci|chore|revert)/[a-z0-9-]+$ ]] && [[ ${#branch} -le 50 ]]; then
    assert "Branch name matches <type>/<kebab-case> and ≤50 chars" "true" "branch=$branch"
  else
    assert "Branch name matches <type>/<kebab-case> and ≤50 chars" "false" "branch=$branch"
  fi
}

check_commit_message_format() {
  cd "$REPO_DIR"
  local msg
  msg="$(git log -1 --format=%s 2>/dev/null || echo '')"
  if [[ "$msg" =~ ^(feat|fix|refactor|perf|style|test|docs|build|ci|chore|revert):\ .+ ]]; then
    assert "Commit message starts with <type>: <description>" "true" "msg=$msg"
  else
    assert "Commit message starts with <type>: <description>" "false" "msg=$msg"
  fi
}

check_pushed_to_remote() {
  cd "$REPO_DIR"
  local branch
  branch="$(git branch --show-current 2>/dev/null || echo '')"
  if git log "origin/$branch" --oneline -1 >/dev/null 2>&1; then
    assert "Branch pushed to remote" "true" "origin/$branch exists"
  else
    assert "Branch pushed to remote" "false" "origin/$branch not found"
  fi
}

check_pr_created() {
  if [[ -f "$CAPTURE_DIR/gh_pr_create_args.json" ]]; then
    assert "gh pr create was called" "true" "capture file exists"
  else
    assert "gh pr create was called" "false" "no capture file"
    return
  fi

  # Check PR title format
  local title
  title="$(python3 -c "import json; d=json.load(open('$CAPTURE_DIR/gh_pr_create_args.json')); print(d['title'])" 2>/dev/null || echo '')"
  if [[ "$title" =~ ^(feat|fix|refactor|perf|style|test|docs|build|ci|chore|revert):\ .+ ]] && [[ ${#title} -le 72 ]]; then
    assert "PR title: lowercase, ≤72 chars, starts with <type>:" "true" "title=$title"
  else
    assert "PR title: lowercase, ≤72 chars, starts with <type>:" "false" "title=$title"
  fi

  # Check PR body contains ## Summary
  local body
  body="$(python3 -c "import json; d=json.load(open('$CAPTURE_DIR/gh_pr_create_args.json')); print(d['body'])" 2>/dev/null || echo '')"
  if echo "$body" | grep -q '## Summary'; then
    assert "PR body contains ## Summary" "true" "found in body"
  else
    assert "PR body contains ## Summary" "false" "not found in body"
  fi
}

# --- Test-specific assertions ---

case "$TEST_ID" in
  1)  # Feature on main — happy path
    check_branch_name_format
    check_commit_message_format
    check_pushed_to_remote
    check_pr_created
    # Should be feat/ branch
    cd "$REPO_DIR"
    branch="$(git branch --show-current 2>/dev/null || echo '')"
    if [[ "$branch" == feat/* ]]; then
      assert "Branch type is feat/" "true" "branch=$branch"
    else
      assert "Branch type is feat/" "false" "branch=$branch"
    fi
    ;;

  2)  # Non-main branch stop
    cd "$REPO_DIR"
    # No new commits should have been made
    local_commits="$(git log --oneline feature/existing-work 2>/dev/null | wc -l | tr -d ' ')"
    remote_commits="$(git log --oneline origin/feature/existing-work 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$local_commits" == "$remote_commits" ]]; then
      assert "No new commits were made" "true" "local=$local_commits remote=$remote_commits"
    else
      assert "No new commits were made" "false" "local=$local_commits remote=$remote_commits"
    fi

    # No gh pr create
    if [[ ! -f "$CAPTURE_DIR/gh_pr_create_args.json" ]]; then
      assert "gh pr create was NOT called" "true" "no capture file"
    else
      assert "gh pr create was NOT called" "false" "capture file exists"
    fi

    # Transcript should contain branch name and all three flags
    if [[ -n "$TRANSCRIPT" ]]; then
      if transcript_contains "feature/existing-work"; then
        assert "Stop message mentions branch name" "true" "found feature/existing-work"
      else
        assert "Stop message mentions branch name" "false" "not found"
      fi
      for flag in "--base-from-main" "--stack-on-current" "--commit-to-current"; do
        if transcript_contains "$flag"; then
          assert "Stop message mentions $flag" "true" "found"
        else
          assert "Stop message mentions $flag" "false" "not found"
        fi
      done
    fi
    ;;

  3)  # Refactor on main
    check_branch_name_format
    check_commit_message_format
    check_pushed_to_remote
    check_pr_created
    # Should be refactor/ branch
    cd "$REPO_DIR"
    branch="$(git branch --show-current 2>/dev/null || echo '')"
    if [[ "$branch" == refactor/* ]]; then
      assert "Branch type is refactor/" "true" "branch=$branch"
    else
      assert "Branch type is refactor/" "false" "branch=$branch"
    fi
    ;;

  4)  # --base-from-main
    check_branch_name_format
    check_commit_message_format
    check_pushed_to_remote
    check_pr_created
    # Branch should be based on main (not on feature/existing-work)
    cd "$REPO_DIR"
    branch="$(git branch --show-current 2>/dev/null || echo '')"
    # Check that the branch's parent is main, not feature/existing-work
    if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
      assert "Branch is based on main" "true" "main is ancestor of HEAD"
    else
      assert "Branch is based on main" "false" "main is NOT ancestor of HEAD"
    fi
    ;;

  5)  # --stack-on-current
    check_branch_name_format
    check_commit_message_format
    check_pushed_to_remote
    check_pr_created
    # Should be on a NEW branch (not feature/existing-work)
    cd "$REPO_DIR"
    branch="$(git branch --show-current 2>/dev/null || echo '')"
    if [[ "$branch" != "feature/existing-work" ]]; then
      assert "New branch created (not feature/existing-work)" "true" "branch=$branch"
    else
      assert "New branch created (not feature/existing-work)" "false" "still on feature/existing-work"
    fi
    # feature/existing-work should be ancestor
    if git merge-base --is-ancestor feature/existing-work HEAD 2>/dev/null; then
      assert "Branch is based on feature/existing-work" "true" "feature/existing-work is ancestor"
    else
      assert "Branch is based on feature/existing-work" "false" "not ancestor"
    fi
    ;;

  6)  # --commit-to-current
    check_commit_message_format
    check_pushed_to_remote
    check_pr_created
    # Should still be on feature/existing-work
    cd "$REPO_DIR"
    branch="$(git branch --show-current 2>/dev/null || echo '')"
    if [[ "$branch" == "feature/existing-work" ]]; then
      assert "Still on feature/existing-work (no new branch)" "true" "branch=$branch"
    else
      assert "Still on feature/existing-work (no new branch)" "false" "branch=$branch"
    fi
    ;;

  8)  # Bug fix with GitHub issue
    check_branch_name_format
    check_commit_message_format
    check_pushed_to_remote
    check_pr_created
    # Should be fix/ branch
    cd "$REPO_DIR"
    branch="$(git branch --show-current 2>/dev/null || echo '')"
    if [[ "$branch" == fix/* ]]; then
      assert "Branch type is fix/" "true" "branch=$branch"
    else
      assert "Branch type is fix/" "false" "branch=$branch"
    fi
    # PR body should contain "Closes #87"
    if [[ -f "$CAPTURE_DIR/gh_pr_create_args.json" ]]; then
      body="$(python3 -c "import json; d=json.load(open('$CAPTURE_DIR/gh_pr_create_args.json')); print(d['body'])" 2>/dev/null || echo '')"
      if echo "$body" | grep -qi 'closes #87\|fixes #87'; then
        assert "PR body contains Closes #87" "true" "found issue reference"
      else
        assert "PR body contains Closes #87" "false" "not found in body"
      fi
      if echo "$body" | grep -q '## Context'; then
        assert "PR body does NOT contain ## Context" "false" "found ## Context"
      else
        assert "PR body does NOT contain ## Context" "true" "no ## Context found"
      fi
    fi
    ;;

  9)  # Unclear intent — should stop
    cd "$REPO_DIR"
    # No new commits should have been made (initial commit only)
    local_commits="$(git log --oneline main 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$local_commits" == "1" ]]; then
      assert "No new commits were made" "true" "commit count=$local_commits"
    else
      assert "No new commits were made" "false" "commit count=$local_commits"
    fi

    # No gh pr create
    if [[ ! -f "$CAPTURE_DIR/gh_pr_create_args.json" ]]; then
      assert "gh pr create was NOT called" "true" "no capture file"
    else
      assert "gh pr create was NOT called" "false" "capture file exists"
    fi

    # Transcript should mention intent and AskUserQuestion
    if [[ -n "$TRANSCRIPT" ]]; then
      if transcript_contains "intent" || transcript_contains "motivation" || transcript_contains "why"; then
        assert "Stop message mentions intent" "true" "found"
      else
        assert "Stop message mentions intent" "false" "not found"
      fi
      if transcript_contains "AskUserQuestion" || transcript_contains "ask the user" || transcript_contains "explain the"; then
        assert "Stop message mentions AskUserQuestion or asks the user" "true" "found"
      else
        assert "Stop message mentions AskUserQuestion or asks the user" "false" "not found"
      fi
      if transcript_contains "re-invoke" || transcript_contains "raise-pr" || transcript_contains "/raise-pr"; then
        assert "Stop message mentions re-invoking the skill" "true" "found"
      else
        assert "Stop message mentions re-invoking the skill" "false" "not found"
      fi
    fi
    ;;

  10)  # Trivial typo fix
    check_branch_name_format
    check_commit_message_format
    check_pushed_to_remote
    check_pr_created
    # Should be fix/ branch
    cd "$REPO_DIR"
    branch="$(git branch --show-current 2>/dev/null || echo '')"
    if [[ "$branch" == fix/* ]]; then
      assert "Branch type is fix/" "true" "branch=$branch"
    else
      assert "Branch type is fix/" "false" "branch=$branch"
    fi
    # PR body should NOT contain ## Context
    if [[ -f "$CAPTURE_DIR/gh_pr_create_args.json" ]]; then
      body="$(python3 -c "import json; d=json.load(open('$CAPTURE_DIR/gh_pr_create_args.json')); print(d['body'])" 2>/dev/null || echo '')"
      if echo "$body" | grep -q '## Context'; then
        assert "PR body does NOT contain ## Context" "false" "found ## Context"
      else
        assert "PR body does NOT contain ## Context" "true" "no ## Context found"
      fi
      # Summary should be short — extract text between ## Summary and next ## or end
      summary_text="$(echo "$body" | sed -n '/## Summary/,/^##\|^$/p' | grep -v '##' | tr -d '\n' | xargs)"
      # Count sentences (rough: split on '. ')
      sentence_count="$(echo "$summary_text" | grep -o '\.' | wc -l | tr -d ' ')"
      if [[ "$sentence_count" -le 3 ]]; then
        assert "PR summary section is short (≤3 sentences)" "true" "sentences≈$sentence_count"
      else
        assert "PR summary section is short (≤3 sentences)" "false" "sentences≈$sentence_count"
      fi
    fi
    ;;

  7)  # Message interpretation — AskUserQuestion tool use
    # Primary: check if AskUserQuestion was called via MCP shim capture
    auq_capture="$CAPTURE_DIR/ask_user_question_args.json"
    if [[ -f "$auq_capture" ]]; then
      assert "AskUserQuestion tool was called" "true" "capture file exists"

      # Check that the captured call contains all 3 options
      auq_body="$(cat "$auq_capture")"
      if echo "$auq_body" | grep -qi "main"; then
        assert "Option base-from-main presented" "true" "found main reference in AskUserQuestion args"
      else
        assert "Option base-from-main presented" "false" "no main reference in AskUserQuestion args"
      fi
      if echo "$auq_body" | grep -qi "stack"; then
        assert "Option stack-on-current presented" "true" "found stack reference in AskUserQuestion args"
      else
        assert "Option stack-on-current presented" "false" "no stack reference in AskUserQuestion args"
      fi
      if echo "$auq_body" | grep -qi "commit"; then
        assert "Option commit-to-current presented" "true" "found commit reference in AskUserQuestion args"
      else
        assert "Option commit-to-current presented" "false" "no commit reference in AskUserQuestion args"
      fi
    else
      # Fallback: check transcript for text-based question (e.g., if MCP shim wasn't used)
      assert "AskUserQuestion tool was called" "false" "no capture file — checking transcript fallback"
      if [[ -n "$TRANSCRIPT" ]]; then
        if transcript_contains "base-from-main" || transcript_contains "switch to main" || transcript_contains "Stash and switch"; then
          assert "Option base-from-main presented" "true" "found in transcript"
        else
          assert "Option base-from-main presented" "false" "not found"
        fi
        if transcript_contains "stack-on-current" || transcript_contains "Stack on current" || transcript_contains "stacked on"; then
          assert "Option stack-on-current presented" "true" "found in transcript"
        else
          assert "Option stack-on-current presented" "false" "not found"
        fi
        if transcript_contains "commit-to-current" || transcript_contains "Commit into current" || transcript_contains "commit directly"; then
          assert "Option commit-to-current presented" "true" "found in transcript"
        else
          assert "Option commit-to-current presented" "false" "not found"
        fi
      fi
    fi
    ;;

  *)
    echo "Unknown test ID: $TEST_ID" >&2
    exit 1
    ;;
esac

# --- Output results as JSON ---
total=$((passed_count + failed_count))
pass_rate=$(python3 -c "print(round($passed_count / $total, 2) if $total > 0 else 0)")

echo "{"
echo "  \"expectations\": ["
for i in "${!results[@]}"; do
  if [[ $i -lt $((${#results[@]} - 1)) ]]; then
    echo "    ${results[$i]},"
  else
    echo "    ${results[$i]}"
  fi
done
echo "  ],"
echo "  \"summary\": {"
echo "    \"passed\": $passed_count,"
echo "    \"failed\": $failed_count,"
echo "    \"total\": $total,"
echo "    \"pass_rate\": $pass_rate"
echo "  }"
echo "}"
