// Provider fetcher tests, using the built-in node:test runner via tsx.
// Run: pnpm test            (some cases hit the network: Luogu is fetched live)
// Filter: pnpm test -- --test-name-pattern "canFetch|redirects|offline"  (offline-only runs)
//         pnpm test -- --test-name-pattern "conversion|end to end"  (network cases)

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { importDraft } from "../src/utils/fetcher.ts";
import { problemDir } from "../src/utils/persist.ts";
import fetchPdf from "../src/provider/pdf/fetch.ts";
import fetchLuogu, { absolutizeLuoguLinks } from "../src/provider/luogu/fetch.ts";
import { openProblem } from "../src/utils/noteFile.ts";

describe("canFetch matrix", () => {
    test("luogu claims pid shapes (P4001, CF1234D, AT_abc123, SP1, P1234A)", () => {
        for (const pid of ["P4001", "CF1234D", "AT_abc123", "SP1", "P1234A"]) {
            assert.ok(fetchLuogu.canFetch(pid), `pid should be claimed: ${pid}`);
        }
    });
    test("luogu claims Luogu URLs (https/http, any query)", () => {
        for (const u of [
            "https://www.luogu.com.cn/problem/P4001",
            "http://luogu.com.cn/problem/P1",
            "https://www.luogu.com.cn/problem/P5985?lang=en",
        ]) {
            assert.ok(fetchLuogu.canFetch(u), `url should be claimed: ${u}`);
        }
    });
    test("luogu rejects non-pid / non-URL sources", () => {
        for (const s of ["sample.pdf", "/tmp/doc.pdf", "README", "hello world", "P 4001", "40", "abc"]) {
            assert.ok(!fetchLuogu.canFetch(s), `should not be claimed: ${s}`);
        }
    });
    test("pdf claims local (non-URL) sources", () => {
        for (const s of ["sample.pdf", "/tmp/doc.pdf", "notes.txt", "P4001"]) {
            assert.ok(fetchPdf.canFetch(s), `local file should be claimed: ${s}`);
        }
    });
    test("pdf rejects URLs", () => {
        for (const u of ["https://www.luogu.com.cn/problem/P4001", "http://a.com/b"]) {
            assert.ok(!fetchPdf.canFetch(u), `url should not be claimed: ${u}`);
        }
    });
});

describe("redirects (mocked fetch, no network)", () => {
    // minimal payload matching the shape convert() reads
    const page = (pid: string, name: string) =>
        `<script id="lentille-context" type="application/json">${JSON.stringify({
            data: {
                problem: {
                    pid,
                    name,
                    contenu: { name, description: "desc" },
                    samples: [],
                    difficulty: 0,
                },
            },
        })}</script>`;

    test("rejects a redirect to a foreign host WITHOUT requesting it", async () => {
        let requests = 0;
        const fetchMock = mock.method(globalThis, "fetch", async () => {
            requests++;
            return new Response(null, {
                status: 302,
                headers: { location: "https://evil-luogu.com.cn/x" },
            });
        });
        try {
            await assert.rejects(
                fetchLuogu.convert("https://www.luogu.com.cn/problem/P4001"),
                /redirected to a non-Luogu host/
            );
            assert.equal(requests, 1, "the foreign host must never be requested");
        } finally {
            fetchMock.mock.restore();
        }
    });

    test("follows same-host redirects and converts", async () => {
        let requests = 0;
        const fetchMock = mock.method(globalThis, "fetch", async () => {
            requests++;
            if (requests === 1) {
                return new Response(null, {
                    status: 302,
                    headers: { location: "https://www.luogu.com.cn/problem/P4001?x=1" },
                });
            }
            return new Response(page("P4001", "Redirected"), {
                status: 200,
                headers: { "content-type": "text/html" },
            });
        });
        try {
            const d = await fetchLuogu.convert("https://www.luogu.com.cn/problem/P4001");
            assert.equal(d.title, "P4001 Redirected");
            assert.equal(requests, 2);
        } finally {
            fetchMock.mock.restore();
        }
    });
});

describe("conversion (live network)", () => {
    test("luogu converts a pid to a draft", { timeout: 30_000 }, async () => {
        const d = await fetchLuogu.convert("P4001");
        assert.match(d.title, /^P4001/);
        assert.match(d.description, /## 题目描述/);
        assert.match(d.description, /## 样例/);
        assert.deepEqual(d.sourceFiles, []);
    });
    test("luogu converts a full URL", { timeout: 30_000 }, async () => {
        const d = await fetchLuogu.convert("https://www.luogu.com.cn/problem/P5985");
        assert.match(d.title, /^P5985/);
    });
    test("luogu rejects foreign and lookalike hosts", async () => {
        await assert.rejects(fetchLuogu.convert("https://example.com/p"), /Not a Luogu URL/);
        // label-boundary: evil-luogu.com.cn is a *suffix* but not luogu.com.cn itself
        await assert.rejects(fetchLuogu.convert("https://evil-luogu.com.cn/p"), /Not a Luogu URL/);
        await assert.rejects(fetchLuogu.convert("https://luogu.com.cn.evil.com/p"), /Not a Luogu URL/);
        // trailing-dot FQDN form of the real host is still fine
        assert.ok(fetchLuogu.canFetch("https://www.luogu.com.cn./problem/P1"));
    });
    test("luogu rejects pages with no problem data", { timeout: 30_000 }, async () => {
        await assert.rejects(
            fetchLuogu.convert("https://www.luogu.com.cn/"),
            /No lentille-context|No problem data/
        );
    });
    test("pdf converts a real PDF", async () => {
        const pdf = "/usr/share/cups/data/default-testpage.pdf";
        assert.ok(fs.existsSync(pdf), "fixture PDF missing");
        const d = await fetchPdf.convert(pdf);
        assert.ok(d.title.length > 0);
        assert.match(d.description, /## Original PDF/);
        assert.deepEqual(d.sourceFiles, [pdf]);
    });
});

describe("statement link rewriting (offline)", () => {
    test("root-relative links and hrefs become absolute Luogu URLs", () => {
        assert.equal(
            absolutizeLuoguLinks("见 [P3049](/problem/P3049)。"),
            "见 [P3049](https://www.luogu.com.cn/problem/P3049)。"
        );
        assert.equal(
            absolutizeLuoguLinks('见 <a href="/problem/P3049">题</a>。'),
            '见 <a href="https://www.luogu.com.cn/problem/P3049">题</a>。'
        );
        // already absolute — untouched
        assert.equal(
            absolutizeLuoguLinks("[P1](https://www.luogu.com.cn/problem/P1)"),
            "[P1](https://www.luogu.com.cn/problem/P1)"
        );
        // a leading slash deeper than /problem/ is still Luogu's own path
        assert.equal(
            absolutizeLuoguLinks("![](/images/x.png)"),
            "![](https://www.luogu.com.cn/images/x.png)"
        );
    });

    test("fenced code blocks are left alone", () => {
        const md = ["```text", "](/problem/P3049)", "```", "](/problem/P3049)"].join("\n");
        assert.equal(
            absolutizeLuoguLinks(md),
            ["```text", "](/problem/P3049)", "```", "](https://www.luogu.com.cn/problem/P3049)"].join("\n")
        );
    });
});

describe("note dirs (offline)", () => {
    const title = "P2748 [USACO16OPEN] Landscaping P";

    test("word-only bracket groups are dropped from the dir, kept in the title", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-test-"));
        try {
            const dir = problemDir(root, "luogu", title);
            assert.equal(dir, path.join(root, "problems", "luogu", "P2748 USACO16OPEN Landscaping P"));
            const p = importDraft(root, "luogu", { title, description: "body", sourceFiles: [] });
            // the proxy reads problem.md — the on-disk name changed, the title did not
            assert.equal(p.title, title);
            assert.equal(p.category, "luogu");
            assert.deepEqual(fs.readdirSync(path.join(root, "problems", "luogu")), [
                "P2748 USACO16OPEN Landscaping P",
            ]);
            // write and lookup agree: the same title maps back to the same dir
            assert.equal(problemDir(root, "luogu", p.title), dir);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("groups with spaces survive — VitePress only treats [word] as a route param", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-test-"));
        try {
            const spaced = "P3049 [PA 2019] Flux";
            assert.equal(
                problemDir(root, "luogu", spaced),
                path.join(root, "problems", "luogu", spaced)
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("end to end", () => {
    test("a converted draft saves a problem and the proxy reads it back", { timeout: 30_000 }, async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-test-"));
        try {
            const draft = await fetchLuogu.convert("P4001");
            const p = importDraft(root, "graph", draft);
            assert.match(p.title, /^P4001/);
            assert.equal(p.category, "graph");
            assert.deepEqual(p.solutions, []);
            assert.deepEqual(p.sourceFiles, []);
            assert.ok(fs.existsSync(path.join(root, "problems", "graph", p.title, "problem.md")));
            // reopen as a fresh proxy — the file-backed view must see the same data
            const again = openProblem(path.join(root, "problems", "graph", p.title));
            assert.equal(again.title, p.title);
            assert.equal(again.category, "graph");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
