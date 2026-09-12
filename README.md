# myLearn

A Node.js CLI for managing a personal competitive-programming problem knowledge base.
Problems and solutions live on disk as markdown files under a category-organized tree;
problems are imported from Luogu (pid or URL) or local PDFs, and C++ solutions can be
validated automatically against the problem's sample cases. Agents can drive the whole
CLI (fetch, submit, maintain) following the workflow in `docs/SKILL.md`.

## Requirements

- Node.js 22+ (ESM)
- [pnpm](https://pnpm.io/) (`node_modules`, scripts)
- `markitdown` CLI — optional, only for PDF imports
- `g++` — optional, only for compiling and validating C++ solutions

## Setup

The CLI checks that the *current working directory* contains `.mylearn/config.json`
and exits otherwise — `init` is no exception. Bootstrap the first project from an
already-initialized one (or create the config by hand):

```bash
# from an initialized project (e.g. the repo's data/ scratch dir):
pnpm run run init /path/to/my-problems

# afterwards, run the CLI from inside the project:
cd /path/to/my-problems && pnpx tsx /path/to/myLearn/index.ts luogu fetch P4001
```

## Commands

```
myLearn init <dir> [--online [repo]]        # write a project template tree;
                                            #  --online also clones the site scaffold
                                            #  (.vitepress/ + build/CI files) from a remote KB
myLearn luogu fetch <source> [-c category]  # import a Luogu problem (pid or URL)
myLearn luogu submit <sol.cpp> -p <problem> # validate a solution, archive on success
myLearn pdf import <file> -c category       # import a local PDF as a note
myLearn ai "<prompt>" [-p <problem>]        # hand the prompt (plus note, with -p) to codex
myLearn maintain watch                      # diff problems/ against the index snapshot (one-shot)
myLearn maintain luogu -p <problem>         # revalidate the solution files stored in a note
```

Every command runs as `pnpx tsx index.ts <command>` — from the project root of the
knowledge base.

`-p/--problem` selects a note in a provider-agnostic way: either a path (absolute,
CWD/project/problems-relative) or a pattern that matches exactly one note title. It can
go before or after the verb (`-p P5985 luogu submit sol.cpp` or `luogu submit sol.cpp -p P5985`).

### Example

```bash
cd my-problems                     # an initialized project directory

pnpx tsx /path/to/myLearn/index.ts luogu fetch P4001 -c luogu         # saves problems/luogu/P4001 .../
pnpx tsx /path/to/myLearn/index.ts luogu submit solution.cpp -p P4001 # runs the samples, prints PASS/FAIL
                                                                      # all passed → archives the .cpp + a solution note
pnpx tsx /path/to/myLearn/index.ts maintain luogu -p P4001            # re-runs the samples on the archived solution
pnpx tsx /path/to/myLearn/index.ts maintain watch                     # what changed since the last snapshot (.mylearn/index/latest.json)
pnpx tsx /path/to/myLearn/index.ts pdf import notes.pdf -c course     # import a local PDF via markitdown
pnpx tsx /path/to/myLearn/index.ts ai "Solve this problem." -p P4001  # paste-ready prompt bundle (no API call)

pnpm site:build                    # the site — its own scripts, not a myLearn verb
                                   # (only in a project created with `init --online`)
```

### AI

`ai "<prompt>" [-p <problem>]` hands the prompt to the client CLI as its initial prompt —
stdio inherited, exit code propagated (no API call). With `-p`, the bundle also adds the
note (task + problem statement + saved solutions). The message always mentions
`docs/SKILL.md` so the agent drives the knowledge base with the CLI instead of guessing.
The client is configurable: `ai-client-prefix` in `.mylearn/config.json`
(space-separated, default `codex`, the prompt is appended as the last arg — e.g.
`codex --yolo` or `claude -p`).

`docs/SKILL.md` holds the agent-facing workflow and command reference, in skill format —
lift it into `.claude/skills/` if you want Claude Code to autoload it. Tip for spawning
from outside a project: pin it with `MYLEARN_PROJECT=/path/to/initialized-project`, since
the CLI refuses to start without `.mylearn/config.json` in its CWD.

## Project layout

```
<project>/
├── .mylearn/
│   ├── config.json          # project config (loaded by the startup check)
│   └── index/
│       └── latest.json      # watcher snapshot: per-file mtime + sha256
├── problems/
│   └── <category>/
│       └── <title>/
│           ├── problem.md   # frontmatter: title, category; body: description (samples as ```text blocks)
│           ├── <solution>.md
│           └── <source files>  # e.g. solution.cpp, imported PDFs
├── notes/                   # freeform notes, sibling of problems/ (nestable)
├── .vitepress/              # site config + theme — cloned by `init --online`;
│                            #   .vitepress/dist/ after a build (gitignored)
├── .github/workflows/       # site-pages.yml (CI) — cloned by `init --online`
├── package.json             # site scripts + vitepress devDeps — cloned by `init --online`
└── readme.md                # the site's home page (rewrites to index.md)
```

## Architecture

- **Domain model** — `src/utils/problem.ts` is pure interfaces (`NoteFile`, `Solution`,
  `Problem`), no IO.
- **Persistence** — `src/utils/persist.ts` is the single source of truth for layout and
  disk reads/writes; the root is always passed as a parameter.
- **Proxies** — `src/utils/noteFile.ts` returns live `Problem`/`Solution` objects backed
  by a JS `Proxy`: reads hit disk, scalar writes (`title`/`category`/`description`)
  write through to `problem.md` immediately.
- **Providers** — domain modules under `src/provider/<name>/` own everything domain
  specific: the CLI (`index.ts`, imported for its side effect to self-register on the
  shared commander instance `src/utils/program.ts`), the fetcher (`fetch.ts`), and
  maintain logic (`maintain.ts` with `maintain(Problem)`). The `maintain` verb
  dispatches provider subcommands accordingly. The shared fetch contract
  (`Fetcher`/`Draft` types + `importDraft`) lives in `src/utils/fetcher.ts` — a
  provider converts a source to a draft and saves it into the knowledge base;
  `src/fetch/` no longer exists, the source domain is chosen by the CLI verb.
  Luogu's fetcher parses the `lentille-context` JSON payload and validates every
  redirect against the Luogu host allowlist; PDF's shells out to `markitdown`.
- **Note selection** — `src/ai/problems.ts` resolves `-p/--problem`: path candidates
  first (absolute / CWD / project / problems-relative), then a pattern that must match
  exactly one note (0 → error, >1 → lists the matches). Every note-taking verb
  (`ai`, `luogu submit`, `maintain luogu`) uses it, so the note id needn't be a Luogu pid.
- **AI provider** — `src/provider/ai/` is the domain module: `prompt.ts` builds the
  paste-ready bundle for `ai "<prompt>" -p`; agents drive the CLI directly (see
  `docs/SKILL.md`).
- **Maintain** — `src/maintain/watch.ts` compares `problems/` with
  `.mylearn/index/latest.json` (mtime first; a file is re-hashed only when its mtime
  changed) and reports added/changed/removed; `provider/luogu/maintain.ts` parses the
  `### 样例` sections of a note description, compiles a C++ solution with `g++`
  (no shell), runs each sample on stdin, and judges with trailing-whitespace
  normalization (timeout → TLE, nonzero exit → runtime error).
- **Site** — there is no custom build system and no `site` verb: the
  knowledge-base markdown IS the site, VitePress renders it in place. The
  scaffold is not shipped with the CLI — a *configured* KB is the template, so
  `init --online [repo]` (default `https://github.com/zeiaibengkui/mylearn-kb`,
  needs `git`) shallow-clones one and copies its site files into the new
  project: every `.vitepress/**` file (minus build output), plus the build/CI
  files it has (`package.json` — renamed to the project —,
  `pnpm-workspace.yaml`, `.github/workflows/*`). The remote's content
  (`problems/`, `notes/`, `readme.md`) never travels; existing files are kept.
  The project then runs its own scripts (`pnpm site`, `pnpm site:build`,
  `pnpm site:preview`). The scaffolded config: routes `readme.md` → home and
  every `problem.md` → `problems/<cat>/<title>/` (rewrites + cleanUrls);
  `MYLEARN_BASE` sets the base at build time (`/<repo>/` from CI, user sites
  normalize to `/`). The sidebar is generated from the disk tree
  (`sidebar.ts`: frontmatter titles, `notes/` recursed) with folder
  behaviour — groups are `collapsed` and only the current path unfolds;
  `markdown: { math: true }` renders math server-side
  (markdown-it-mathjax3); a `buildEnd` hook mirrors non-markdown files
  (solution sources, PDFs) from `problems/` into the output so hosted pages
  keep them downloadable. SEO is opt-in: `MYLEARN_SITE_URL` (canonical
  origin) adds per-page canonical + og tags and writes `sitemap.xml` +
  `robots.txt`, `MYLEARN_LANG` sets `<html lang>` (default `en-US`; `og:title`
  is emitted either way). Comments are opt-in too:
  `MYLEARN_GISCUS="<owner/repo>,<repoId>,<category>,<categoryId>"` (ids from
  giscus.app — the repo needs Discussions + the giscus app) mounts giscus under
  every page; `MYLEARN_GISCUS_MAPPING` picks the discussion key (default
  `pathname`; `og:title` also works) and the widget language follows
  `MYLEARN_LANG`. The theme re-mounts it on client-side navigation and follows
  the appearance toggle.

## Publish to GitHub Pages

The scaffold cloned by `init --online` brings the CI workflow — push the
project to its own GitHub repo, then Settings → Pages → Source: *GitHub
Actions*. Every push to main (and manual runs) rebuilds and deploys
`.vitepress/dist`; the workflow sets `MYLEARN_BASE: /<repo>/` (a
`<user>.github.io` repo is normalized to `/` by the config), and you can set
`MYLEARN_SITE_URL` + `MYLEARN_LANG` on its build step for the SEO extras
(canonical/og, sitemap/robots, `html lang`). CI needs the cloned
`package.json` (scripts + vitepress devDeps + the pnpm pin) and
`pnpm-workspace.yaml` (esbuild allowlist — pnpm 11 blocks its build script
otherwise). Commit a `pnpm-lock.yaml` too: run `pnpm install` (the workflow's
`setup-node` cache step errors without it — the clone reminds you).

All process invocation uses `execFile`/`spawn` (no shell) and path segments are
sanitized, so web-sourced titles can't escape the `problems/` tree.

## Development

```bash
pnpm exec tsc --noEmit          # typecheck (pnpx tsc resolves the wrong package!)
pnpm test                       # node:test via tsx; the luogu fetch suites hit the network,
                                # the C++ suites are skipped without g++, and the clone suite
                                # needs git (it clones a local fixture repository)
```

Tests live in `tests/`, following the modules they cover (`fetch.test.ts`,
`maintain.test.ts`). Agent-facing workflow instructions, ready to lift into a
Claude Code skill: `docs/SKILL.md`.
