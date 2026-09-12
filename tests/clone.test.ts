// cloneSite tests — `init --online` takes the site scaffold from a remote
// knowledge base instead of shipping one in this repo. A real `git clone`
// from a local fixture repository: offline, but git has to be installed
// (like g++ for the validate suite).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { cloneSite } from "../src/project/clone.ts";

const hasGit = (() => {
    try {
        execFileSync("git", ["--version"], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

function tmpRoot(prefix = "mylearn-clone-test-"): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function mk(file: string, content: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

function git(cwd: string, args: string[]): void {
    const r = spawnSync("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
}

/** fixture "remote" KB: site files + build output + content that must not travel */
function makeRemote(): string {
    const remote = tmpRoot("mylearn-remote-");
    mk(path.join(remote, ".vitepress", "config.ts"), "export default { source: 'remote' }\n");
    mk(path.join(remote, ".vitepress", "sidebar.ts"), "export const sidebar = {}\n");
    mk(path.join(remote, ".vitepress", "theme", "index.ts"), "export default {}\n");
    mk(path.join(remote, ".vitepress", "cache", "junk.json"), "{}\n");
    mk(path.join(remote, ".vitepress", "dist", "index.html"), "<html></html>\n");
    mk(path.join(remote, "package.json"), '{"name": "mylearn-kb", "private": true}\n');
    mk(path.join(remote, "pnpm-workspace.yaml"), "onlyBuiltDependencies:\n  - esbuild\n");
    mk(path.join(remote, ".github", "workflows", "site-pages.yml"), "name: Deploy\n");
    mk(path.join(remote, "problems", "luogu", "P1", "problem.md"), "# content\n");
    mk(path.join(remote, "readme.md"), "# content\n");
    git(remote, ["init", "-q"]);
    git(remote, ["add", "-A"]);
    git(remote, [
        "-c",
        "user.email=test@test",
        "-c",
        "user.name=test",
        "commit",
        "-qm",
        "seed",
    ]);
    return remote;
}

describe("cloneSite", () => {
    test("copies the site files, leaving builds and content behind", { skip: !hasGit }, () => {
        const remote = makeRemote();
        const target = tmpRoot();
        try {
            cloneSite(target, pathToFileURL(remote).href);
            assert.equal(
                fs.readFileSync(path.join(target, ".vitepress", "config.ts"), "utf-8"),
                "export default { source: 'remote' }\n"
            );
            assert.ok(fs.existsSync(path.join(target, ".vitepress", "theme", "index.ts")));
            assert.ok(!fs.existsSync(path.join(target, ".vitepress", "cache")));
            assert.ok(!fs.existsSync(path.join(target, ".vitepress", "dist")));
            // the remote's content stays where it is — the project has its own
            assert.ok(!fs.existsSync(path.join(target, "problems")));
            assert.ok(!fs.existsSync(path.join(target, "readme.md")));
        } finally {
            fs.rmSync(remote, { recursive: true, force: true });
            fs.rmSync(target, { recursive: true, force: true });
        }
    });

    test("brings the build/CI files too, package renamed", { skip: !hasGit }, () => {
        const remote = makeRemote();
        const target = tmpRoot();
        try {
            cloneSite(target, pathToFileURL(remote).href);
            // a cloned .vitepress is only runnable with these along
            assert.equal(
                JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf-8")).name,
                path.basename(target)
            );
            assert.ok(fs.existsSync(path.join(target, "pnpm-workspace.yaml")));
            assert.ok(fs.existsSync(path.join(target, ".github", "workflows", "site-pages.yml")));
        } finally {
            fs.rmSync(remote, { recursive: true, force: true });
            fs.rmSync(target, { recursive: true, force: true });
        }
    });

    test("keeps files that already exist unless force", { skip: !hasGit }, () => {
        const remote = makeRemote();
        const target = tmpRoot();
        try {
            mk(path.join(target, ".vitepress", "config.ts"), "// mine\n");
            cloneSite(target, pathToFileURL(remote).href);
            assert.equal(
                fs.readFileSync(path.join(target, ".vitepress", "config.ts"), "utf-8"),
                "// mine\n"
            );
            cloneSite(target, pathToFileURL(remote).href, { force: true });
            assert.equal(
                fs.readFileSync(path.join(target, ".vitepress", "config.ts"), "utf-8"),
                "export default { source: 'remote' }\n"
            );
        } finally {
            fs.rmSync(remote, { recursive: true, force: true });
            fs.rmSync(target, { recursive: true, force: true });
        }
    });

    test("a repo that is not there fails loudly", { skip: !hasGit }, () => {
        const target = tmpRoot();
        try {
            assert.throws(
                () => cloneSite(target, pathToFileURL(path.join(target, "nope")).href),
                /git clone .* failed/
            );
        } finally {
            fs.rmSync(target, { recursive: true, force: true });
        }
    });

    test("a repo without .vitepress fails loudly", { skip: !hasGit }, () => {
        const remote = tmpRoot("mylearn-remote-bare-");
        const target = tmpRoot();
        try {
            mk(path.join(remote, "readme.md"), "# a plain notes repo\n");
            git(remote, ["init", "-q"]);
            git(remote, ["add", "-A"]);
            git(remote, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "seed"]);
            assert.throws(
                () => cloneSite(target, pathToFileURL(remote).href),
                /has no \.vitepress/
            );
        } finally {
            fs.rmSync(remote, { recursive: true, force: true });
            fs.rmSync(target, { recursive: true, force: true });
        }
    });
});
