// Fetcher contract tests, using the built-in node:test runner via tsx.
// Run: pnpm test            (some cases hit the network: Luogu is fetched live)
// Filter: pnpm test -- --test-name-pattern "canFetch|resolution"  (offline-only runs)
//         pnpm test -- --test-name-pattern "conversion|end to end"  (network cases)

import { describe, test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchProblem, resolveFetcher } from "../src/fetch/index.ts";
import parsePDF from "../src/fetch/pdf.ts";
import fetchLuogu from "../src/fetch/luogu.ts";
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
            assert.ok(parsePDF.canFetch(s), `local file should be claimed: ${s}`);
        }
    });
    test("pdf rejects URLs", () => {
        for (const u of ["https://www.luogu.com.cn/problem/P4001", "http://a.com/b"]) {
            assert.ok(!parsePDF.canFetch(u), `url should not be claimed: ${u}`);
        }
    });
});

describe("resolution", () => {
    test("autodetection follows registry order (luogu first)", () => {
        assert.equal(resolveFetcher("P4001"), fetchLuogu);
        assert.equal(resolveFetcher("https://www.luogu.com.cn/problem/P1"), fetchLuogu);
        assert.equal(resolveFetcher("/tmp/doc.pdf"), parsePDF);
    });
    test("explicit type wins over detection", () => {
        assert.equal(resolveFetcher("P4001", "pdf"), parsePDF);
        assert.equal(resolveFetcher("/tmp/doc.pdf", "luogu"), fetchLuogu);
    });
    test("unknown explicit type is rejected", () => {
        assert.throws(() => resolveFetcher("x", "epub"), /Unsupported type: epub/);
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
        const d = await parsePDF.convert(pdf);
        assert.ok(d.title.length > 0);
        assert.match(d.description, /## Original PDF/);
        assert.deepEqual(d.sourceFiles, [pdf]);
    });
});

describe("end to end", () => {
    test("fetchProblem saves a problem and proxy reads it back", { timeout: 30_000 }, async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-test-"));
        try {
            const p = await fetchProblem(root, "P4001", "graph");
            assert.match(p.title, /^P4001/);
            assert.equal(p.category, "graph");
            assert.deepEqual(p.solutions, []);
            assert.deepEqual(p.sourceFiles, []);
            assert.ok(fs.existsSync(path.join(root, "content", "graph", p.title, "problem.md")));
            // reopen as a fresh proxy — the file-backed view must see the same data
            const again = openProblem(path.join(root, "content", "graph", p.title));
            assert.equal(again.title, p.title);
            assert.equal(again.category, "graph");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
