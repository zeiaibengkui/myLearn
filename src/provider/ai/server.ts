// MCP server for the myLearn knowledge base — speak JSON-RPC over stdio so
// claude / codex / any MCP client can drive the providers:
//   list_problems    every note in the problemset            (src/ai/ base)
//   read_problem     title, description, samples, solutions  (src/ai/ base)
//   submit_solution  validate + archive a C++ solution       (luogu provider)
//
// Start it from inside an initialized project:
//   pnpx tsx index.ts ai serve
// Client config, e.g. for Claude Code:
//   claude mcp add mylearn -- pnpx tsx /path/to/myLearn/index.ts ai serve

import path from "node:path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { listProblems, openNote, resolveNote } from "../../ai/problems.ts";
import { submitSolution } from "../luogu/maintain.ts";

function root(): string {
    return globalThis.projectRoot ?? process.cwd();
}

function textResult(text: string) {
    return { content: [{ type: "text" as const, text }] };
}

function failResult(text: string) {
    return { content: [{ type: "text" as const, text }], isError: true as const };
}

export function createServer(): McpServer {
    const server = new McpServer({ name: "myLearn", version: "0.9.0" });

    server.registerTool(
        "list_problems",
        { description: "List every note in the problemset (title, category, note id)." },
        async () => {
            const notes = listProblems(root());
            if (!notes.length) {
                return textResult("(empty problemset)");
            }
            return textResult(
                notes
                    .map((n) => `${n.title}  [category: ${n.category}]  ${path.basename(n.dir)}`)
                    .join("\n")
            );
        }
    );

    server.registerTool(
        "read_problem",
        {
            description: "Read a note: title, category, description (incl. samples) and saved solutions.",
            inputSchema: { problem: z.string() },
        },
        async ({ problem }) => {
            const note = openNote(root(), problem);
            const solutions = note.solutions.map((s) => `* ${s.title}`).join("\n");
            return textResult(
                [
                    `# ${note.title}`,
                    `- category: ${note.category}`,
                    `- note id: ${path.basename(resolveNote(root(), problem))}`,
                    "",
                    note.description,
                    "",
                    "## Solutions",
                    solutions || "(none)",
                ].join("\n")
            );
        }
    );

    server.registerTool(
        "submit_solution",
        {
            description:
                "Validate a C++ solution file against a note's samples; archive it into the note when all cases pass.",
            inputSchema: { problem: z.string(), solution: z.string() },
        },
        async ({ problem, solution }) => {
            const dir = resolveNote(root(), problem);
            const { result, saved } = await submitSolution(dir, path.resolve(solution));
            const lines = result.cases.map(
                (c, i) => `${c.passed ? "PASS" : "FAIL"} case ${i + 1}${c.error ? `: ${c.error}` : ""}`
            );
            if (!saved) {
                return failResult(
                    `Did not pass all cases — nothing saved.\n${lines.join("\n")}`
                );
            }
            return textResult(
                `All ${result.cases.length} case(s) passed — archived into ${dir}.\n${lines.join("\n")}`
            );
        }
    );

    return server;
}

/** Run the MCP server on stdio; logging goes to stderr (stdout is JSON-RPC). */
export async function serve(): Promise<void> {
    const server = createServer();
    process.stderr.write("myLearn MCP server online\n");
    await server.connect(new StdioServerTransport());
}
