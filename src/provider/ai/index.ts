// AI provider. Imported for its side effect (see arg.ts): registers its own
// CLI on the shared global program.
//   ai "<prompt>" -p <problem>   print a paste-ready prompt bundle (no API call)

import path from "node:path";
import { program } from "../../utils/program.ts";
import { openNote, resolveNote } from "../../ai/problems.ts";
import { buildPrompt } from "./prompt.ts";

const ai = program
    .command("ai")
    .description("AI provider: paste-ready prompt assembly");

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
