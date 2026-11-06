# ~/.claude — personal Claude Code config

Git-backed so a new machine can be restored from scratch. The guiding rule:

> **Commit *references*, not third-party code.** My own skills/config live here as
> source. Third-party plugins & skills are reinstalled from upstream via a
> bootstrap script — never vendored/forked into this repo.

## What's tracked vs. reinstalled

| Thing | In git? | Source of truth | Restored by |
|---|---|---|---|
| `settings.json`, `CLAUDE.md`, `statusline-command.sh`, `hooks/` | ✅ committed | this repo | `git clone` |
| **My custom skills** — `auto-improve`, `pr-standards`, `merge-dependabot`, `prepare-for-pr`, `agent-instructions` | ✅ committed | this repo | `git clone` |
| **My mods** — `mods/dev-band` and `mods/sprout`, see [My mods](#my-mods) | ✅ committed | this repo | `git clone` |
| `sprout-cache/` (sprout's scan cache) and `sprout-imports/<device>/` (transcripts copied from other machines, counted by sprout) | ❌ ignored | this machine | re-created by sprout; imports copied by hand |
| **Marketplace plugins** — `codex`, `frontend-design`, `skill-creator`, `claude-code-setup` | ❌ ignored | `settings.json` → `enabledPlugins` + `extraKnownMarketplaces` | `bootstrap.sh` → `claude plugin install` |
| **`vercel-cli`** skill | ❌ ignored | `npx skills add github.com/vercel/vercel --skill vercel-cli` | `bootstrap.sh` |
| **`improve-codebase-architecture`** skill, plus the skills it calls: `codebase-design`, `domain-modeling`, `grilling` | ❌ ignored | `npx skills add github.com/mattpocock/skills --skill <name>` | `bootstrap.sh` |
| **`gh-stack`** skill, plus the `gh stack` extension it drives | ❌ ignored | `gh skill install github/gh-stack gh-stack` + `gh extension install github/gh-stack` | `bootstrap.sh` |
| **`playwright-cli`** skill (binary-generated) | ❌ ignored | `@playwright/cli` npm pkg → `playwright-cli install --skills` | `bootstrap.sh` |

The third-party skill folders (`skills/vercel-cli/`, `skills/playwright-cli/`, and the
four `mattpocock/skills` ones, and `skills/gh-stack/`) are `.gitignore`d — present on disk, absent from git.

## My mods

Claude Code mods are plugins that change Claude Code's own interface. `settings.json` loads both of them in every session:
- `env.CLAUDE_CODE_PLUGIN_DIRS` names their folders, separated by `:`.
- `env.CLAUDE_CODE_PLUGIN_DIR_WATCH=1` makes desktop sessions hot-reload them, so an edit to a mod's folder shows up without a new session.

### dev-band: the band above the prompt

![dev-band](mods/dev-band/screenshot.png)

- **Context:** a liquid meter of the context used, measured against the auto-compact window (400k), not the model's 1M.
- **Cost:** the session cost with a per-turn sparkline, a rolling number and a `+$delta` pill.
- **Agents:** the running subagents as comets on an orbit, pinned to the right so that they do not shift the layout.

### sprout (芽团): a pane beside the chat

![sprout](mods/sprout/screenshot.webp)

It shows long-lived information that is not tied to one session:
- **Pet:** a cheeky pixel pet that talks back and has buttons to feed and pat it.
  - It grows through 9 levels with the cumulative tokens, from Lv1 种子 (0) to Lv9 传说金树 (1000B), and never loses a level.
  - Its mood follows the quota, the streak, the time of day and merged PRs.
- **Quota:** the weekly and 5-hour quota, with a forecast of where each will be at its reset.
- **Usage since the first transcript:** tokens, estimated API cost, streak and cache hit rate, with a daily trend and a heatmap.
- **GitHub:** the contribution heatmap, from `gh`.

Open it with `/sprout` if it does not open by itself; a narrow window keeps it closed.

`mods/sprout/scripts/scan.mjs` reads every transcript in `projects/` and in each `sprout-imports/<device>/`. It caches what it has read in `sprout-cache/`, so later runs read only new lines. Both folders are git-ignored, because transcripts hold whole conversations.

To count the history of another machine, pack its transcripts there:

```sh
cd ~/.claude && find projects -name '*.jsonl' | tar czf ~/claude-transcripts.tgz -T -
```

Then extract the archive here into `~/.claude/sprout-imports/<device>/`. The next scan counts it, and a message that is on both machines counts once.

## New machine setup

```sh
git clone <this-repo> ~/.claude
cd ~/.claude
./bootstrap.sh          # installs plugins + third-party skills from upstream
```

Prereqs: `git`, `node`/`npm`, `jq`, and the `claude` CLI on PATH.

> Trade-off of the reference model: a bare `git clone` gives you config + your own
> skills immediately, but the third-party plugins/skills don't exist until
> `bootstrap.sh` runs.

## Keeping third-party skills up to date

Updating is decoupled from git — the third-party skills are ignored, so refreshing
them changes nothing to commit; it just pulls the latest bits onto this machine.

```sh
./update.sh             # updates plugins, skills-CLI skills, and playwright-cli to latest
```

`update.sh` writes `.last-skill-update` (timestamp + versions) so you can see how
stale things are.

### Optional: run it monthly (macOS launchd)

```sh
cat > ~/Library/LaunchAgents/dev.qingqi.claude-skills-update.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.qingqi.claude-skills-update</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string><string>-lc</string>
    <string>"$HOME/.claude/update.sh" >> "$HOME/.claude/.skill-update.log" 2>&1</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Day</key><integer>1</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer>
  </dict>
</dict></plist>
PLIST
launchctl load ~/Library/LaunchAgents/dev.qingqi.claude-skills-update.plist
```

Runs `update.sh` at 10:00 on the 1st of each month (login shell → picks up
node/claude PATH). Remove with `launchctl unload …` then delete the plist.

## Adding a new third-party skill/plugin later

- **Plugin:** install as usual; it lands in `settings.json` → nothing else to do.
- **`skills`-CLI skill:** `npx skills add <repo> --skill <name> -g --agent claude-code --copy`,
  then add the `"<url>|<name>"` line to `SKILLS_CLI_PACKAGES` in both `bootstrap.sh`
  and `update.sh`.
- **`gh skill` skill:** `gh skill install <owner/repo> <name> --agent claude-code --scope user`,
  then add the `"<owner/repo>|<name>"` line to `GH_SKILL_PACKAGES` in both `bootstrap.sh`
  and `update.sh`, and the `skills/<name>` line to `.gitignore`.
- Confirm it's ignored (not vendored): `git check-ignore skills/<name>`.
