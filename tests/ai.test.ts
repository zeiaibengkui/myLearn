// AI module tests: note resolution (the -p contract), paste-prompt assembly
// and the MCP server (over InMemoryTransport, fully offline).
//
// Filter: pnpm test -- --test-name-pattern "resolveNote|buildPrompt|server"

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { listProblems, openNote, resolveNote } from "../src/ai/problems.ts";
import { buildPrompt } from "../src/provider/ai/prompt.ts";
import { createServer } from "../src/provider/ai/server.ts";
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
    const dir = path.join(root, "content", category, titleDir);
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
            fs.mkdirSync(path.join(root, "content", "a", "note c"));
            fs.writeFileSync(path.join(root, "content", "frag.md"), "x");
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

    test("empty problemset without meaning content dir", () => {
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

    test("accepts a project-relative and a content-relative path", () => {
        const root = tmpRoot();
        try {
            const dir = mkNote(root, "luogu", "P4001 demo");
            assert.equal(resolveNote(root, "content/luogu/P4001 demo"), dir);
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
            assert.equal(resolveNote(root, "content/luogu/P4001 demo"), dir);
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

describe("MCP server", () => {
    async function clientForServer() {
        const server = createServer();
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: "test", version: "0.0.0" });
        await Promise.all([
            client.connect(clientTransport),
            server.connect(serverTransport),
        ]);
        return client;
    }

    test("advertises list_problems, read_problem, submit_solution", async () => {
        const client = await clientForServer();
        const { tools } = await client.listTools();
        assert.deepEqual(
            tools.map((t) => t.name),
            ["list_problems", "read_problem", "submit_solution"]
        );
        await client.close();
    });

    test("advertises instructions describing the workflow", async () => {
        const client = await clientForServer();
        const instructions = client.getInstructions();
        assert.ok(instructions, "instructions delivered in the initialize handshake");
        assert.match(instructions, /content\/<category>\/<title>\//);
        assert.match(instructions, /own file tools/);
        assert.match(instructions, /write the C\+\+ source file to disk/);
        await client.close();
    });

    test("read_problem reads a note from the configured project", async () => {
        const root = tmpRoot();
        const prevRoot = globalThis.projectRoot;
        try {
            const dir = mkNote(root, "graph", "P4001 demo", "P4001 演示");
            fs.writeFileSync(path.join(dir, "Solution A.md"), "# Solution A\n");
            globalThis.projectRoot = root;
            const client = await clientForServer();
            const res = await client.callTool({ name: "read_problem", arguments: { problem: "p4001" } });
            const text = (res.content as { type: "text"; text: string }[])
                .map((c) => c.text)
                .join("\n");
            assert.match(text, /^# P4001 演示/);
            assert.match(text, /- category: graph/);
            assert.match(text, /Description of P4001 demo\./);
            assert.match(text, /## Solutions/);
            assert.match(text, /\* Solution A/);
            await client.close();
        } finally {
            globalThis.projectRoot = prevRoot;
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("read_problem returns an error result for an unknown note", async () => {
        const root = tmpRoot();
        const prevRoot = globalThis.projectRoot;
        try {
            globalThis.projectRoot = root;
            const client = await clientForServer();
            const res = await client.callTool({ name: "read_problem", arguments: { problem: "Q9999" } });
            assert.equal(res.isError, true);
            assert.match(
                (res.content as { type: "text"; text: string }[])[0].text,
                /No note matches/
            );
            await client.close();
        } finally {
            globalThis.projectRoot = prevRoot;
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
