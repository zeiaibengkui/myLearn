// AI provider. Imported for its side effect (see arg.ts): registers its own
// CLI on the shared global program.
//   ai "<prompt>" [-p <problem>]   hand the prompt (and note, when given) to codex

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { program } from "../../utils/program.ts";
import { openNote, resolveNote } from "../../ai/problems.ts";
import { buildPrompt } from "./prompt.ts";

const ai = program
    .command("ai")
    .description("AI provider: hand a prompt (plus the note, with -p) to the codex CLI");

ai
    .argument("<prompt...>", "the task for the AI")
    .option("-p, --problem <problem>", "note path or pattern (exactly one match; omit to send just the prompt)")
    .action(async (prompt: string[], options: { problem?: string }) => {
        const spec = options.problem ?? program.opts().problem;
        const task = prompt.join(" ");
        // The workflow doc ships with the repo; mention it so codex drives the
        // CLI per docs/SKILL.md instead of guessing. Missing → still hand over.
        const skillDoc = fileURLToPath(new URL("../../../docs/SKILL.md", import.meta.url));
        const lead = fs.existsSync(skillDoc)
            ? [
                `myLearn — this problem lives in the myLearn knowledge base. Read the workflow/CLI doc first: ${skillDoc}`,
                "(use its commands: luogu submit sol.cpp -p <note>, maintain luogu -p <note>, maintain watch)",
                "",
            ].join("\n")
            : "";
        const bundle = spec
            ? buildPrompt(
                  openNote(globalThis.projectRoot, spec),
                  task,
                  path.relative(globalThis.projectRoot, resolveNote(globalThis.projectRoot, spec)) || "."
              )
            : task;
        const child = spawn("codex", [lead + bundle], { stdio: "inherit" });
        child.on("error", (err) => {
            console.error(`failed to start codex: ${err.message}`);
            process.exit(1);
        });
        child.on("exit", (code) => {
            process.exit(code ?? 1);
        });
    });
