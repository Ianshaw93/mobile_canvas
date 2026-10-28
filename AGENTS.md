# AGENTS.md

## pstack overrides (this repo)

pstack is vendored under `.cursor/skills/` for cloud agents. Follow it, with these owner overrides:

- Never auto-merge, never land overnight, never deploy. `autopilot-full` and the Shipping playbook's landing step are off. Use `autopilot-stack` (build and verify PRs; the human lands them).
- Ignore never-block-on-the-human for merges, deploys, secrets, and paid changes.
- Bug fixes: play the gesture back first; reproduce and verify on the matching surface where the human saw it (their tab/device/prod URL); a pass on another surface (e.g. headless Playwright) is a proxy, not a pass; after two failed fixes on the same gate, write down and test the premise before a third attempt; never repeat a "hard refresh and try again" handback.
- Red-green TDD, production typecheck/build gate (`tsc` / `next build` for this TS/Next app), e2e of post-push integration, before/after evidence (screenshots or equivalent) in the PR.
- One PR per concern; stack if needed.
