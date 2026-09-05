// Scaffold the VitePress site (`.vitepress/`) into a knowledge-base project
// from the repo's templates, plus optional GitHub Pages bits (package.json +
// workflow). Idempotent: existing files are kept unless force is set.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ScaffoldOptions {
    /** also write package.json + .github/workflows/site-pages.yml for GitHub Pages */
    pages?: boolean;
    /** overwrite files that already exist */
    force?: boolean;
}

function templateDir(): string {
    return fileURLToPath(new URL("./templates/", import.meta.url));
}

function templatePath(rel: string): string {
    return fileURLToPath(new URL(`./templates/${rel}`, import.meta.url));
}

/** every template file (rel), except the repo-only .vue type shim */
function templateFiles(): string[] {
    const out: string[] = [];
    const dir = templateDir();
    for (const e of fs.readdirSync(dir)) {
        const p = path.join(dir, e);
        out.push(
            ...(fs.statSync(p).isDirectory()
                ? fs.readdirSync(p).map((f) => `${e}/${f}`)
                : [e])
        );
    }
    return out.filter((f) => !f.endsWith("shims-vue.d.ts"));
}

/** template rel → destination rel in the project (undefined = pages-only/not copied) */
function destFor(rel: string): string | undefined {
    if (rel === "package.json" || rel === "workflows/site-pages.yml") return undefined;
    return `.vitepress/${rel}`; // config.ts, sidebar.ts, theme/*
}

/** true when vitepress is resolvable by walking up from root (installed in
 *  the project or an ancestor, e.g. the myLearn repo for in-repo projects) */
export function vitepressReachable(root: string): boolean {
    let dir = path.resolve(root);
    for (;;) {
        if (fs.existsSync(path.join(dir, "node_modules", "vitepress"))) return true;
        const parent = path.dirname(dir);
        if (parent === dir) return false;
        dir = parent;
    }
}

export function scaffoldSite(root: string, options: ScaffoldOptions = {}): void {
    const { pages = false, force = false } = options;
    const written: string[] = [];
    const skipped: string[] = [];

    const write = (dest: string, content: string): void => {
        const target = path.join(root, dest);
        if (fs.existsSync(target) && !force) {
            skipped.push(dest);
            return;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
        written.push(dest);
    };

    for (const rel of templateFiles()) {
        const dest = destFor(rel);
        if (dest) write(dest, fs.readFileSync(templatePath(rel), "utf-8"));
    }

    if (pages) {
        write(
            "package.json",
            fs
                .readFileSync(templatePath("package.json"), "utf-8")
                .replace("{{name}}", path.basename(path.resolve(root)))
        );
        write(
            path.join(".github", "workflows", "site-pages.yml"),
            fs.readFileSync(templatePath("workflows/site-pages.yml"), "utf-8")
        );
    }

    if (written.length) {
        console.log(`site scaffolded (${written.length} file(s)):`);
        for (const f of written) console.log(`  + ${f}`);
    }
    if (skipped.length) console.log(`kept existing: ${skipped.join(", ")}`);
    if (!vitepressReachable(root)) {
        console.log(
            `\nvitepress is not installed for this project — run:\n` +
                `  cd ${root} && pnpm add -D vitepress markdown-it-mathjax3\n` +
                `(or run from inside the myLearn repo checkout, where the CLI's install lives)`
        );
    }
}
