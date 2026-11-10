---
name: sprout
description: Opens Miao (小苗), the pixel pet with the Codex usage, quota and GitHub activity of this computer. Use it when the person asks to open, show or refresh Miao or 小苗, to water, pat or roast it, to ask Tibo for rain, or to call CatGPT.
---

Call `sprout_status` to open Miao. Pass the working directory of the current chat as `cwd`, never the plugin's own folder. Pass `refresh: true` when the person asks for new numbers. A client with MCP Apps shows the panel; in any other client, pass on the summary the tool returns.

Call `sprout_interact` for the pet: `feed` waters it, `pat` pats it, `roast` makes it speak, `pray` asks Tibo for rain, and `cat` calls CatGPT. Praying is a joke: it plays an animation and never resets a quota, so do not say that it did.

When you talk about the numbers:

- The usage is that of the Codex sessions kept on this computer, not of the whole account.
- The cost is what the tokens would cost at today's API prices. It is not a bill, and not what the subscription costs.
- A quota reading can be minutes old, and the forecast is an estimate. No reading does not mean that no quota is left.
