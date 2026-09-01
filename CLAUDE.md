# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- Run the CLI: `pnpx tsx index.ts <command>` (or `pnpm run run`)
- Initialize a new knowledge base: `pnpx tsx index.ts init <dir>` — writes a template tree (`content/`, `readme.md`, `.mylearn/config.json`)
- Import a source as a problem: `pnpx tsx index.ts add <source> -c <category>` (`-t <type>` optional) — fetchers: `pdf` (via `markitdown`, local files) and `luogu` (a pid like `P4001` or a full Luogu problem URL, parsed from the page's `lentille-context` JSON payload). Auto-detection is by fetcher capability: each `Fetcher` declares `canFetch(source)` and `fetchProblem` picks the first registry entry that claims the source (`-t` wins over autodetection). Writes files under `content/<category>/<title>/` and prints the saved path. Fetcher types are the keys of the `fetchers` registry in `src/fetch/index.ts`.
- Maintain: `pnpx tsx index.ts maintain watch` — one-shot: diffs `content/` against `.mylearn/index/latest.json` (mtime comparison, re-hash changed files with sha256), persists the new snapshot and prints added/changed/removed. `--watch` keeps running (debounced `fs.watch`) and prints deltas. `pnpx tsx index.ts maintain luogu <solution.cpp> -p <pid>` compiles the solution with `g++` (execFile, no shell; external system dependency, throws if missing) and validates it against the note's `### 样例` input/output blocks — passes when normalized stdout matches; exits 1 on any failure.
- Typecheck: `pnpm exec tsc --noEmit` (note: `pnpx tsc` resolves the wrong package, use `pnpm exec tsc`).
- Tests: `pnpm test` — built-in `node:test` runner via `tsx --test`, no extra deps; suites are `tests/fetch.test.ts` (fetcher `canFetch` matrix, resolution order, live conversions, end-to-end store) and `tests/maintain.test.ts` (watch snapshot diff, sample parsing, g++-backed validate — skipped without g++). Some fetch cases hit the network (Luogu). To filter (note: the flag must precede the file path): `pnpx tsx --test --test-name-pattern "canFetch|resolution|watch|parseSamples" tests/fetch.test.ts tests/maintain.test.ts` (offline-only); network cases are in suites named `conversion (live network)` and `end to end`. No lint or build step; TypeScript runs directly via `tsx`.

**Startup requirement:** `index.ts` imports `src/utils/global.ts`, which exits the process (exit code 1) unless the *current working directory* contains `.mylearn/config.json`. The CLI must be run from inside an initialized project (e.g. `data/`, gitignored). `init` writes the project at the path passed as argument, but the startup check still uses CWD.

## Architecture

A CLI for managing a personal competitive-programming problem knowledge base: problems and solutions live on disk as markdown files under a category-organized tree.

- **Entry** — `index.ts` imports `src/utils/global.ts` (loads `.mylearn/config.json` into `globalThis.projectConfig`, sets `globalThis.projectRoot`), then `src/utils/arg.ts` (commander, `.ts`-extension imports). New subcommands are registered here.
- **Domain model** — `src/utils/problem.ts` is pure interfaces, no IO: `NoteFile` (title, description, `sourceFiles`), `Solution`, `Problem` (adds `category`, `solutions`).
- **Persistence/layout** — `src/utils/persist.ts` is the single source of truth for where things live (`content/<category>/<title>/` with `problem.md` holding `title`/`category` frontmatter via gray-matter, `<title>.md` per solution, copied source files) and owns all disk reads/writes (`createProblem`, `listSolutions`, `addSolutionFile`, etc.). Root is always passed as a parameter — the model never captures `globalThis.projectRoot`.
- **File-backed proxies** — `src/utils/noteFile.ts` returns live `Problem`/`Solution` objects (`openProblem(dir)`, `openSolution(path)`) backed by a JS `Proxy`: gets redisk (frontmatter/body, `solutions` from directory listing), and setting `title`/`category`/`description` writes through to `problem.md` immediately. Structural mutations (`solutions`, `sourceFiles`) go through `persist.ts` helpers, not `set`.
- **Fetchers** — `src/fetch/index.ts` keeps a typed registry `fetchers: Record<string, Fetcher>` (with `FetchType = keyof typeof fetchers`); `fetchProblem(root, source, type, category)` converts source → `Draft` (title/description/sourceFiles, defined in `src/fetch/types.ts`), then `createProblem` + `openProblem`. `src/fetch/pdf.ts` shells out to the `markitdown` CLI (external system dependency), throwing if it's unavailable; `src/fetch/luogu.ts` fetches a Luogu page and parses its `lentille-context` Serde JSON payload (pid, contenu sections, samples).
- **Project scaffolding** — `src/project/init.ts` recursively creates the template tree, erroring if a path exists with the wrong kind (file vs dir).
- **Maintain** — `src/maintain/watch.ts` snapshots `content/` into `.mylearn/index/latest.json` (per-file mtime + sha256; a file is re-hashed only when its mtime changed) and returns a `NoteDiff` so the caller can trigger a rebuild; `maintain luogu` (`src/maintain/luogu.ts`) parses `### 样例` sections from a note description and validates a C++ solution against them (compile via g++ → run each sample input on stdin → compare normalized stdout; timeout → TLE, nonzero exit → runtime error); `findProblemByPid` locates a note dir by pid across categories.

### In-progress work (empty placeholder files)

`src/fetch/scan.ts`, `src/project/search.ts`, and `src/project/review.ts` are empty stubs. `search.ts`/`review.ts` can consume `openProblem`. The old `src/project/maintain.ts` stub was replaced by `src/maintain/` (watch already writes the snapshot `scan` can rebuild from). `parseFrontMatter.ts` is obsolete — the proxy's gray-matter reading in `persist.ts`/`noteFile.ts` supersedes it. `init.ts` still writes the template's `Problem 1/Problem 1.md` layout while notes are written as `problem.md` (pre-existing inconsistency). Check git status before assuming a module is implemented.

## Conventions

- ES modules (`"type": "module")`; `tsconfig.json` uses `module: nodenext` with `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` — relative imports **must** keep explicit `.ts` extensions (`import x from "../utils/global.ts"`).
- `package.json` `main: index.js` is stale; the real entry is `index.ts` executed via tsx.
