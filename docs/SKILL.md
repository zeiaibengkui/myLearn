---
name: mylearn
description: Manage the myLearn competitive-programming knowledge base — fetch problems (Luogu/PDF), read note files, write and submit C++ solutions (auto-validated against samples), and keep the index snapshot fresh. Use when the task involves the problemset, a luogu pid, a solution .cpp, or the freeform notes/ tree.
---

# myLearn — knowledge-base workflow

myLearn is a personal competitive-programming knowledge base: every problem is a
markdown *note* under a category tree, and every accepted solution is validated
against the note's samples before it is archived.

```
<project>/
├── .mylearn/config.json      # project marker (required to run the CLI)
├── problems/
│   └── <category>/
│       └── <title>/
│           ├── problem.md    # frontmatter: title, category; body = statement + samples
│           ├── <solution>.md # one per archived solution (written by luogu submit)
│           ├── Explanation.md # optional: the agent-written explanation (idea, complexity)
│           └── *.cpp         # copied source files
├── notes/                    # freeform notes, sibling of problems/ (nestable)
├── .vitepress/               # site scaffold — config.ts, sidebar.ts, theme/ (from `site setup`)
├── .github/workflows/        # site-pages.yml — GitHub Pages CI (from `site setup --pages`)
├── package.json              # site scripts + vitepress devDeps (from `site setup --pages`)
└── readme.md                 # the site's home page
```

## The CLI is the contract

All knowledge-base operations go through ONE invocation — there is no `luogu`
or `maintain` binary on PATH, so never paste a bare verb. `index.ts` lives in
the myLearn **repo**, not the project:

```bash
# from inside an initialized project (has .mylearn/config.json):
pnpx tsx /path/to/myLearn/index.ts luogu submit sol.cpp -p P4001

# from anywhere else — pin the project:
MYLEARN_PROJECT=/path/to/project pnpx tsx /path/to/myLearn/index.ts luogu fetch P4001
```

The reference below lists verbs as shorthands (`luogu submit ...`) of that
invocation. The CLI refuses to start unless it finds `.mylearn/config.json`
(in the CWD, or at `MYLEARN_PROJECT`).

## Workflow

1. **Fetch a problem** — import it as a note. Two sources:
   - Luogu: `luogu fetch P4001` or a URL, `-c <category>` (default `luogu`)
   - Local PDF: `pdf import notes.pdf -c course` (needs the `markitdown` CLI)

2. **Read the note** — `problems/luogu/P4001/problem.md` is plain markdown
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
   - `maintain watch` one-shot diff of `problems/` vs `.mylearn/index/latest.json`
   - `daemon` the long-running watcher (Ctrl-C stops)

7. **Optional — browse as a site** — the markdown files *are* the site: there
   is no generation step. `site dev` runs the VitePress dev server on this
   project (sidebar from the disk tree, math, breadcrumbs); `site build`
   produces a static site in `.vitepress/dist/` (same as the scaffolded
   `site:build` script). `readme.md` is the home page; every `problem.md`
   resolves to `/problems/<cat>/<title>/`. To publish: `site setup --pages`,
   push to GitHub, then repo Settings → Pages → Source: GitHub Actions.

## Command reference

| Command | Purpose |
|---|---|
| `init <dir>` | write a project template tree |
| `luogu fetch <source> [-c <category>]` | import a Luogu problem (pid or URL), default category `luogu` |
| `luogu submit <sol.cpp> -p <problem>` | validate against samples; archive on success |
| `pdf import <file> -c <category>` | import a local PDF as a note |
| `maintain watch` | diff problems/ vs the index snapshot (one-shot) |
| `maintain luogu -p <problem>` | re-validate the C++ sources saved in a note |
| `ai "<prompt>" [-p <problem>]` | hand the prompt to the client CLI (with `-p`, the note bundle + a pointer to this doc) |
| `site setup [--pages] [--force]` | scaffold `.vitepress/` (+ package.json + GitHub Pages workflow with `--pages`); run it once per project |
| `site dev / build / preview` | run VitePress on this project's markdown (dev server / static `site` in `.vitepress/dist/` / preview it) |

Types of arguments: `-p, --problem <spec>` works anywhere in the command line
(`-p P5985 luogu submit sol.cpp` or `luogu submit sol.cpp -p P5985`). `spec` is
either a path (absolute, CWD/project/problems-relative) or a case-insensitive
substring matching **exactly one** note title (0 matches → error, >1 → lists
them).

## Gotchas

- `luogu submit <sol.cpp>` resolves the solution path against the process
  CWD, not the project root — pass an absolute path when running from
  elsewhere (`-p`, on the other hand, also tries project/problems-relative).
- The CLI refuses to start without `.mylearn/config.json` in the CWD. When
  spawning from a different CWD (scripts, agents), pin it:
  `MYLEARN_PROJECT=/path/to/project`.
- The client `ai` spawns is configurable via `ai-client-prefix` in
  `.mylearn/config.json` (space-separated; default `codex`; the prompt is the
  last argument — e.g. `codex --yolo`).
- `g++` (luogu submit/maintain) and `markitdown` (pdf import) are optional
  system dependencies — the verb that needs them fails with a clear error.
- Web-sourced titles are sanitized; path segments are validated on save.
- The site renders in place — `site dev|build|preview` pin the *app project*
  from the CWD, so run the CLI inside the project (or `cd` there first).
- GitHub Pages: the site lives under `/<repo>/` on repo sites (`MYLEARN_BASE`
  in the workflow); a `<user>.github.io` repo is normalized to `/`. In repo
  Settings → Pages, choose Source *GitHub Actions* — and the repo needs its
  scaffolded `package.json`, because CI has no access to the myLearn repo.
  Commit a `pnpm-lock.yaml` too (`pnpm install --lockfile-only`): the
  workflow's setup-node cache errors without it.
- Verifying your own work: `pnpm exec tsc --noEmit` and `pnpm test` (from the
  myLearn repo, not the project).
