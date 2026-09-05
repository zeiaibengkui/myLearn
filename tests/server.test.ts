// Live server tests — fully offline: a tmp project is built, then served via
// buildServer() on an ephemeral port. Asserts static file serving (shell,
// note pages, .cpp sources, directory → index.html), path-traversal
// rejection, and the SSE reload broadcast.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSite } from "../src/build/index.ts";
import { buildServer, RELOAD_PATH, type LiveServer } from "../src/build/server.ts";

function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-server-test-"));
}

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
    // useFrontend: false → the h.ts fallback shell (deterministic; the
    // SPA-index.html path is covered by tests/frontend.test.ts)
    const report = await buildSite(root, { useFrontend: false });
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
    test("serves the shell with an injected live-reload client", async () => {
        const { base, stop } = await startServer();
        try {
            const res = await fetch(`${base}/`);
            assert.equal(res.status, 200);
            const html = await res.text();
            assert.ok(html.includes("bootstrap@5.3.3"));
            assert.ok(html.includes("<iframe"));
            // reload client: SSE endpoint + reload, injected before </body>
            assert.ok(html.includes(`new EventSource("${RELOAD_PATH}")`));
            assert.ok(html.includes("location.reload()"));
            assert.ok(html.indexOf(RELOAD_PATH) < html.lastIndexOf("</body>"));
        } finally {
            await stop();
        }
    });

    test("serves note pages, sources, and directory index fallback", async () => {
        const { base, stop } = await startServer();
        try {
            const page = await fetch(`${base}/problems/luogu/P4001/index.html`);
            assert.equal(page.status, 200);
            assert.ok((await page.text()).includes("<title>P4001 – myLearn</title>"));

            // directory → index.html
            const dir = await fetch(`${base}/problems/luogu/P4001/`);
            assert.equal(dir.status, 200);

            // copied .cpp source
            const cpp = await fetch(`${base}/problems/luogu/P4001/sol.cpp`);
            assert.equal(cpp.status, 200);
            assert.equal(await cpp.text(), "#include <bits/stdc++.h>\n");
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
