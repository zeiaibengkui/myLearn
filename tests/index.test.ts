// CLI-level tests — spawn the real entry (`index.ts` via tsx) against a tmp
// project, so the whole stack is exercised: startup config check and the
// verbs wired in arg.ts. Fully offline; no CDN, no browser.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CLI = path.join(repoRoot, "index.ts");
const TSX = path.join(repoRoot, "node_modules", ".bin", "tsx");

const hasGit = (() => {
    try {
        execFileSync("git", ["--version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

function git(cwd: string, args: string[]): void {
    const r = spawnSync("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

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

describe("CLI (index.ts)", () => {
    test("exits 1 when there is no .mylearn/config.json", async () => {
        const root = tmpRoot();
        try {
            const { code, stderr } = await runCLI(root, ["maintain", "watch"]);
            assert.equal(code, 1);
            assert.ok(stderr.includes("No config found."));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("MYLEARN_PROJECT pins the project from another CWD", async () => {
        const root = tmpRoot();
        const elsewhere = tmpRoot();
        try {
            seedProject(root);
            const { code } = await runCLI(elsewhere, ["maintain", "watch"], {
                MYLEARN_PROJECT: root,
            });
            assert.equal(code, 0);
            assert.ok(fs.existsSync(path.join(root, ".mylearn", "index", "latest.json")));
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

    test("init --online clones the site scaffold from a remote KB", { skip: !hasGit }, async () => {
        const root = tmpRoot();
        const target = tmpRoot();
        const remote = tmpRoot();
        try {
            seedProject(root);
            // a stand-in "remote": a configured KB — site files + layout
            fs.mkdirSync(path.join(remote, ".vitepress"), { recursive: true });
            fs.writeFileSync(path.join(remote, ".vitepress", "config.ts"), "// from remote\n");
            fs.writeFileSync(
                path.join(remote, "package.json"),
                '{"name": "kb", "scripts": {"site": "vitepress dev ."}}\n'
            );
            fs.mkdirSync(path.join(remote, "problems"), { recursive: true });
            git(remote, ["init", "-q"]);
            git(remote, ["add", "-A"]);
            git(remote, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "seed"]);

            const { code, stdout } = await runCLI(root, ["init", target, "--online", remote]);
            assert.equal(code, 0);
            assert.ok(stdout.includes("cloned from"));
            assert.equal(
                fs.readFileSync(path.join(target, ".vitepress", "config.ts"), "utf-8"),
                "// from remote\n"
            );
            // the site is runnable in place: build files come along, renamed
            assert.equal(
                JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf-8")).name,
                path.basename(target)
            );
            // the template tree is still written alongside the cloned site,
            // and the remote's own content does not travel
            assert.ok(fs.existsSync(path.join(target, "readme.md")));
            assert.ok(!fs.existsSync(path.join(target, "problems", "luogu")));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(target, { recursive: true, force: true });
            fs.rmSync(remote, { recursive: true, force: true });
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
            // no site without --online: the scaffold lives in a KB, not in the CLI
            assert.ok(!fs.existsSync(path.join(target, ".vitepress")));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(target, { recursive: true, force: true });
        }
    });

});
