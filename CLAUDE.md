Always use the `raise-pr` skill to make a pull request. This rule applies to all pull requests.

In a worktree, use `git checkout origin/main`. Do not use `git checkout main`, because a different worktree usually has main.

To read a web page, use the `playwright-cli` skill. Do not use `WebFetch`, because it is not reliable. You can use `WebSearch` to find a URL. There is one exception: to read the content of a claude.ai Artifact, use `WebFetch` as the Artifact tool tells you. The page has an authentication gate, and a usual browser shows only the login page.

Make a plan before a large task. Do not use Plan Mode.

For a large task, divide the work. Give each part to a sub-agent. Select Sonnet for a simple or mechanical change. Use reviewer agents for a line-by-line review. Do not do a line-by-line review yourself. Control the quality at a higher level: the build is correct, the tests pass, and Playwright tests the full flow. Give each later change to a sub-agent also. This keeps the context of the main agent small, and you can then do many steps before compaction.

Speak to me in ASD-STE100 Simplified Technical English. Use approved words with one meaning for each word. Write short sentences. Use the active voice. Give one instruction in each sentence. Write comments and JSDoc in the same English.

Also keep comments and JSDoc to one or two lines. Write only what the code cannot show. Do not write design reasons, history, other possible solutions, or text that says the code again.

If a CONTEXT.md file has a glossary, use its terms in code, comments, copy, and conversation. A CONTEXT-MAP.md file can point to one CONTEXT.md file for each context. If my words are not clear, or if I use a synonym or an `_Avoid_` term, ask me which glossary term is correct. Ask before you start the work, especially during the planning.
