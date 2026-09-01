// CLI wiring. Built-in verbs (init, add, maintain) live here; parts of the
// CLI belong to their domain provider — importing the provider index file
// registers its commands on the shared global program (side effect):
// `import "../provider/luogu/index.ts"` gives `myLearn luogu fetch ...`.

import path from "node:path";
import { program } from "./program.ts";
import initProject from "../project/init.ts";
import { fetchProblem } from "../fetch/index.ts";
import { openProblem } from "./noteFile.ts";
import { watch, watchContinuous, type NoteDiff } from "../maintain/watch.ts";
import {
    findProblemByPid,
    maintain as maintainLuogu,
} from "../provider/luogu/maintain.ts";
import "../provider/luogu/index.ts";

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
    .description("Import a source (file or Luogu problem URL) as a problem (fetchers auto-detect)")
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
    .description("Maintain the knowledge base: detect changes, re-validate saved solutions")
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

// provider-scoped maintain: dispatches to provider/<provider>/maintain.ts's
// maintain(Problem)
maintain
    .command("luogu")
    .description("Re-validate the C++ sources saved in a Luogu note against its samples")
    .requiredOption("-p, --pid <pid>", "Luogu pid recorded in the note title, e.g. P4001")
    .action(async (options: { pid: string }) => {
        const dir = findProblemByPid(globalThis.projectRoot, options.pid);
        const report = await maintainLuogu(openProblem(dir));
        if (!report.files.length) {
            console.log(
                `No saved C++ sources for "${report.title}" — first: myLearn luogu submit <solution.cpp> -p ${options.pid}`
            );
            process.exitCode = 1;
            return;
        }
        for (const f of report.files) {
            if (f.ok) {
                console.log(`  PASS  ${f.file}`);
            } else {
                const failed = f.cases.find((c) => !c.passed);
                console.log(
                    `  FAIL  ${f.file}: ${
                        f.error ??
                        (failed
                            ? `expected ${JSON.stringify(failed.expected)}, got ${JSON.stringify(failed.actual)}`
                            : "no case passed")
                    }`
                );
            }
        }
        console.log(
            report.ok
                ? `All saved solutions for "${report.title}" pass.`
                : "Some saved solutions fail."
        );
        process.exitCode = report.ok ? 0 : 1;
    });

await program.parseAsync();
