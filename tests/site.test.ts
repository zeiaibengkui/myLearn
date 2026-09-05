// Site tests: the VitePress scaffold — buildSidebar walker, scaffoldSite
// (idempotence, --pages, dependency hint) — plus a REAL `vitepress build`
// against a fixture project created inside the repo root (so node resolution
// reaches the repo's node_modules; external projects need their own
// `pnpm add`). Offline: no CDN, no browser.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { buildSidebar } from "../src/site/templates/sidebar.ts";
import { scaffoldSite, vitepressReachable } from "../src/site/setup.ts";
import { vitepressBin } from "../src/site/index.ts";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function tmpRoot(prefix = "mylearn-site-test-"): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function mk(file: string, content: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

describe("buildSidebar", () => {
    test("walks problems/ + notes/ into a nested sidebar", () => {
        const root = tmpRoot();
        try {
            mk(
                path.join(root, "problems", "luogu", "P4001", "problem.md"),
                "---\ntitle: P4001\ncategory: luogu\n---\n\n# Sum\n\nBody.\n"
            );
            mk(path.join(root, "problems", "luogu", "P4001", "sol.md"), "# Sol\n");
            mk(path.join(root, "problems", "atcoder", "Arc101", "Arc101.md"), "# Arc101\n");
            mk(path.join(root, "problems", "atcoder", "readme.md"), "cat readme\n");
            mk(path.join(root, "notes", "algos", "trick.md"), "# Trick\n");
            mk(path.join(root, "notes", "algos", "flow.md"), "# Flow\n");
            mk(path.join(root, "notes", "algos", "index.md"), "# Algos\n");

            const sidebar = buildSidebar(root);

            // one combined tree on "/": problems (categories) then notes —
            // a single key means BOTH sections show up on every route
            const items = sidebar["/"];
            assert.deepEqual(
                items.slice(0, 2).map((i) => i.text),
                ["atcoder", "luogu"]
            );
            const [arc, luogu] = items;
            assert.equal(arc.items?.[0].text, "Arc101"); // no frontmatter → dir name
            assert.equal(arc.items?.[0].link, "/problems/atcoder/Arc101/Arc101");
            assert.equal(luogu.items?.[0].text, "P4001"); // frontmatter title
            assert.equal(luogu.items?.[0].link, "/problems/luogu/P4001/");
            // solution pages are children of the problem leaf
            assert.equal(luogu.items?.[0].items?.[0].link, "/problems/luogu/P4001/sol");
            // category readme is not a problem note
            assert.ok(!luogu.items?.some((i) => i.text === "readme"));

            // notes: nested freeform tree; index.md collapses to its dir
            const algos = items.find((i) => i.text === "algos");
            assert.ok(algos?.items, "algos has children");
            const links = algos!.items!.map((i) => i.link);
            assert.ok(links.includes("/notes/algos/trick"));
            assert.ok(links.includes("/notes/algos/flow"));
            assert.ok(links.includes("/notes/algos/"));
            assert.equal(algos!.items!.find((i) => i.link === "/notes/algos/")?.text, "algos");

            // both sections are top-level siblings
            assert.ok(items.some((i) => i.text === "luogu"));
            assert.ok(items.some((i) => i.text === "algos"));

            // no problems/ dir → no items at all (Notes-only KBs still list notes)
            const bare = tmpRoot();
            try {
                const s = buildSidebar(bare);
                assert.deepEqual(s["/"], []);
            } finally {
                fs.rmSync(bare, { recursive: true, force: true });
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("scaffoldSite", () => {
    test("writes .vitepress/, keeps existing files, --force overwrites", () => {
        const root = tmpRoot();
        try {
            scaffoldSite(root);
            for (const rel of [
                ".vitepress/config.ts",
                ".vitepress/sidebar.ts",
                ".vitepress/theme/index.ts",
                ".vitepress/theme/Breadcrumb.vue",
                ".vitepress/theme/style.css",
            ]) {
                assert.ok(fs.existsSync(path.join(root, rel)), rel);
            }
            // the repo-only shim is not copied
            assert.ok(!fs.existsSync(path.join(root, ".vitepress", "shims-vue.d.ts")));

            // idempotent: existing files are kept
            fs.writeFileSync(path.join(root, ".vitepress", "config.ts"), "// custom\n");
            scaffoldSite(root);
            assert.ok(fs.readFileSync(path.join(root, ".vitepress", "config.ts"), "utf-8").startsWith("// custom"));
            scaffoldSite(root, { force: true });
            assert.ok(
                fs.readFileSync(path.join(root, ".vitepress", "config.ts"), "utf-8").includes("defineConfig")
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("--pages adds package.json + the GitHub Pages workflow", () => {
        const root = tmpRoot();
        try {
            scaffoldSite(root, { pages: true });
            const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
            assert.equal(pkg.name, path.basename(root));
            // vitepress is ESM-only — a CJS package.json breaks config loading
            assert.equal(pkg.type, "module");
            assert.ok(pkg.devDependencies.vitepress);
            assert.ok(pkg.packageManager?.startsWith("pnpm@"), "pnpm pinned for action-setup");
            // pnpm 11 blocks build scripts; esbuild's postinstall is required
            const ws = fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf-8");
            assert.ok(ws.includes("allowBuilds"));
            assert.ok(ws.includes("esbuild"));
            assert.ok(fs.existsSync(path.join(root, ".github", "workflows", "site-pages.yml")));

            const wf = fs.readFileSync(path.join(root, ".github", "workflows", "site-pages.yml"), "utf-8");
            assert.ok(wf.includes("deploy-pages"));
            assert.ok(wf.includes("MYLEARN_BASE"));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("vitepressReachable: no (external tmp) / yes (repo checkout)", () => {
        const root = tmpRoot();
        try {
            assert.equal(vitepressReachable(root), false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
        assert.equal(vitepressReachable(repoRoot), true);
    });
});

describe("vitepress build (e2e)", () => {
    test(
        "renders the KB in place: home, problem page with math, solution page, no .mylearn",
        { timeout: 180_000 },
        async () => {
            // fixture INSIDE the repo so config deps resolve upward
            const root = fs.mkdtempSync(path.join(repoRoot, ".site-e2e-"));
            try {
                fs.mkdirSync(path.join(root, ".mylearn", "index"), { recursive: true });
                fs.writeFileSync(path.join(root, ".mylearn", "config.json"), "{}");
                fs.writeFileSync(path.join(root, ".mylearn", "index", "latest.json"), "{}");
                fs.writeFileSync(path.join(root, "readme.md"), "# myLearn new project\n\nHome body.\n");
                mk(
                    path.join(root, "problems", "luogu", "P4001", "problem.md"),
                    "---\ntitle: P4001\ncategory: luogu\n---\n\n# Sum\n\nInline $a_n = n^2$ and block $$E = mc^2$$.\n\n### 样例\n\n```text\n1\n```\n"
                );
                mk(path.join(root, "problems", "luogu", "P4001", "sol.md"), "# Sol\n\nbody\n");
                mk(
                    path.join(root, "problems", "luogu", "P4001", "sol.cpp"),
                    "#include <bits/stdc++.h>\nint main(){}\n"
                );
                mk(path.join(root, "notes", "trick.md"), "# Trick\n\n$a_i$.\n");

                // pages:true — the scaffolded package.json (type: module) is
                // part of the contract; a CJS one breaks config loading
                scaffoldSite(root, { pages: true });
                const code = await build(root);
                assert.equal(code, 0, "vitepress build succeeded");

                const dist = path.join(root, ".vitepress", "dist");
                const base = "/e2e/"; // MYLEARN_BASE was set to a repo-style base

                // home = readme.md rewritten to index, assets base-prefixed
                const home = fs.readFileSync(path.join(dist, "index.html"), "utf-8");
                assert.ok(home.includes("myLearn new project"));
                assert.ok(home.includes(`${base}assets/`));
                assert.ok(!fs.existsSync(path.join(dist, ".mylearn")));

                // problem page: content + math + sidebar link + breadcrumb
                const page = fs.readFileSync(
                    path.join(dist, "problems", "luogu", "P4001", "index.html"),
                    "utf-8"
                );
                assert.ok(page.includes("Sum"));
                assert.ok(page.includes(`${base}problems/luogu/P4001/`));
                assert.ok(/\bmj[x]?-|katex|svg/.test(page), "math rendered");

                // solution page exists (cleanUrls → dir/index.html)
                const sol = path.join(dist, "problems", "luogu", "P4001", "sol");
                assert.ok(
                    fs.existsSync(path.join(sol, "index.html")) ||
                        fs.existsSync(`${sol}.html`),
                    "solution page built"
                );

                // non-markdown sources are mirrored into the output (buildEnd hook)
                assert.ok(
                    fs.existsSync(path.join(dist, "problems", "luogu", "P4001", "sol.cpp")),
                    "source file copied to dist"
                );
                assert.ok(!fs.existsSync(path.join(dist, "problems", "luogu", "P4001", "sol.md")));
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    );
});

/** run `vitepress build .` in root (upstream stdio swallowed; stderr logged on failure) */
function build(root: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [vitepressBin(), "build", "."], {
            cwd: root,
            env: { ...process.env, MYLEARN_BASE: "/e2e/" },
            stdio: ["ignore", "ignore", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (d: Buffer) => (stderr += d));
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) console.error(stderr);
            resolve(code ?? 1);
        });
    });
}
