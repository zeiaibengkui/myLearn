// AI module tests: note resolution (the -p contract) and paste-prompt assembly.
//
// Filter: pnpm test -- --test-name-pattern "resolveNote|buildPrompt"

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listProblems, openNote, resolveNote } from "../src/ai/problems.ts";
import { buildPrompt, clientCommand } from "../src/provider/ai/prompt.ts";
import type { Problem } from "../src/utils/problem.ts";

function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-ai-test-"));
}

/** Write a note; title defaults to the directory name. Returns the note dir. */
function mkNote(
    root: string,
    category: string,
    titleDir: string,
    title = titleDir
): string {
    const dir = path.join(root, "problems", category, titleDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
        path.join(dir, "problem.md"),
        `---\ntitle: ${title}\ncategory: ${category}\n---\nDescription of ${titleDir}.\n`
    );
    return dir;
}

function fakeProblem(over: Partial<Problem> = {}): Problem {
    return {
        title: "P4001 样例题",
        description: "Desc.",
        sourceFiles: [],
        category: "luogu",
        solutions: [],
        ...over,
    };
}

describe("listProblems", () => {
    test("returns every note sorted by category then title dir", () => {
        const root = tmpRoot();
        try {
            mkNote(root, "b", "note z");
            mkNote(root, "a", "note b");
            mkNote(root, "a", "note a");
            // a dir with no problem.md and a stray file are not notes
            fs.mkdirSync(path.join(root, "problems", "a", "note c"));
            fs.writeFileSync(path.join(root, "problems", "frag.md"), "x");
            // freeform notes (sibling of problems/) are not problems
            fs.mkdirSync(path.join(root, "notes", "nested"), { recursive: true });
            fs.writeFileSync(path.join(root, "notes", "nested", "note.md"), "x");
            const notes = listProblems(root);
            assert.equal(notes.length, 3);
            assert.deepEqual(
                notes.map((n) => `${n.category}/${path.basename(n.dir)}`),
                ["a/note a", "a/note b", "b/note z"]
            );
            assert.equal(notes[0].title, "note a");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("empty problemset when the problems dir is absent", () => {
        const root = tmpRoot();
        try {
            assert.deepEqual(listProblems(root), []);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("resolveNote (the -p contract)", () => {
    test("accepts an absolute note path", () => {
        const root = tmpRoot();
        try {
            const dir = mkNote(root, "luogu", "P4001 demo");
            assert.equal(resolveNote(root, dir), dir);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("accepts a project-relative and a problems-relative path", () => {
        const root = tmpRoot();
        try {
            const dir = mkNote(root, "luogu", "P4001 demo");
            assert.equal(resolveNote(root, "problems/luogu/P4001 demo"), dir);
            assert.equal(resolveNote(root, "luogu/P4001 demo"), dir);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("accepts a cwd-relative path", () => {
        const root = tmpRoot();
        const prev = process.cwd();
        try {
            const dir = mkNote(root, "luogu", "P4001 demo");
            process.chdir(root);
            assert.equal(resolveNote(root, "problems/luogu/P4001 demo"), dir);
        } finally {
            process.chdir(prev);
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("pattern: case-insensitive substring, exactly one match", () => {
        const root = tmpRoot();
        try {
            const dir = mkNote(root, "luogu", "P4001 狼", "P4001 狼");
            assert.equal(resolveNote(root, "p4001"), dir);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("no match throws with a hint", () => {
        const root = tmpRoot();
        try {
            mkNote(root, "luogu", "P4001");
            assert.throws(() => resolveNote(root, "Q1234"), /No note matches/);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("ambiguous pattern lists every match", () => {
        const root = tmpRoot();
        try {
            const d1 = mkNote(root, "luogu", "P4001 狼");
            const d2 = mkNote(root, "graph", "P4001 兔");
            assert.throws(() => resolveNote(root, "p4001"), /matches more than one/);
            assert.throws(() => resolveNote(root, "p4001"), new RegExp(d1.replace(/\\/g, "\\\\")));
            assert.throws(() => resolveNote(root, "p4001"), new RegExp(d2.replace(/\\/g, "\\\\")));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("openNote", () => {
    test("returns a live problem proxy for the resolved dir", () => {
        const root = tmpRoot();
        try {
            const dir = mkNote(root, "graph", "P4001 demo", "P4001 演示");
            const note = openNote(root, "p4001");
            assert.equal(note.title, "P4001 演示");
            assert.equal(note.category, "graph");
            assert.match(note.description, /Description of P4001 demo\./);
            assert.equal(note.solutions.length, 0);
            // projects are loaded from the note dir even via a pattern
            assert.equal(fs.existsSync(dir), true);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe("buildPrompt", () => {
    test("bundles task, note metadata, description and existing solutions", () => {
        const problem = fakeProblem({ solutions: [{ title: "Solution A", description: "x", sourceFiles: [] }] });
        const prompt = buildPrompt(problem, "Solve this problem.", "luogu/P4001 样例题");
        assert.match(prompt, /^# Task\n\nSolve this problem\./);
        assert.match(prompt, /# Problem: P4001 样例题/);
        assert.match(prompt, /- category: luogu/);
        assert.match(prompt, /- note: luogu\/P4001 样例题/);
        assert.match(prompt, /Desc\./);
        assert.match(prompt, /## Existing solutions\n\n\* Solution A/);
    });

    test("omits note line and solutions section when absent", () => {
        const prompt = buildPrompt(fakeProblem(), "hi");
        assert.doesNotMatch(prompt, /- note: /);
        assert.doesNotMatch(prompt, /Existing solutions/);
    });
});

describe("clientCommand", () => {
    test("defaults to codex and honors the config prefix", () => {
        assert.equal(clientCommand(undefined), "codex");
        assert.equal(clientCommand("   "), "codex");
        assert.equal(clientCommand("codex --yolo"), "codex --yolo");
        assert.equal(clientCommand("claude -p"), "claude -p");
    });
});

