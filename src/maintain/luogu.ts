// Validate a C++ solution against a problem note's sample cases.
// Samples live in the note description as "### 样例 N" sections with a
// ```text block under **输入** and one under **输出** (see fetch/luogu.ts).
// The solution is compiled with g++ (execFile, no shell) and each sample
// input is piped to the binary's stdin; stdout is compared to the expected
// output with trailing-whitespace normalization.

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openProblem } from "../utils/noteFile.ts";

const execFileAsync = promisify(execFile);

const runTimeoutMs = 5000;
const maxBufferBytes = 1024 * 1024;

/** Run a binary with input piped to stdin (execFile has no stdin option;
 *  spawn does — without resorting to a shell). Rejects with code
 *  "ETIMEDOUT" when the binary runs past runTimeoutMs. */
function runWithInput(
    exe: string,
    input: string,
    timeoutMs: number
): Promise<{ stdout: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(exe, [], { stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
            stdout += chunk;
            if (stdout.length > maxBufferBytes) {
                child.kill();
                reject(new Error(`stdout exceeds ${maxBufferBytes} bytes`));
            }
        });
        child.stderr.on("data", (chunk: string) => {
            stderr += chunk;
        });
        const timer = setTimeout(
            () => {
                child.kill("SIGKILL");
                reject(
                    Object.assign(new Error("timed out"), {
                        code: "ETIMEDOUT",
                    })
                );
            },
            timeoutMs
        );
        child.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
        });
        child.on("close", (code, signal) => {
            clearTimeout(timer);
            if (code === 0) {
                resolve({ stdout });
            } else {
                reject(
                    Object.assign(
                        new Error(
                            `exited with ${code ?? `signal ${signal}`}${stderr ? `:\n${stderr}` : ""}`
                        ),
                        { code: code ?? signal }
                    )
                );
            }
        });
        child.stdin.end(input);
    });
}

export interface SampleCase {
    input: string;
    output: string;
}

/** Extract (input, output) pairs from "### 样例 N" sections. Sections that
 *  don't have both text blocks are silently skipped (a note can be trimmed). */
export function parseSamples(description: string): SampleCase[] {
    const sections = description.split(/### 样例\s*\d+/).slice(1);
    const cases: SampleCase[] = [];
    for (const section of sections) {
        const blocks = [...section.matchAll(/```text\n([\s\S]*?)\n```/g)].map(
            (m) => m[1]
        );
        if (blocks.length >= 2) {
            cases.push({ input: blocks[0], output: blocks[1] });
        }
    }
    return cases;
}

/** judge-style normalization: trailing spaces per line, trailing blank lines
 *  removed — a solution printing "14\n\n" still matches "14" */
function normalizeOutput(text: string): string {
    const lines = text.split("\n").map((l) => l.trimEnd());
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
}

export interface CaseResult {
    passed: boolean;
    input: string;
    expected: string;
    actual: string;
    /** e.g. "timeout (TLE)" when the binary did not finish in time */
    error?: string;
}

export interface ValidateResult {
    title: string;
    cases: CaseResult[];
    ok: boolean;
}

export async function validateSolution(
    problemDir: string,
    solutionPath: string,
    timeoutMs = runTimeoutMs
): Promise<ValidateResult> {
    const problem = openProblem(problemDir);
    const cases = parseSamples(problem.description);
    if (!cases.length) {
        throw new Error(`No "### 样例" sections found in ${problemDir}`);
    }

    const exe = path.join(
        os.tmpdir(),
        `myLearn-sol-${process.pid}-${Math.random().toString(36).slice(2)}`
    );
    const results: CaseResult[] = [];
    try {
        try {
            await execFileAsync("g++", [
                path.resolve(solutionPath),
                "-o",
                exe,
                "-O2",
                "-std=c++17",
            ], { encoding: "utf8" });
        } catch (e) {
            const err = e as { stderr?: string };
            throw new Error(
                `Compilation failed${err.stderr ? `:\n${err.stderr}` : ""}`
            );
        }

        for (const c of cases) {
            try {
                const { stdout } = await runWithInput(exe, c.input, timeoutMs);
                const expected = normalizeOutput(c.output);
                const actual = normalizeOutput(stdout);
                results.push({
                    passed: actual === expected,
                    input: c.input,
                    expected,
                    actual,
                });
            } catch (e) {
                const code = (e as { code?: number | string }).code;
                results.push({
                    passed: false,
                    input: c.input,
                    expected: normalizeOutput(c.output),
                    actual: "",
                    error:
                        code === "ETIMEDOUT"
                            ? `timeout (${runTimeoutMs / 1000}s)`
                            : `runtime error (${code ?? "unknown"})`,
                });
            }
        }
    } finally {
        fs.rmSync(exe, { force: true });
    }

    return { title: problem.title, cases: results, ok: results.every((r) => r.passed) };
}

/** Locate a note directory by its pid: content/<category>/<title>/ where
 *  the directory name starts with "<pid> " (title = "P4001 <name>"). */
export function findProblemByPid(root: string, pid: string): string {
    const content = path.join(root, "content");
    if (!fs.existsSync(content)) {
        throw new Error(`No content directory: ${content}`);
    }
    for (const category of fs.readdirSync(content)) {
        const cat = path.join(content, category);
        if (!fs.statSync(cat).isDirectory()) continue;
        for (const entry of fs.readdirSync(cat)) {
            const dir = path.join(cat, entry);
            if (!fs.statSync(dir).isDirectory()) continue;
            if (entry === pid || entry.startsWith(`${pid} `)) return dir;
        }
    }
    throw new Error(`No note found for pid ${pid} in ${content}`);
}
