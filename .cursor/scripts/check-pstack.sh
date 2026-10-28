#!/usr/bin/env bash
# Red/green gate for the vendored pstack layout used by cloud agents.
# Fails unless:
#   1. .cursor/skills/poteto-mode/SKILL.md exists
#   2. .cursor/settings.json is valid JSON with plugins.pstack.enabled === true
#   3. .cursor/rules/pstack-models.mdc exists and its active (non-comment)
#      settings name no model other than grok-4.6
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fail=0

ok() { printf 'OK: %s\n' "$1"; }
bad() { printf 'FAIL: %s\n' "$1"; fail=1; }

skill="$ROOT/.cursor/skills/poteto-mode/SKILL.md"
if [[ -f "$skill" ]]; then
  ok ".cursor/skills/poteto-mode/SKILL.md exists"
else
  bad "missing .cursor/skills/poteto-mode/SKILL.md"
fi

settings="$ROOT/.cursor/settings.json"
if [[ ! -f "$settings" ]]; then
  bad "missing .cursor/settings.json"
else
  if python3 - "$settings" <<'PY'
import json, sys
path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
except json.JSONDecodeError as e:
    print(f"invalid JSON: {e}")
    sys.exit(2)
except OSError as e:
    print(f"unreadable: {e}")
    sys.exit(2)
plugins = data.get("plugins") if isinstance(data, dict) else None
pstack = plugins.get("pstack") if isinstance(plugins, dict) else None
enabled = pstack.get("enabled") if isinstance(pstack, dict) else None
if enabled is True:
    sys.exit(0)
print("plugins.pstack.enabled is not true")
sys.exit(1)
PY
  then
    ok ".cursor/settings.json is valid JSON with pstack enabled"
  else
    status=$?
    if [[ $status -eq 2 ]]; then
      bad ".cursor/settings.json is not valid JSON"
    else
      bad ".cursor/settings.json does not enable plugins.pstack"
    fi
  fi
fi

models="$ROOT/.cursor/rules/pstack-models.mdc"
if [[ ! -f "$models" ]]; then
  bad "missing .cursor/rules/pstack-models.mdc"
else
  if python3 - "$models" <<'PY'
import re, sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

# Drop YAML frontmatter so alwaysApply / description are not treated as settings.
body = text
if text.startswith("---"):
    parts = text.split("---", 2)
    if len(parts) >= 3:
        body = parts[2]

active_lines = []
for raw in body.splitlines():
    stripped = raw.strip()
    if not stripped or stripped.startswith("#"):
        continue
    if "#" in stripped:
        stripped = stripped[: stripped.index("#")].rstrip()
    if stripped:
        active_lines.append(stripped)

# Model ids used as values, not role labels. Match grok / claude / gpt /
# composer / cursor-grok family slugs (including grok-4.7-xhigh-fast).
model_re = re.compile(
    r"\b("
    r"cursor-grok-[\w.\-]+"
    r"|grok-[\w.\-]+"
    r"|claude-[\w.\-]+"
    r"|gpt-[\w.\-]+"
    r"|composer-[\w.\-]+"
    r")\b",
    re.IGNORECASE,
)

found_pin = False
other = []
for line in active_lines:
    for match in model_re.findall(line):
        if match.lower() == "grok-4.6":
            found_pin = True
        else:
            other.append((line, match))

if other:
    print("active settings name a model other than grok-4.6:")
    for line, match in other:
        print(f"  {match!r} in: {line}")
    sys.exit(1)
if not found_pin:
    print("no active grok-4.6 setting found")
    sys.exit(1)
print("active model settings are grok-4.6 only")
sys.exit(0)
PY
  then
    ok ".cursor/rules/pstack-models.mdc pins only grok-4.6 as an active setting"
  else
    bad ".cursor/rules/pstack-models.mdc has a non-grok-4.6 active model (or none)"
  fi
fi

if [[ $fail -ne 0 ]]; then
  echo "check-pstack: FAIL"
  exit 1
fi
echo "check-pstack: PASS"
exit 0
