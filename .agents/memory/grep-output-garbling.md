---
name: grep/rg output garbling in this environment
description: Shell grep/rg output silently mangles certain words; verify with the read tool, files are fine.
---

In this workspace, `grep`/`rg` shell output can silently corrupt matched/nearby words in
the rendered result — e.g. "competitors" shows as "lns", "competitor" as "n"/"ln",
"industry_intel_config" as "ln_config". The pattern looks like matched substrings are
eaten/replaced in the terminal rendering layer.

**Why:** It is a display artifact of how shell output is rendered here, NOT file corruption.
Trusting the garbled output leads to chasing phantom bugs (thinking source is broken).

**How to apply:** When grep/rg results look wrong or mention nonsense tokens, re-verify the
actual file content with the `read` tool before concluding anything. The files on disk are
correct. Use grep/rg for locating line numbers/counts, but read the real text with `read`.
