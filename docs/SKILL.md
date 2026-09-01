---
name: mylearn
description: Manage the myLearn competitive-programming knowledge base — fetch problems (Luogu/PDF), read note files, write and submit C++ solutions (auto-validated against samples), and keep the index snapshot fresh. Use when the task involves the problemset, a luogu pid, a solution .cpp, or notes under content/.
---

# myLearn — knowledge-base workflow

myLearn is a personal competitive-programming knowledge base: every problem is a
markdown *note* under a category tree, and every accepted solution is validated
against the note's samples before it is archived.

```
<project>/
├── .mylearn/config.json      # project marker (required to run the CLI)
├── content/
│   └── <category>/
│       └── <title>/
│           ├── problem.md    # frontmatter: title, category; body = statement + samples
│           ├── <solution>.md # one per archived solution (written by luogu submit)
│           ├── Explanation.md # optional: the agent-written explanation (idea, complexity)
│           └── *.cpp         # copied source files
└── readme.md
```

## The CLI is the contract

All knowledge-base operations go through the CLI: `pnpx tsx index.ts <command>`
run **from inside an initialized project** (the dir with `.mylearn/config.json`).
There is no separate server or API — the commands below are the whole surface.

## Workflow

1. **Fetch a problem** — import it as a note. Two sources:
   - Luogu: `luogu fetch P4001` or a URL, `-c <category>` (default `luogu`)
   - Local PDF: `pdf import notes.pdf -c course` (needs the `markitdown` CLI)

2. **Read the note** — `content/luogu/P4001/problem.md` is plain markdown
   (statement, samples, saved solutions); or list notes via `maintain watch`.
   There is no separate "open" step — the files *are* the knowledge base.

3. **Solve** — write your solution to disk with your own file tools
   (`/tmp/sol.cpp` or next to the note). No CLI verb edits files.

4. **Submit** — validate + archive in one step:
   `luogu submit sol.cpp -p P4001` — compiles with `g++`, runs every
   `### 样例` case on stdin, compares normalized stdout. All cases pass →
   archives (a `<solution>.md` + the .cpp copy); otherwise exit 1, nothing saved.

5. **Explain** — after the submit passes, also write `Explanation.md` into
   the note dir with your own file tools: the idea, the key observations, the
   complexity, and what the problem teaches. The archived `<solution>.md`
   carries only the code — the explanation is yours, the CLI leaves it alone.

6. **Revalidate / keep fresh** —
   - `maintain luogu -p <note>` re-runs every saved .cpp in a note
   - `maintain watch` one-shot diff of `content/` vs `.mylearn/index/latest.json`
   - `daemon` the long-running watcher (Ctrl-C stops)

## Command reference

| Command | Purpose |
|---|---|
| `init <dir>` | write a project template tree |
| `luogu fetch <source> [-c <category>]` | import a Luogu problem (pid or URL), default category `luogu` |
| `luogu submit <sol.cpp> -p <problem>` | validate against samples; archive on success |
| `pdf import <file> -c <category>` | import a local PDF as a note |
| `maintain watch` | diff content/ vs the index snapshot (one-shot) |
| `maintain luogu -p <problem>` | re-validate the C++ sources saved in a note |
| `ai "<prompt>" [-p <problem>]` | hand the prompt to the codex CLI (with `-p`, the note bundle + a pointer to this doc) |
| `daemon` | keep the index snapshot fresh while running |

Types of arguments: `-p, --problem <spec>` works anywhere in the command line
(`-p P5985 luogu submit sol.cpp` or `luogu submit sol.cpp -p P5985`). `spec` is
either a path (absolute, CWD/project/content-relative) or a case-insensitive
substring matching **exactly one** note title (0 matches → error, >1 → lists
them).

## Gotchas

- The CLI refuses to start without `.mylearn/config.json` in the CWD. When
  spawning from a different CWD (scripts, agents), pin it:
  `MYLEARN_PROJECT=/path/to/project`.
- `g++` (luogu submit/maintain) and `markitdown` (pdf import) are optional
  system dependencies — the verb that needs them fails with a clear error.
- Web-sourced titles are sanitized; path segments are validated on save.
- Verifying your own work: `pnpm exec tsc --noEmit` and `pnpm test` (from the
  myLearn repo, not the project).
