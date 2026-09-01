// AI provider. Imported for its side effect (see arg.ts): registers its own
// CLI on the shared global program.
//   ai "<prompt>" -p <problem>   print a paste-ready prompt bundle (no API call)
//   ai serve                     run the myLearn MCP server over stdio
// The MCP tools back the provider verbs too: base knowledge-base accessors
// live in src/ai/ (list_problems, read_problem), provider-specific ones
// (submit_solution) behind the luogu provider; see ./server.ts.

import path from "node:path";
import { program } from "../../utils/program.ts";
import { openNote, resolveNote } from "../../ai/problems.ts";
import { buildPrompt } from "./prompt.ts";
import { serve } from "./server.ts";

const ai = program
    .command("ai")
    .description("AI provider: paste-ready prompt assembly and MCP server");

ai
    .argument("<prompt...>", "the task for the AI")
    .option("-p, --problem <problem>", "note path or pattern (must match exactly one note)")
    .action(async (prompt: string[], options: { problem?: string }) => {
        const spec = options.problem ?? program.opts().problem;
        if (!spec) {
            program.error("'ai' needs -p <problem> (a note path or a pattern matching exactly one note)");
        }
        const note = openNote(globalThis.projectRoot, spec);
        const dir = resolveNote(globalThis.projectRoot, spec);
        console.log(buildPrompt(note, prompt.join(" "), path.relative(globalThis.projectRoot, dir) || dir));
    });

ai
    .command("serve")
    .description("Run the myLearn MCP server over stdio (add to claude / codex as an MCP server)")
    .action(async () => {
        await serve();
    });
