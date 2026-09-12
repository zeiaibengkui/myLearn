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
├── .vitepress/               # site config — theme/, sidebar.ts (from `init --online`)
├── .github/workflows/        # site-pages.yml — GitHub Pages CI (from `init --online`)
├── package.json              # site scripts + vitepress devDeps (from `init --online`)
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

7. **Optional — browse as a site** — the markdown files *are* the site: there
   is no generation step and no `site` verb. A project scaffolded with
   `init --online` carries VitePress + scripts, so `pnpm install` once, then
   `pnpm site` (dev server), `pnpm site:build` (static site in
   `.vitepress/dist/`), `pnpm site:preview`. `readme.md` is the home page;
   every `problem.md` resolves to `/problems/<cat>/<title>/`; the sidebar
   comes from the disk tree (folded, only the current path open). To publish,
   push to GitHub, then repo Settings → Pages → Source: GitHub Actions.

## Command reference

| Command | Purpose |
|---|---|
| `init <dir> [--online [repo]]` | write a project template tree; `--online` also clones the site scaffold (`.vitepress/` + build/CI files) from a remote KB |
| `luogu fetch <source> [-c <category>]` | import a Luogu problem (pid or URL), default category `luogu` |
| `luogu submit <sol.cpp> -p <problem>` | validate against samples; archive on success |
| `pdf import <file> -c <category>` | import a local PDF as a note |
| `maintain watch` | diff problems/ vs the index snapshot (one-shot) |
| `maintain luogu -p <problem>` | re-validate the C++ sources saved in a note |
| `ai "<prompt>" [-p <problem>]` | hand the prompt to the client CLI (with `-p`, the note bundle + a pointer to this doc) |

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
- Web-sourced titles are sanitized; path segments are validated on save. Word-only
  bracket groups lose their brackets in the *directory* name (`P2748 [USACO16OPEN] …`
  → `…/P2748 USACO16OPEN …/`) — the frontmatter title and the site sidebar keep them.
  Don't "fix" the path back: VitePress treats `[word]` as a dynamic-route param and
  drops the page. `-p` resolves either form by title, so use the pid.
- The site renders in place — the project's own `pnpm site*` scripts (from the
  `init --online` scaffold) run VitePress on the project root; the myLearn CLI
  has no site verb. A project created without `--online` has no `.vitepress/`:
  re-run `init <dir> --online [repo]` in it to pull one in.
- GitHub Pages: the site lives under `/<repo>/` on repo sites (`MYLEARN_BASE`
  in the workflow); a `<user>.github.io` repo is normalized to `/`. In repo
  Settings → Pages, choose Source *GitHub Actions* — the cloned `package.json`
  + `pnpm-workspace.yaml` (esbuild allowlist) are what CI needs, since it has
  no access to the myLearn repo. Run `pnpm install` and commit the
  `pnpm-lock.yaml` it writes: the workflow's setup-node cache errors without it.
- SEO is opt-in: set `MYLEARN_SITE_URL` (canonical origin, e.g.
  `https://chunl.ai`) and `MYLEARN_LANG` (e.g. `zh-CN`) when building —
  the config then emits canonical + og tags per page and writes
  `sitemap.xml` + `robots.txt` (and `<html lang>`). Add both env vars to
  the workflow's build step (they are left there as comments).
- Verifying your own work: `pnpm exec tsc --noEmit` and `pnpm test` (from the
  myLearn repo, not the project).
