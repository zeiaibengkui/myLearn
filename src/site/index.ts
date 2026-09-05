// Site provider. Imported for its side effect (see arg.ts): registers the
// site CLI on the shared global program. VitePress renders the knowledge
// base markdown in place; these verbs run it pinned to the project.
//   site setup [--pages] [--force]
//   site dev | build | preview

import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { program } from "../utils/program.ts";
import { scaffoldSite, vitepressReachable } from "./setup.ts";

const require = createRequire(import.meta.url);

/** path to the vitepress CLI entry (bin from the package.json) */
export function vitepressBin(): string {
    const pkgPath = require.resolve("vitepress/package.json");
    const bin = require(pkgPath).bin;
    const rel = typeof bin === "string" ? bin : bin.vitepress;
    return path.join(path.dirname(pkgPath), rel);
}

const site = program
    .command("site")
    .description("Site provider: scaffold the VitePress site (.vitepress/) and run it — dev/build/preview, GitHub Pages ready")
    .action(() => {
        program.error("'site' needs a subcommand: setup | dev | build | preview");
    });

site
    .command("setup")
    .description("Copy the VitePress scaffold (.vitepress/) into this project")
    .option("--pages", "also write package.json + .github/workflows/site-pages.yml (GitHub Pages)")
    .option("--force", "overwrite files that already exist")
    .action((options: { pages?: boolean; force?: boolean }) => {
        scaffoldSite(globalThis.projectRoot, options);
    });

for (const verb of ["dev", "build", "preview"] as const) {
    site
        .command(verb)
        .description(`run \`vitepress ${verb}\` on this project`)
        // vitepress's own flags (--port, --host …) are passed through: they
        // show up as operands instead of commander rejecting them
        .argument("[rest...]", "extra arguments passed through to vitepress")
        .allowUnknownOption()
        .action((rest: string[]) => {
            if (!vitepressReachable(globalThis.projectRoot)) {
                program.error(
                    "vitepress is not installed for this project — run `pnpx tsx index.ts site setup` and follow its `pnpm add -D` hint (or run from inside the myLearn repo)"
                );
            }
            const child = spawn(
                process.execPath,
                [vitepressBin(), verb, ".", ...(rest ?? [])],
                { cwd: globalThis.projectRoot, stdio: "inherit" }
            );
            child.on("error", (err) => {
                console.error(`failed to start vitepress: ${err.message}`);
                process.exit(1);
            });
            child.on("exit", (code) => {
                process.exit(code ?? 1);
            });
        });
}
