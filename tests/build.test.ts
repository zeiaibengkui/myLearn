// Static site generator tests — fully offline, no CDN or browser access.
// Asserts on the generated HTML string: SEO head (title/description meta,
// escaping), CDN links (bootstrap/katex/jquery), the iframe shell, katex
// server-side math, solution pages + copied sources, and rebuild cleanup.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSite, seoDescription } from "../src/build/index.ts";

function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-build-test-"));
}

/** sample project: one problem (math + sample + solution + source), one note */
function seedProject(root: string): void {
    const pdir = path.join(root, "problems", "luogu", "P4001");
    fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(
        path.join(pdir, "problem.md"),
        [
            "---",
            "title: P4001",
            "category: luogu",
            "---",
            "",
            "Sum of $x$ from 1 to $n$ equals $\\frac{n(n+1)}{2}$ — He said \"hi\", raw <script>alert(1)</script> html.",
            "",
            "### 样例 1",
            "",
            "**输入**",
            "",
            "```text",
            "5",
            "```",
            "",
            "### 样例 2",
            "",
            "| a | b |",
            "| --- | --- |",
            "| 1 | 2 |",
            "",
            "> quoted",
            "",
            "![diagram](diagram.png)",
        ].join("\n")
    );
    fs.writeFileSync(path.join(pdir, "P4001 题解.md"), "---\ntitle: P4001 题解\n---\n\nO(1).\n");
    fs.writeFileSync(path.join(pdir, "sol.cpp"), "#include <bits/stdc++.h>\n");
    fs.mkdirSync(path.join(root, "notes", "algos"), { recursive: true });
    fs.writeFileSync(path.join(root, "notes", "algos", "trick.md"), "# Trick\n\n$a+b$.\n");
}

describe("seoDescription", () => {
    test("drops math and markdown syntax, collapses whitespace", () => {
        assert.equal(
            seoDescription("A $x$ and $$y$$ here. *em* [link](http://x) **b** `code`"),
            "A and here. em link b code"
        );
    });
    test("truncates to ~160 chars", () => {
        const long = "word ".repeat(60);
        const out = seoDescription(long);
        assert.ok(out.length <= 160);
        assert.ok(out.endsWith("..."));
    });
});

describe("build", () => {
    test("builds a complete site shell + pages", async () => {
        const root = tmpRoot();
        try {
            seedProject(root);
            // useFrontend: false → the deterministic h.ts fallback shell
            // (the SPA path is covered by tests/frontend.test.ts)
            const report = await buildSite(root, { useFrontend: false });
            assert.ok(report.dir.endsWith(path.join("build")));
            assert.equal(report.pages, 3); // P4001 page + solution page + trick note

            // shell: bootstrap + jquery CDN, iframe, nav hrefs
            const index = fs.readFileSync(path.join(root, "build", "index.html"), "utf-8");
            assert.ok(index.includes("bootstrap@5.3.3"));
            assert.ok(index.includes("bootstrap.bundle.min.js"));
            assert.ok(index.includes("code.jquery.com/jquery-3.7.1"));
            assert.ok(index.includes("<iframe"));
            assert.ok(index.includes('href="problems/luogu/P4001/index.html"'));
            assert.ok(index.includes('href="notes/algos/trick.html"'));

            // explorer shell: folder tree (bootstrap collapse) + breadcrumb
            assert.ok(index.includes('id="tree"'));
            assert.ok(index.includes('id="t0"'));
            assert.ok(index.includes('data-bs-toggle="collapse"'));
            assert.ok(index.includes('problems</button>'));
            assert.ok(index.includes('id="crumbs"'));
            assert.ok(index.includes("breadcrumb-item"));

            // dark mode: toggle, persistence, iframe CSS+JS injection
            assert.ok(index.includes('id="themeToggle"'));
            assert.ok(index.includes("data-bs-theme"));
            assert.ok(index.includes("mylearn-theme-css"));
            assert.ok(index.includes("postMessage"));
            assert.ok(index.includes("mylearn-theme"));

            // bootstrap icons: glyph font + brand/toggle/tree glyphs
            assert.ok(index.includes("bootstrap-icons@1.11.3"));
            assert.ok(index.includes('class="bi bi-book'));
            assert.ok(index.includes('bi bi-moon-stars'));
            assert.ok(index.includes("bi-chevron-down"));
            assert.ok(index.includes("bi-chevron-right"));
            assert.ok(index.includes("bi-folder2"));

            // problem page: SEO head + katex + escaped html + solution link
            const page = fs.readFileSync(
                path.join(root, "build", "problems", "luogu", "P4001", "index.html"),
                "utf-8"
            );
            assert.ok(page.includes("<title>P4001 – myLearn</title>"));
            assert.ok(page.includes('name="description" content="Sum of from 1 to equals'));
            assert.ok(page.includes("He said &quot;hi&quot;"));
            assert.ok(page.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
            assert.ok(page.includes("katex@0.6.0/dist/katex.min.css"));
            assert.ok(page.includes('class="katex"'));
            assert.ok(page.includes('href="P4001%20%E9%A2%98%E8%A7%A3.html"'));
            assert.ok(page.includes("P4001 题解"));

            // markdown-it-class: bootstrap classes on table/img/blockquote
            assert.ok(page.includes('class="table table-striped"'));
            assert.ok(page.includes("img-fluid"));
            assert.ok(page.includes('class="blockquote"'));

            // TOC: auto-injected (note has ≥2 headings), nested <ul>s
            assert.ok(page.includes('class="markdownIt-TOC"'));
            assert.ok(page.includes('href="#样例-1"'));
            // headings: ids keep CJK + GitHub-style # permalinks
            assert.ok(page.includes('id="样例-1"'));
            assert.ok(page.includes('class="header-anchor"'));
            assert.ok(page.includes('aria-hidden="true"'));

            // tree.json — the tree contract the Vue shell fetches (same
            // structure the fallback shell renders, both modes write it)
            const treeJson = JSON.parse(
                fs.readFileSync(path.join(root, "build", "tree.json"), "utf-8")
            );
            assert.equal(treeJson[0].title, "problems");
            const luogu = treeJson[0].children.find((c: { title: string }) => c.title === "luogu");
            assert.equal(luogu.children[0].title, "P4001");
            assert.ok(luogu.children[0].href.endsWith("index.html"));
            assert.ok(treeJson.some((n: { title: string }) => n.title === "notes"));

            // solution page + copied source
            assert.ok(
                fs.existsSync(path.join(root, "build", "problems", "luogu", "P4001", "P4001 题解.html"))
            );
            assert.equal(
                fs.readFileSync(path.join(root, "build", "problems", "luogu", "P4001", "sol.cpp"), "utf-8"),
                "#include <bits/stdc++.h>\n"
            );

            // freeform note page, title from the # heading
            const note = fs.readFileSync(path.join(root, "build", "notes", "algos", "trick.html"), "utf-8");
            assert.ok(note.includes("<h1 class=\"h3 mb-0\">Trick</h1>"));
            assert.ok(note.includes('class="katex"'));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("rebuild removes stale pages", async () => {
        const root = tmpRoot();
        try {
            seedProject(root);
            await buildSite(root, { useFrontend: false });
            fs.rmSync(path.join(root, "problems", "luogu", "P4001"), { recursive: true });
            const report = await buildSite(root, { useFrontend: false });
            assert.equal(report.pages, 1);
            assert.ok(!fs.existsSync(path.join(root, "build", "problems", "luogu", "P4001")));
            const index = fs.readFileSync(path.join(root, "build", "index.html"), "utf-8");
            assert.ok(!index.includes("P4001"));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("empty project still builds a shell, 0 pages", async () => {
        const root = tmpRoot();
        try {
            const report = await buildSite(root, { useFrontend: false });
            assert.equal(report.pages, 0);
            assert.ok(fs.existsSync(path.join(root, "build", "index.html")));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
