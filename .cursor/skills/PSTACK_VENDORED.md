# Vendored pstack

Pinned copy of [cursor/plugins pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT, Lauren Tan) so Cursor cloud agents and Project follow it even when user-installed plugins do not load.

**These copies are pinned and must be refreshed manually.** Do not assume marketplace auto-update will change this tree.

| Field | Value |
|---|---|
| Upstream | https://github.com/cursor/plugins/tree/main/pstack |
| Pinned commit | `c742dd61706fbacc1b95f1a20b7b988cf096ce6c` |
| Version | `0.15.36` (0.15.x) |
| License | MIT (see `LICENSE` in this directory) |
| Vendored | 2026-10-28 |

Hooks were not copied. They do not run in cloud agents. Subagent definitions are in `.cursor/agents/` (`poteto-agent`, `comment-sicko`). Project model pins are in `.cursor/rules/pstack-models.mdc`. Owner overrides are in `.cursor/rules/fd-overrides.mdc` and `AGENTS.md`.

## How to refresh

From the repo root, on a dedicated PR (do not mix with app changes):

```bash
git clone --filter=blob:none --sparse https://github.com/cursor/plugins.git /tmp/pstack-src
cd /tmp/pstack-src
git sparse-checkout set pstack
git fetch origin main
git checkout FETCH_HEAD -- pstack
SHA="$(git rev-parse HEAD)"
VERSION="$(python3 -c 'import json; print(json.load(open("pstack/plugin.json"))["version"])')"
cd - >/dev/null

# Replace skill trees only. Keep this file, then restore LICENSE from upstream.
find .cursor/skills -mindepth 1 -maxdepth 1 ! -name PSTACK_VENDORED.md -exec rm -rf {} +
cp -a /tmp/pstack-src/pstack/skills/. .cursor/skills/
cp /tmp/pstack-src/pstack/LICENSE .cursor/skills/LICENSE
cp /tmp/pstack-src/pstack/agents/*.md .cursor/agents/

# Update the table above with $SHA and $VERSION, then:
.cursor/scripts/check-pstack.sh
```

Re-read `.cursor/rules/pstack-models.mdc` after a refresh. Skill files still hard-code `grok-4.7-xhigh-fast` and `claude-opus-*` as defaults; the project rule must keep overriding them until you change the pin.
