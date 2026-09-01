import { Command } from "commander";
import path from "node:path";
import initProject from "../project/init.ts";
import { fetchProblem } from "../fetch/index.ts";
import { watch, watchContinuous, type NoteDiff } from "../maintain/watch.ts";
import { findProblemByPid, validateSolution } from "../maintain/luogu.ts";

const program = new Command();
program
    .name("myLearn")
    .description("nodejs cli learning tool")
    .version("0.8.0");
program
    .command("init")
    .description("Initialize a new project template")
    .argument("<dir>", "target directory")
    .action((dir: string) => {
        initProject(path.resolve(dir));
    });
program
    .command("add")
    .description("Import a source (file or Luogu problem URL) as a problem")
    .argument("<source>", "source to import")
    .option("-t, --type <type>", "source type: pdf or luogu (fetchers auto-detect when omitted)")
    .requiredOption("-c, --category <category>", "target category")
    .action(async (source: string, options: { type?: string; category: string }) => {
        const problem = await fetchProblem(
            globalThis.projectRoot,
            source,
            options.category,
            options.type
        );
        console.log(`Saved "${problem.title}" → content/${options.category}/${problem.title}/`);
        // TODO: rebuild index via scan.ts once implemented
    });

function printDiff(diff: NoteDiff): void {
    for (const f of diff.added) console.log(`  [added]   ${f}`);
    for (const f of diff.changed) console.log(`  [changed] ${f}`);
    for (const f of diff.removed) console.log(`  [removed] ${f}`);
    const total = diff.added.length + diff.changed.length + diff.removed.length;
    console.log(total ? `${total} file(s) changed.` : "Everything up to date.");
}

const maintain = program
    .command("maintain")
    .description("Maintain the knowledge base: detect changes, validate solutions")
    .action(() => {
        program.error("'maintain' needs a subcommand: watch | luogu");
    });

maintain
    .command("watch")
    .description("Compare content/ against .mylearn/index/latest.json and update the snapshot")
    .option("--watch", "keep running and report changes as they happen")
    .action((options: { watch?: boolean }) => {
        printDiff(watch(globalThis.projectRoot));
        if (options.watch) {
            watchContinuous(globalThis.projectRoot, printDiff);
            console.log("Watching content/ for changes... (ctrl-c to stop)");
        }
    });

maintain
    .command("luogu")
    .description("Compile a C++ solution (g++) and validate it against a note's sample cases")
    .argument("<solution>", "solver .cpp file")
    .requiredOption("-p, --pid <pid>", "Luogu pid recorded in the note title, e.g. P4001")
    .action(async (solution: string, options: { pid: string }) => {
        const dir = findProblemByPid(globalThis.projectRoot, options.pid);
        const result = await validateSolution(dir, solution);
        result.cases.forEach((c, i) => {
            if (c.passed) {
                console.log(`  PASS  case ${i + 1}`);
            } else {
                const detail = c.error ?? `expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)}`;
                console.log(`  FAIL  case ${i + 1}: ${detail}`);
            }
        });
        const failed = result.cases.length - result.cases.filter((c) => c.passed).length;
        console.log(
            result.ok
                ? `All ${result.cases.length} case(s) passed for "${result.title}".`
                : `${failed} of ${result.cases.length} case(s) failed for "${result.title}".`
        );
        process.exitCode = result.ok ? 0 : 1;
    });

await program.parseAsync();
