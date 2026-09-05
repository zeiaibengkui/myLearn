// CLI wiring. Built-in verbs (init, add, maintain) live here; parts of the
// CLI belong to their domain provider — importing the provider index file
// registers its commands on the shared global program (side effect):
// `import "../provider/luogu/index.ts"` gives `myLearn luogu fetch ...`.

import path from "node:path";
import { program } from "./program.ts";
import initProject from "../project/init.ts";
import { buildSite } from "../build/index.ts";
import { buildServer } from "../build/server.ts";
import { watch, watchContinuous, type NoteDiff } from "../maintain/watch.ts";
import {
    maintain as maintainLuogu,
} from "../provider/luogu/maintain.ts";
import { openNote, resolveNote } from "../ai/problems.ts";
import { notesDir, problemsDir } from "./persist.ts";
import "../provider/luogu/index.ts";
import "../provider/pdf/index.ts";
import "../provider/ai/index.ts";

program
    .name("myLearn")
    .description("nodejs cli learning tool")
    .version("0.8.0");

// global -p: which note the command operates on. Providers that take it
// (`ai`, `luogu submit`, `maintain luogu`) define -p on their subcommand too,
// so both positions work: `-p <x> <verb>` and `<verb> ... -p <x>`.
program.option(
    "-p, --problem <problem>",
    "note path, or a pattern matching exactly one note in the problemset"
);

program
    .command("init")
    .description("Initialize a new project template")
    .argument("<dir>", "target directory")
    .action((dir: string) => {
        initProject(path.resolve(dir));
    });
program
    .command("build")
    .description("Generate a static site (build/) from problems/ and notes/ — markdown-it + katex, bootstrap/jquery CDN, iframe shell")
    .action(() => {
        const report = buildSite(globalThis.projectRoot);
        console.log(`built ${report.pages} page(s) → ${report.dir}`);
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
    .description("Compare problems/ (and notes/) against .mylearn/index/latest.json and update the snapshot (one-shot)")
    .action(() => {
        printDiff(watch(globalThis.projectRoot));
    });

// provider-scoped maintain: dispatches to provider/<provider>/maintain.ts's
// maintain(Problem)
maintain
    .command("luogu")
    .description("Re-validate the C++ sources saved in a Luogu note against its samples")
    .option("-p, --problem <problem>", "note path or pattern (exactly one match)")
    .action(async (options: { problem?: string }) => {
        const spec = options.problem ?? program.opts().problem;
        if (!spec) {
            program.error("'maintain luogu' needs -p <problem> (a note path or a pattern matching exactly one note)");
        }
        const note = openNote(globalThis.projectRoot, spec);
        const report = await maintainLuogu(note);
        if (!report.files.length) {
            console.log(
                `No saved C++ sources for "${report.title}" — first: myLearn luogu submit <solution.cpp> -p ${spec}`
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

// the long-running daemon: watcher + builder + live preview. Rebuilds build/
// on any change under problems/ or notes/ and pushes a reload to connected
// browsers; serves the site over http so the shell's iframe injection works.
program
    .command("daemon")
    .description("Watch + build + live server: rebuild build/ on change, serve it (default http://localhost:8000) and reload browsers")
    .option("--port <port>", "live server port", "8000")
    .action(async (options: { port: string }) => {
        const root = globalThis.projectRoot;
        const report = buildSite(root);
        console.log(`built ${report.pages} page(s) → ${report.dir}`);

        const live = buildServer(report.dir);
        const port = Number(options.port);
        try {
            await new Promise<void>((resolve, reject) => {
                live.server.once("error", reject);
                live.server.listen(port, "127.0.0.1", resolve);
            });
        } catch {
            program.error(
                `port ${port} is already in use — pick another: myLearn daemon --port <port>`
            );
        }

        printDiff(watch(root));
        const stop = watchContinuous(root, (diff) => {
            console.log(`[${new Date().toISOString()}] files changed:`);
            printDiff(diff);
            const r = buildSite(root);
            live.broadcast();
            console.log(`rebuilt ${r.pages} page(s) — browsers reloading`);
        });

        console.log(
            `daemon running (pid ${process.pid}) — serving http://localhost:${port}; watching ${problemsDir(root)} and ${notesDir(root)} — ctrl-c to stop`
        );
        process.on("SIGINT", () => {
            console.log("daemon stopped.");
            stop();
            live.close();
            // no process.exit: closing the watcher + server empties the event
            // loop and the process exits naturally, flushing stdout
        });
    });

await program.parseAsync();
