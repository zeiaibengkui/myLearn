// Maintain module tests: watch snapshot diff + luogu sample validation.
// The validate e2e cases compile real C++ (g++); they are skipped when g++
// is not installed. The watch cases are fully offline and deterministic (mtimes set via utimes).
//
// Filter: pnpm test -- --test-name-pattern "watch|parseSamples"  (offline)
//         pnpm test -- --test-name-pattern "validate"            (needs g++)

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { watch, loadSnapshot } from "../src/maintain/watch.ts";
import {
    parseSamples,
    validateSolution,
    findProblemByPid,
} from "../src/maintain/luogu.ts";

function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-test-"));
}

describe("watch snapshot", () => {
    test("first run adds, second run is stable, edits and removals are detected", () => {
        const root = tmpRoot();
        const md = path.join(root, "content", "graph", "P4001 狼", "problem.md");
        fs.mkdirSync(path.dirname(md), { recursive: true });
        const stamp = (ms: number) => {
            const d = new Date(ms);
            fs.utimesSync(md, d, d);
        };
        try {
            fs.writeFileSync(md, "# title: P4001\n\ndesc\n");
            stamp(1_700_000_000_000);
            const rel = "graph/P4001 狼/problem.md";

            let diff = watch(root);
            assert.deepEqual(diff, { added: [rel], changed: [], removed: [] });

            // unchanged tree → empty diff, and the record is persisted
            diff = watch(root);
            assert.deepEqual(diff, { added: [], changed: [], removed: [] });
            const saved = loadSnapshot(root);
            assert.equal(saved.files[rel].hash.length, 64);
            assert.equal(saved.files[rel].mtimeMs, 1_700_000_000_000);

            // same content, newer mtime → rehashed, hash equal → not "changed"
            stamp(1_701_000_000_000);
            diff = watch(root);
            assert.deepEqual(diff, { added: [], changed: [], removed: [] });
            assert.equal(loadSnapshot(root).files[rel].mtimeMs, 1_701_000_000_000);

            // different content → changed
            fs.writeFileSync(md, "# title: P4001\n\nnew desc\n");
            stamp(1_702_000_000_000);
            diff = watch(root);
            assert.deepEqual(diff, { added: [], changed: [rel], removed: [] });

            // deletion → removed
            fs.rmSync(md);
            diff = watch(root);
            assert.deepEqual(diff, { added: [], changed: [], removed: [rel] });
            assert.deepEqual(loadSnapshot(root).files, {});
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("throws when content/ is missing", () => {
        const root = tmpRoot();
        try {
            assert.throws(() => watch(root), /No content directory/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("parseSamples", () => {
    // shape produced by fetch/luogu.ts for samples: [[input, output], ...]
    const description = [
        "> 洛谷 [P4001](https://www.luogu.com.cn/problem/P4001) · 难度 省选/NOI−",
        "",
        "## 题目描述",
        "",
        "grid graph",
        "",
        "## 样例",
        "",
        "### 样例 1",
        "",
        "**输入**",
        "",
        "```text",
        "3 4",
        "5 6 4",
        "```",
        "",
        "**输出**",
        "",
        "```text",
        "14",
        "```",
        "",
        "### 样例 2",
        "",
        "**输入**",
        "",
        "```text",
        "10 10",
        "1 2",
        "```",
        "",
        "**输出**",
        "",
        "```text",
        "100",
        "```",
    ].join("\n");

    test("extracts every 样例 section's input/output blocks", () => {
        assert.deepEqual(parseSamples(description), [
            { input: "3 4\n5 6 4", output: "14" },
            { input: "10 10\n1 2", output: "100" },
        ]);
    });

    test("returns [] when the note has no samples", () => {
        assert.deepEqual(parseSamples("no samples here"), []);
    });

    test("skips sections missing a paired block", () => {
        const partial = description.split(/### 样例 2/)[0] + "### 样例 2\n\n**输入**\n\n```text\nx\n```";
        assert.deepEqual(parseSamples(partial), [{ input: "3 4\n5 6 4", output: "14" }]);
    });
});

describe("findProblemByPid", () => {
    test("finds the note dir by pid prefix across categories", () => {
        const root = tmpRoot();
        const dir = path.join(root, "content", "graph", "P4001 狼", "problem.md");
        fs.mkdirSync(path.dirname(dir), { recursive: true });
        fs.writeFileSync(dir, "x");
        try {
            assert.equal(findProblemByPid(root, "P4001"), path.dirname(dir));
            assert.throws(() => findProblemByPid(root, "P9999"), /No note found/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("validateSolution (needs g++)", () => {
    const hasGpp = (() => {
        try {
            execFileSync("g++", ["--version"], { stdio: "ignore" });
            return true;
        } catch {
            return false;
        }
    })();

    // a minimal note with frontmatter + one sample (3 4 → 14)
    function writeNote(root: string): string {
        const dir = path.join(root, "content", "cat", "P4001 demo");
        fs.mkdirSync(dir, { recursive: true });
        const desc = [
            "## 样例",
            "",
            "### 样例 1",
            "",
            "**输入**",
            "",
            "```text",
            "3 4",
            "```",
            "",
            "**输出**",
            "",
            "```text",
            "14",
            "```",
        ].join("\n");
        fs.writeFileSync(
            path.join(dir, "problem.md"),
            `---\ntitle: P4001 demo\ncategory: cat\n---\n${desc}\n`
        );
        return dir;
    }

    function writeCpp(root: string, body: string): string {
        const p = path.join(root, "sol.cpp");
        fs.writeFileSync(p, body);
        return p;
    }

    test("passes when the sample output matches", { skip: !hasGpp }, async () => {
        const root = tmpRoot();
        try {
            const dir = writeNote(root);
            const sol = writeCpp(root, '#include <cstdio>\nint main() { printf("14\\n"); return 0; }\n');
            const r = await validateSolution(dir, sol);
            assert.equal(r.ok, true);
            assert.equal(r.cases.length, 1);
            assert.equal(r.cases[0].passed, true);
            assert.equal(r.title, "P4001 demo");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("fails on wrong output and keeps the actual stdout", { skip: !hasGpp }, async () => {
        const root = tmpRoot();
        try {
            const dir = writeNote(root);
            const sol = writeCpp(root, '#include <cstdio>\nint main() { printf("13\\n"); return 0; }\n');
            const r = await validateSolution(dir, sol);
            assert.equal(r.ok, false);
            assert.equal(r.cases[0].passed, false);
            assert.equal(r.cases[0].actual, "13");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("reports nonzero exit as a runtime error", { skip: !hasGpp }, async () => {
        const root = tmpRoot();
        try {
            const dir = writeNote(root);
            const sol = writeCpp(root, "int main() { return 1; }\n");
            const r = await validateSolution(dir, sol);
            assert.equal(r.ok, false);
            assert.match(r.cases[0].error ?? "", /runtime error/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("reports a timeout when the run does not finish", { skip: !hasGpp }, async () => {
        const root = tmpRoot();
        try {
            const dir = writeNote(root);
            const sol = writeCpp(root, "int main() { for (;;) {} }\n");
            const r = await validateSolution(dir, sol, 500);
            assert.equal(r.ok, false);
            assert.match(r.cases[0].error ?? "", /timeout/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
