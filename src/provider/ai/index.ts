// AI provider. Imported for its side effect (see arg.ts): registers its own
// CLI on the shared global program.
//   ai "<prompt>" -p <problem>   hand the note over to the codex CLI

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { program } from "../../utils/program.ts";
import { openNote, resolveNote } from "../../ai/problems.ts";
import { buildPrompt } from "./prompt.ts";

const ai = program
    .command("ai")
    .description("AI provider: assemble the note bundle and hand it to the codex CLI");

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
        const bundle = buildPrompt(note, prompt.join(" "), path.relative(globalThis.projectRoot, dir) || dir);
        // The workflow doc ships with the repo; mention it so codex drives the
        // CLI per docs/SKILL.md instead of guessing. Missing → still hand over.
        const skillDoc = fileURLToPath(new URL("../../../docs/SKILL.md", import.meta.url));
        const message = fs.existsSync(skillDoc)
            ? [
                `myLearn — work on this problem. Read the workflow/CLI doc first: ${skillDoc}`,
                "(use its commands: luogu submit sol.cpp -p <note>, maintain luogu -p <note>, maintain watch)",
                "",
                bundle,
            ].join("\n")
            : bundle;
        const child = spawn("codex", [message], { stdio: "inherit" });
        child.on("error", (err) => {
            console.error(`failed to start codex: ${err.message}`);
            process.exit(1);
        });
        child.on("exit", (code) => {
            process.exit(code ?? 1);
        });
    });
