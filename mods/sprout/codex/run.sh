#!/bin/sh
# Starts Miao's server with a node that runs TypeScript as it is (22.18 or newer). The Codex desktop app does
# not always have the PATH of the shell, so this also looks where version managers put node.
here=$(cd "$(dirname "$0")" && pwd)
for node in node /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/*/bin/node "$HOME/.volta/bin/node" "$HOME/.local/share/mise/shims/node" "$HOME/.asdf/shims/node"; do
  if "$node" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)' 2>/dev/null; then
    exec "$node" --import "$here/loader.mjs" "$here/server.ts"
  fi
done
echo "Miao needs Node.js 22.18 or newer." >&2
exit 1
