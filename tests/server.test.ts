// Live server tests — fully offline: a tmp project is built (with the real
// SPA built once into a shared isolated outDir, so build/ has a shell
// index.html), then served via buildServer() on an ephemeral port. Asserts
// static file serving (SPA shell, notes.json/tree.json data files, .cpp
// sources, 404 for the removed per-note HTML pages), path-traversal
// rejection, and the SSE reload broadcast.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSite } from "../src/build/index.ts";
import { buildServer, RELOAD_PATH, type LiveServer } from "../src/build/server.ts";
import { buildFrontend, frontendDir } from "../src/build/frontend.ts";

function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-server-test-"));
}

// one SPA build shared by every server test (the data builds copy it)
const feOut = path.join(tmpRoot(), "dist");
await buildFrontend(frontendDir(), feOut);

function seedProject(root: string): void {
    const pdir = path.join(root, "problems", "luogu", "P4001");
    fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(path.join(pdir, "problem.md"), [
        "---",
        "title: P4001",
        "category: luogu",
        "---",
        "",
        "# Sum",
        "",
        "Body.",
        "",
        "### S1",
        "",
        "x",
        "",
        "### S2",
        "",
        "y",
    ].join("\n"));
    fs.writeFileSync(path.join(pdir, "sol.cpp"), "#include <bits/stdc++.h>\n");
    fs.mkdirSync(path.join(root, "notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "notes", "trick.md"), "# Trick\n\n$a$.\n");
}

/** start a server for a seeded + built project, return {live, base, close} */
async function startServer(): Promise<{ live: LiveServer; base: string; stop: () => void }> {
    const root = tmpRoot();
    seedProject(root);
    const report = await buildSite(root, { feOutDir: feOut });
    const live = buildServer(report.dir);
    await new Promise<void>(resolve =>
        live.server.listen(0, "127.0.0.1", resolve)
    );
    const addr = live.server.address();
    assert.ok(addr && typeof addr === "object");
    return {
        live,
        base: `http://127.0.0.1:${addr.port}`,
        stop: async () => {
            live.close();
            fs.rmSync(root, { recursive: true, force: true });
        },
    };
}

describe("buildServer", () => {
    test("serves the SPA shell with an injected live-reload client", async () => {
        const { base, stop } = await startServer();
        try {
            const res = await fetch(`${base}/`);
            assert.equal(res.status, 200);
            const html = await res.text();
            assert.ok(html.includes('<div id="app">'));
            // reload client: SSE endpoint + reload, injected before </body>
            assert.ok(html.includes(`new EventSource("${RELOAD_PATH}")`));
            assert.ok(html.includes("location.reload()"));
            assert.ok(html.indexOf(RELOAD_PATH) < html.lastIndexOf("</body>"));
        } finally {
            await stop();
        }
    });

    test("serves data files, sources — no per-note html pages", async () => {
        const { base, stop } = await startServer();
        try {
            const notes = await fetch(`${base}/notes.json`);
            assert.equal(notes.status, 200);
            const entries = JSON.parse(await notes.text());
            assert.ok(entries["problems/luogu/P4001"].html.includes("Body."));

            const tree = await fetch(`${base}/tree.json`);
            assert.equal(tree.status, 200);
            assert.ok((await tree.text()).includes("problems/luogu/P4001"));

            // copied .cpp source
            const cpp = await fetch(`${base}/problems/luogu/P4001/sol.cpp`);
            assert.equal(cpp.status, 200);
            assert.equal(await cpp.text(), "#include <bits/stdc++.h>\n");

            // per-note html pages no longer exist — 404 (SPA only)
            const page = await fetch(`${base}/problems/luogu/P4001/index.html`);
            assert.equal(page.status, 404);
            const note = await fetch(`${base}/notes/trick.html`);
            assert.equal(note.status, 404);
        } finally {
            await stop();
        }
    });

    test("rejects traversal and missing paths", async () => {
        const { base, stop } = await startServer();
        try {
            const traversal = await fetch(`${base}/..%2F..%2Fpackage.json`);
            assert.equal(traversal.status, 404);
            const missing = await fetch(`${base}/nope.html`);
            assert.equal(missing.status, 404);
            const post = await fetch(`${base}/`, { method: "POST" });
            assert.equal(post.status, 405);
        } finally {
            await stop();
        }
    });

    test("broadcast() sends a reload event over SSE", async () => {
        const { live, base, stop } = await startServer();
        try {
            const ac = new AbortController();
            const res = await fetch(`${base}${RELOAD_PATH}`, { signal: ac.signal });
            assert.equal(res.status, 200);
            assert.ok(res.headers.get("content-type")?.startsWith("text/event-stream"));
            const reader = res.body!.getReader();
            const decode = (chunk: Uint8Array) => new TextDecoder().decode(chunk);
            assert.match(decode((await reader.read()).value ?? new Uint8Array()), /: connected/);
            live.broadcast();
            assert.match(decode((await reader.read()).value ?? new Uint8Array()), /data: reload/);
            ac.abort();
        } finally {
            await stop();
        }
    });
});
