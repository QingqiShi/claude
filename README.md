# ~/.claude — personal Claude Code config

Git-backed so a new machine can be restored from scratch. The guiding rule:

> **Commit *references*, not third-party code.** My own skills/config live here as
> source. Third-party plugins & skills are reinstalled from upstream via a
> bootstrap script — never vendored/forked into this repo.

## What's tracked vs. reinstalled

| Thing | In git? | Source of truth | Restored by |
|---|---|---|---|
| `settings.json`, `CLAUDE.md`, `statusline-command.sh` | ✅ committed | this repo | `git clone` |
| **My custom skills** — `auto-improve`, `raise-pr`, `merge-dependabot` | ✅ committed | this repo | `git clone` |
| **Marketplace plugins** — `codex`, `frontend-design`, `skill-creator`, `claude-code-setup` | ❌ ignored | `settings.json` → `enabledPlugins` + `extraKnownMarketplaces` | `bootstrap.sh` → `claude plugin install` |
| **`vercel-cli`** skill | ❌ ignored | `npx skills add github.com/vercel/vercel --skill vercel-cli` | `bootstrap.sh` |
| **`playwright-cli`** skill (binary-generated) | ❌ ignored | `@playwright/cli` npm pkg → `playwright-cli install --skills` | `bootstrap.sh` |

The two third-party skill folders (`skills/vercel-cli/`, `skills/playwright-cli/`)
are `.gitignore`d — present on disk, absent from git.

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
./update.sh             # updates plugins, vercel-cli, and playwright-cli to latest
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
- **`skills`-CLI skill:** `npx skills add <repo> --skill <name> -g`, then add the
  `"<url>|<name>"` line to `SKILLS_CLI_PACKAGES` in `bootstrap.sh` and the name to
  `SKILLS_CLI_INSTALLED` in `update.sh`.
- Confirm it's ignored (not vendored): `git check-ignore skills/<name>`.
