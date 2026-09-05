// CLI-level tests — spawn the real entry (`index.ts` via tsx) against a tmp
// project, so the whole stack is exercised: startup config check, verbs
// wired in arg.ts, and the daemon (serve + rebuild + SIGINT). Fully offline;
// no CDN, no browser.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CLI = path.join(repoRoot, "index.ts");
const TSX = path.join(repoRoot, "node_modules", ".bin", "tsx");

function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-cli-test-"));
}

/** minimal initialized project: config + one problem + one note */
function seedProject(root: string): void {
    fs.mkdirSync(path.join(root, ".mylearn"), { recursive: true });
    fs.writeFileSync(path.join(root, ".mylearn", "config.json"), "{}");
    const pdir = path.join(root, "problems", "luogu", "P4001");
    fs.mkdirSync(pdir, { recursive: true });
    fs.writeFileSync(path.join(pdir, "problem.md"), "---\ntitle: P4001\ncategory: luogu\n---\n\n# Sum\n\nBody.\n\n### S1\n\nx\n");
    fs.writeFileSync(path.join(pdir, "sol.cpp"), "#include <bits/stdc++.h>\n");
    fs.mkdirSync(path.join(root, "notes"), { recursive: true });
    fs.writeFileSync(path.join(root, "notes", "trick.md"), "# Trick\n\n$a$.\n");
}

interface CliResult {
    code: number | null;
    stdout: string;
    stderr: string;
}

function runCLI(
    cwd: string,
    args: string[],
    env: Record<string, string> = {}
): Promise<CliResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(TSX, [CLI, ...args], {
            cwd,
            env: { ...process.env, MYLEARN_PROJECT: "", ...env },
        });
        collect(child, resolve, reject);
    });
}

function collect(
    child: ChildProcess,
    resolve: (r: CliResult) => void,
    reject: (e: Error) => void
): void {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d: Buffer) => (stdout += d));
    child.stderr?.on("data", (d: Buffer) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
}

async function waitFor(cond: () => boolean, ms: number, label: string): Promise<void> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if (cond()) return;
        await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(`timeout waiting for: ${label}`);
}

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.on("error", reject);
        srv.listen(0, "127.0.0.1", () => {
            const port = (srv.address() as net.AddressInfo).port;
            srv.close(() => resolve(port));
        });
    });
}

describe("CLI (index.ts)", () => {
    test("exits 1 when there is no .mylearn/config.json", async () => {
        const root = tmpRoot();
        try {
            const { code, stderr } = await runCLI(root, ["build"]);
            assert.equal(code, 1);
            assert.ok(stderr.includes("No config found."));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("build generates the site in the project's CWD", async () => {
        const root = tmpRoot();
        try {
            seedProject(root);
            const { code, stdout } = await runCLI(root, ["build"]);
            assert.equal(code, 0);
            assert.ok(stdout.includes("built 2 page(s) →"));
            const index = fs.readFileSync(path.join(root, "build", "index.html"), "utf-8");
            assert.ok(index.includes("<iframe"));
            assert.ok(index.includes("problems/luogu/P4001/index.html"));
            const page = fs.readFileSync(
                path.join(root, "build", "problems", "luogu", "P4001", "index.html"),
                "utf-8"
            );
            assert.ok(page.includes("<title>P4001 – myLearn</title>"));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("MYLEARN_PROJECT pins the project from another CWD", async () => {
        const root = tmpRoot();
        const elsewhere = tmpRoot();
        try {
            seedProject(root);
            const { code } = await runCLI(elsewhere, ["build"], {
                MYLEARN_PROJECT: root,
            });
            assert.equal(code, 0);
            assert.ok(fs.existsSync(path.join(root, "build", "index.html")));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(elsewhere, { recursive: true, force: true });
        }
    });

    test("maintain watch snapshots, then reports up to date", async () => {
        const root = tmpRoot();
        try {
            seedProject(root);
            const first = await runCLI(root, ["maintain", "watch"]);
            assert.equal(first.code, 0);
            assert.ok(first.stdout.includes("3 file(s) changed.")); // problem.md + sol.cpp + trick.md
            assert.ok(fs.existsSync(path.join(root, ".mylearn", "index", "latest.json")));
            const second = await runCLI(root, ["maintain", "watch"]);
            assert.equal(second.code, 0);
            assert.ok(second.stdout.includes("Everything up to date."));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("init writes the template tree", async () => {
        const root = tmpRoot();
        const target = tmpRoot();
        try {
            seedProject(root);
            const { code, stdout } = await runCLI(root, ["init", target]);
            assert.equal(code, 0);
            assert.ok(stdout.includes("init project at"));
            assert.ok(fs.existsSync(path.join(target, "readme.md")));
            assert.ok(fs.existsSync(path.join(target, "problems", "cato1", "Problem 1", "Problem 1.md")));
            assert.equal(
                fs.readFileSync(path.join(target, ".mylearn", "config.json"), "utf-8"),
                "{}"
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(target, { recursive: true, force: true });
        }
    });

    test(
        "daemon serves the site, rebuilds on change, and stops on SIGINT",
        { timeout: 30_000 },
        async () => {
            const root = tmpRoot();
            try {
                seedProject(root);
                const port = await freePort();
                const child = spawn(TSX, [CLI, "daemon", "--port", String(port)], {
                    cwd: root,
                    env: { ...process.env, MYLEARN_PROJECT: "" },
                });
                const out = { stdout: "", stderr: "" };
                child.stdout.on("data", (d: Buffer) => (out.stdout += d));
                child.stderr.on("data", (d: Buffer) => (out.stderr += d));

                try {
                    await waitFor(() => out.stdout.includes("daemon running"), 10_000, "daemon banner");

                    // serves the shell with the injected reload client
                    const res = await fetch(`http://127.0.0.1:${port}/`);
                    assert.equal(res.status, 200);
                    assert.ok((await res.text()).includes("location.reload()"));

                    // a change under notes/ triggers rebuild + broadcast log
                    fs.writeFileSync(
                        path.join(root, "notes", "trick.md"),
                        "# Trick\n\nupdated body.\n"
                    );
                    await waitFor(() => out.stdout.includes("rebuilt 2 page(s)"), 10_000, "rebuild log");

                    const page = await fetch(`http://127.0.0.1:${port}/notes/trick.html`);
                    assert.ok((await page.text()).includes("updated body."));

                    // SIGINT: handlers close watcher + server → natural exit 0
                    const closed = new Promise<number | null>((resolve) =>
                        child.on("close", resolve)
                    );
                    child.kill("SIGINT");
                    const code = await Promise.race([
                        closed,
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error("daemon did not exit after SIGINT")), 10_000)
                        ),
                    ]);
                    assert.equal(code, 0);
                    assert.ok(out.stdout.includes("daemon stopped."));
                } finally {
                    if (child.exitCode === null) child.kill("SIGKILL");
                }
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    );
});
