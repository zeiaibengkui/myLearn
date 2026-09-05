// Site build tests — fully offline, no CDN or browser access. Asserts on the
// generated data contract the Vue SPA consumes: build/notes.json (route path
// → pre-rendered note body: katex server-side math, bootstrap classes, TOC,
// escaped raw HTML, hash-route rewrites), build/tree.json (route-path hrefs,
// no .html suffixes), copied sources — and the absence of per-note HTML pages
// (the SPA is the only page; data-only via useFrontend: false).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSite, type NoteEntry } from "../src/build/index.ts";
import { linkify } from "../src/build/markdown.ts";

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
            "",
            "[solution](<P4001 题解.html>)",
        ].join("\n")
    );
    fs.writeFileSync(path.join(pdir, "P4001 题解.md"), "---\ntitle: P4001 题解\n---\n\nO(1).\n");
    fs.writeFileSync(path.join(pdir, "sol.cpp"), "#include <bits/stdc++.h>\n");
    fs.mkdirSync(path.join(root, "notes", "algos"), { recursive: true });
    fs.writeFileSync(path.join(root, "notes", "algos", "trick.md"), "# Trick\n\n$a+b$.\n");
}

function readEntry(root: string, key: string): NoteEntry {
    return JSON.parse(
        fs.readFileSync(path.join(root, "build", "notes.json"), "utf-8")
    )[key];
}

describe("linkify", () => {
    test("rewrites #-anchors to the current route and leaves route links alone", () => {
        const out = linkify(
            '<a href="#样例-1">a</a><a href="#/problems/x">r</a><a href="https://x">e</a>',
            "problems/luogu/P4001"
        );
        assert.ok(out.includes('href="#/problems/luogu/P4001#样例-1"'));
        assert.ok(out.includes('href="#/problems/x"'));
        assert.ok(out.includes('href="https://x"'));
    });
    test("rewrites relative .md/.html links into route links", () => {
        const out = linkify('<a href="P4001 题解.html">s</a>', "problems/luogu/P4001");
        assert.ok(out.includes('href="#/problems/luogu/P4001/P4001%20%E9%A2%98%E8%A7%A3"'));
    });
    test("handles markdown-it encoded destinations (spaces as %20)", () => {
        const out = linkify('<a href="P4001%20%E9%A2%98%E8%A7%A3.html">s</a>', "problems/luogu/P4001");
        assert.ok(out.includes('href="#/problems/luogu/P4001/P4001%20%E9%A2%98%E8%A7%A3"'));
    });
});

describe("build", () => {
    test("builds notes.json + tree.json + sources (no html pages)", async () => {
        const root = tmpRoot();
        try {
            seedProject(root);
            // useFrontend: false → data files only; the SPA path is covered by
            // tests/frontend.test.ts
            const report = await buildSite(root, { useFrontend: false });
            assert.ok(report.dir.endsWith(path.join("build")));
            assert.equal(report.notes, 3); // P4001 + solution + trick note

            // no per-note HTML anywhere (and no shell page without frontend)
            assert.ok(!fs.existsSync(path.join(root, "build", "index.html")));
            assert.ok(!fs.existsSync(path.join(root, "build", "problems", "luogu", "P4001", "index.html")));
            assert.ok(!fs.existsSync(path.join(root, "build", "problems", "luogu", "P4001", "P4001 题解.html")));
            assert.ok(!fs.existsSync(path.join(root, "build", "notes", "algos", "trick.html")));

            // problem entry: escaping, katex, bootstrap classes, TOC, anchors
            const entry = readEntry(root, "problems/luogu/P4001");
            assert.equal(entry.title, "P4001");
            assert.ok(entry.html.includes("He said &quot;hi&quot;"));
            assert.ok(entry.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
            assert.ok(entry.html.includes('class="katex"'));
            assert.ok(entry.html.includes('class="table table-striped"'));
            assert.ok(entry.html.includes("img-fluid"));
            assert.ok(entry.html.includes('src="diagram.png"'));
            assert.ok(entry.html.includes('class="blockquote"'));

            // TOC: auto-injected (note has ≥2 headings), links rewritten to the
            // route + fragment; heading ids keep CJK + header permalinks
            assert.ok(entry.html.includes('class="markdownIt-TOC"'));
            const tocLink = 'href="#/problems/luogu/P4001#样例-1"';
            assert.ok(entry.html.includes(tocLink), "toc link rewritten");
            assert.ok(entry.html.includes('id="样例-1"'));
            assert.ok(entry.html.includes('class="header-anchor"'));

            // solutions section + authored .html link both map to the route
            const solHref = 'href="#/problems/luogu/P4001/P4001%20%E9%A2%98%E8%A7%A3"';
            assert.equal(entry.html.split(solHref).length - 1, 2, "solutions + authored link");
            assert.ok(entry.html.includes("P4001 题解"));

            // solution entry, keyed by route path
            const sol = readEntry(root, "problems/luogu/P4001/P4001 题解");
            assert.equal(sol.title, "P4001 题解");
            assert.ok(sol.html.includes("O(1)."));

            // freeform note entry, title from the # heading
            const trick = readEntry(root, "notes/algos/trick");
            assert.equal(trick.title, "Trick");
            assert.ok(trick.html.includes('class="katex"'));

            // tree.json — route-path hrefs, no .html/index
            const treeJson = JSON.parse(
                fs.readFileSync(path.join(root, "build", "tree.json"), "utf-8")
            );
            assert.equal(treeJson[0].title, "problems");
            const luogu = treeJson[0].children.find((c: { title: string }) => c.title === "luogu");
            assert.equal(luogu.children[0].title, "P4001");
            assert.equal(luogu.children[0].href, "problems/luogu/P4001");
            const notes = treeJson.find((n: { title: string }) => n.title === "notes");
            assert.ok(notes.href === undefined, "root is a folder");
            assert.equal(notes.children[0].children[0].href, "notes/algos/trick");

            // copied source next to the note
            assert.equal(
                fs.readFileSync(path.join(root, "build", "problems", "luogu", "P4001", "sol.cpp"), "utf-8"),
                "#include <bits/stdc++.h>\n"
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("rebuild removes stale entries", async () => {
        const root = tmpRoot();
        try {
            seedProject(root);
            await buildSite(root, { useFrontend: false });
            fs.rmSync(path.join(root, "problems", "luogu", "P4001"), { recursive: true });
            const report = await buildSite(root, { useFrontend: false });
            assert.equal(report.notes, 1);
            const entries = JSON.parse(
                fs.readFileSync(path.join(root, "build", "notes.json"), "utf-8")
            );
            assert.deepEqual(Object.keys(entries), ["notes/algos/trick"]);
            assert.ok(!fs.existsSync(path.join(root, "build", "problems", "luogu", "P4001")));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("empty project writes empty data files", async () => {
        const root = tmpRoot();
        try {
            const report = await buildSite(root, { useFrontend: false });
            assert.equal(report.notes, 0);
            assert.deepEqual(
                JSON.parse(fs.readFileSync(path.join(root, "build", "notes.json"), "utf-8")),
                {}
            );
            assert.deepEqual(
                JSON.parse(fs.readFileSync(path.join(root, "build", "tree.json"), "utf-8")),
                []
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
