// `init --online` — the site scaffold is not shipped with the CLI: a
// *configured* knowledge base (its .vitepress config/theme, SEO and comment
// settings, its Pages workflow) is the template. Clone that KB shallowly into
// a temp dir and copy only the site files — never its content.
//
// Requires git (external dependency, like g++/markitdown elsewhere).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** where `init --online` fetches the site scaffold from when no repo is given */
export const DEFAULT_SITE_REPO = "https://github.com/zeiaibengkui/mylearn-kb";

/** site files at the remote root — the content (problems/, notes/, readme) stays there */
const ROOT_FILES = ["package.json", "pnpm-workspace.yaml"];
/** build output / installs never travel with the scaffold */
const SKIP = new Set(["cache", "dist", "node_modules", ".temp"]);

export interface CloneOptions {
    /** overwrite files that already exist */
    force?: boolean;
}

/**
 * Copy the site files of a remote knowledge base into `root`:
 * every `.vitepress/**` file (minus build output), the build/CI files it has
 * (`package.json`, `pnpm-workspace.yaml`, `.github/workflows/*`) and nothing
 * else. Idempotent: existing files are kept unless `force` is set.
 */
export function cloneSite(root: string, repo: string, options: CloneOptions = {}): void {
    const { force = false } = options;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-clone-"));
    try {
        const clone = path.join(tmp, "kb");
        try {
            execFileSync("git", ["clone", "--depth", "1", "--quiet", repo, clone], {
                stdio: ["ignore", "ignore", "pipe"],
            });
        } catch (error) {
            const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
            throw new Error(
                `git clone ${repo} failed` + (stderr ? `:\n${stderr}` : "") +
                    `\n(is git installed, and the repository public?)`
            );
        }
        const source = path.join(clone, ".vitepress");
        if (!fs.existsSync(source)) {
            throw new Error(`${repo} has no .vitepress/ — not a myLearn site checkout?`);
        }

        const written: string[] = [];
        const skipped: string[] = [];
        const copy = (from: string, dest: string, transform?: (text: string) => string): void => {
            const target = path.join(root, dest);
            if (fs.existsSync(target) && !force) {
                skipped.push(dest);
                return;
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const text = fs.readFileSync(from, "utf-8");
            fs.writeFileSync(target, transform ? transform(text) : text);
            written.push(dest);
        };

        const walk = (dir: string, rel: string): void => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (SKIP.has(entry.name)) continue;
                const from = path.join(dir, entry.name);
                const child = rel ? `${rel}/${entry.name}` : entry.name;
                if (entry.isDirectory()) walk(from, child);
                else copy(from, `.vitepress/${child}`);
            }
        };
        walk(source, "");

        const name = path.basename(path.resolve(root));
        for (const rel of ROOT_FILES) {
            const from = path.join(clone, rel);
            if (!fs.existsSync(from)) continue;
            copy(from, rel, (text) =>
                // the copied package.json belongs to this project now
                rel === "package.json"
                    ? text.replace(/("name"\s*:\s*")[^"]*"/, `$1${name}"`)
                    : text
            );
        }
        const workflows = path.join(clone, ".github", "workflows");
        const hasWorkflow = fs.existsSync(workflows);
        if (hasWorkflow) {
            for (const entry of fs.readdirSync(workflows, { withFileTypes: true })) {
                if (entry.isFile()) {
                    copy(path.join(workflows, entry.name), `.github/workflows/${entry.name}`);
                }
            }
        }

        console.log(`site scaffold cloned from ${repo} (${written.length} file(s)):`);
        for (const f of written) console.log(`  + ${f}`);
        if (skipped.length) console.log(`kept existing: ${skipped.join(", ")}`);
        printHints(root, hasWorkflow);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

/** how to run the clone: the remote's package.json carries the site scripts */
function printHints(root: string, hasWorkflow: boolean): void {
    const pkg = path.join(root, "package.json");
    if (!fs.existsSync(pkg)) {
        console.log(
            `\nno package.json in the remote — add vitepress yourself:\n` +
                `  cd ${root} && pnpm add -D vitepress markdown-it-mathjax3`
        );
        return;
    }
    let scripts: string[] = [];
    try {
        scripts = Object.keys(JSON.parse(fs.readFileSync(pkg, "utf-8")).scripts ?? {});
    } catch {
        // unreadable package.json — the install hint below is all we can give
    }
    console.log(
        `\nnext: cd ${root} && pnpm install` +
            (hasWorkflow ? `   # writes pnpm-lock.yaml, commit it (the Pages CI cache needs it)` : "")
    );
    if (scripts.length) console.log(`then: ${scripts.map((s) => `pnpm ${s}`).join(" | ")}`);
}
