// Luogu provider. Imported for its side effect (see arg.ts): it registers
// its own CLI on the shared global program, scoping everything Luogu under
// the `luogu` command group.
//   luogu fetch P4001 [-c luogu]     import a problem (pid or URL) as a note
//   luogu submit solution.cpp -p P4001   validate + archive a solution

import path from "node:path";
import { program } from "../../utils/program.ts";
import { importDraft } from "../../utils/fetcher.ts";
import { resolveNote } from "../../ai/problems.ts";
import { submitSolution } from "./maintain.ts";
import fetchLuogu from "./fetch.ts";

const luogu = program
    .command("luogu")
    .description("Luogu provider: fetch problems and submit solutions");

luogu
    .command("fetch")
    .description("Fetch a Luogu problem (pid or URL) as a note")
    .argument("<source>", "pid like P4001, or a Luogu problem URL")
    .option("-c, --category <category>", "target category", "luogu")
    .action(async (source: string, options: { category: string }) => {
        const draft = await fetchLuogu.convert(source);
        const problem = importDraft(
            globalThis.projectRoot,
            options.category,
            draft
        );
        console.log(`Saved "${problem.title}" → problems/${options.category}/${problem.title}/`);
    });

luogu
    .command("submit")
    .description("Validate a C++ solution against a note's samples, then archive it on success")
    .argument("<solution>", "solver .cpp file")
    .option("-p, --problem <problem>", "note path or pattern (exactly one match)")
    .action(async (solution: string, options: { problem?: string }) => {
        const spec = options.problem ?? program.opts().problem;
        if (!spec) {
            program.error("'luogu submit' needs -p <problem> (a note path or a pattern matching exactly one note)");
        }
        const dir = resolveNote(globalThis.projectRoot, spec);
        const { result, saved } = await submitSolution(dir, path.resolve(solution));
        result.cases.forEach((c, i) => {
            if (c.passed) {
                console.log(`  PASS  case ${i + 1}`);
            } else {
                const detail =
                    c.error ??
                    `expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`;
                console.log(`  FAIL  case ${i + 1}: ${detail}`);
            }
        });
        if (!saved) {
            console.log(`Nothing saved for "${result.title}" — fixing the failing cases first.`);
            process.exitCode = 1;
            return;
        }
        console.log(
            `All ${result.cases.length} case(s) passed — archived solution under problems/ for "${result.title}".`
        );
    });
