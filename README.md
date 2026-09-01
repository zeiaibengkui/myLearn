# myLearn

A Node.js CLI for managing a personal competitive-programming problem knowledge base.
Problems and solutions live on disk as markdown files under a category-organized tree;
problems are imported from Luogu (pid or URL) or local PDFs, and C++ solutions can be
validated automatically against the problem's sample cases.

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
myLearn init <dir>                          # write a project template tree
myLearn add <source> -c <category>          # import source (pdf or luogu, auto-detected)
myLearn luogu fetch <source> [-c category]  # import a Luogu problem (pid or URL)
myLearn luogu submit <sol.cpp> -p <pid>     # validate a solution, archive on success
myLearn maintain watch [--watch]            # diff content/ against the index snapshot
myLearn maintain luogu -p <pid>             # revalidate the solution files stored in a note
```

Every command runs as `pnpx tsx index.ts <command>` — from the project root of the
knowledge base.

### Example

```bash
cd my-problems                     # an initialized project directory

pnpx tsx /path/to/myLearn/index.ts luogu fetch P4001 -c luogu         # saves content/luogu/P4001 .../
pnpx tsx /path/to/myLearn/index.ts luogu submit solution.cpp -p P4001 # runs the samples, prints PASS/FAIL
                                                                      # all passed → archives the .cpp + a solution note
pnpx tsx /path/to/myLearn/index.ts maintain luogu -p P4001            # re-runs the samples on the archived solution
pnpx tsx /path/to/myLearn/index.ts maintain watch                     # what changed since the last snapshot (.mylearn/index/latest.json)
pnpx tsx /path/to/myLearn/index.ts add notes.pdf -c course            # import a local PDF via markitdown
```

## Project layout

```
<project>/
├── .mylearn/
│   ├── config.json          # project config (loaded by the startup check)
│   └── index/
│       └── latest.json      # watcher snapshot: per-file mtime + sha256
├── content/
│   └── <category>/
│       └── <title>/
│           ├── problem.md   # frontmatter: title, category; body: description (samples as ```text blocks)
│           ├── <solution>.md
│           └── <source files>  # e.g. solution.cpp, imported PDFs
└── readme.md
```

## Architecture

- **Domain model** — `src/utils/problem.ts` is pure interfaces (`NoteFile`, `Solution`,
  `Problem`), no IO.
- **Persistence** — `src/utils/persist.ts` is the single source of truth for layout and
  disk reads/writes; the root is always passed as a parameter.
- **Proxies** — `src/utils/noteFile.ts` returns live `Problem`/`Solution` objects backed
  by a JS `Proxy`: reads hit disk, scalar writes (`title`/`category`/`description`)
  write through to `problem.md` immediately.
- **Fetchers** — `src/fetch/` is a capability-based registry; each `Fetcher` declares
  `canFetch(source)` and `fetchProblem` picks the first entry that claims the source.
  `pdf` shells out to `markitdown`; `luogu` fetches a page and parses its
  `lentille-context` JSON payload (request handling validates every redirect against
  the Luogu host allowlist).
- **Providers** — domain modules under `src/provider/<name>/` own their CLI and maintain
  logic. Importing `src/provider/luogu/index.ts` (side effect) registers `luogu fetch`
  / `luogu submit` on the shared commander instance (`src/utils/program.ts`); the
  `maintain` verb dispatches provider subcommands to
  `provider/<name>/maintain.ts`'s `maintain(Problem)`.
- **Maintain** — `src/maintain/watch.ts` compares `content/` with
  `.mylearn/index/latest.json` (mtime first; a file is re-hashed only when its mtime
  changed) and reports added/changed/removed; `provider/luogu/maintain.ts` parses the
  `### 样例` sections of a note description, compiles a C++ solution with `g++`
  (no shell), runs each sample on stdin, and judges with trailing-whitespace
  normalization (timeout → TLE, nonzero exit → runtime error).

All process invocation uses `execFile`/`spawn` (no shell) and path segments are
sanitized, so web-sourced titles can't escape the `content/` tree.

## Development

```bash
pnpm exec tsc --noEmit          # typecheck (pnpx tsc resolves the wrong package!)
pnpm test                       # node:test via tsx; luogu fetch suites hit the network,
                                # C++ suites are skipped without g++
```

Tests live in `tests/`, following the modules they cover (`fetch.test.ts`,
`maintain.test.ts`).
