// Site build: turn the knowledge base into build/ — the Vue SPA consumes it.
// Every note (problem statement, solution markdown, freeform note) is rendered
// server-side by the markdown-it chain (katex math, bootstrap classes, TOC,
// heading ids/permalink slugs — see markdown.ts) into ONE data file,
// build/notes.json, keyed by *route path* ("problems/luogu/P4001", the same
// path as its hash route). build/tree.json is the nav tree with route-path
// hrefs. No per-note HTML pages: the SPA (frontend/, built by vite — see
// frontend.ts) fetches both files and renders the note bodies with v-html;
// its index.html + assets/ are copied over build/ after the data files.
// Copied source files (.cpp etc.) land under build/problems/... for direct
// download, mirroring the source tree. build/ is regenerated from scratch —
// it is removed first, so deletions disappear from the site.

import fs from "node:fs";
import path from "node:path";
import { render } from "./h.ts";
import { Solutions } from "./components/solutions.ts";
import {
    notesTree,
    problemTree,
    type ShellNode,
} from "./components/tree.ts";
import {
    buildFrontend,
    copyDist,
    distDir,
    frontendDir,
    needsBuild,
} from "./frontend.ts";
import { linkify, renderMarkdown } from "./markdown.ts";
import { hrefFor, noteTitle, walkFiles } from "./util.ts";
import { listProblems } from "../ai/problems.ts";
import {
    listSolutions,
    listSourceFiles,
    notesDir,
    problemsDir,
    readProblemMd,
    readSolutionContent,
} from "../utils/persist.ts";

/** one note entry in build/notes.json — the body is pre-rendered HTML */
export interface NoteEntry {
    title: string;
    html: string;
}

export interface BuildReport {
    /** output directory (absolute) */
    dir: string;
    /** note entries written to notes.json */
    notes: number;
}

export interface BuildOptions {
    /** false → skip the SPA build/copy (tests assert the data files; no
     *  index.html is written) */
    useFrontend?: boolean;
    /** where the SPA was built to (default frontend/dist) — tests build
     *  into an isolated dir so they never touch the repo artifact */
    feOutDir?: string;
}

/** problem notes + per-solution entries; copies source files next to them */
function problemEntries(root: string, outRoot: string): Record<string, NoteEntry> {
    const entries: Record<string, NoteEntry> = {};
    for (const note of listProblems(root)) {
        const { title, description } = readProblemMd(note.dir);
        const relDir = path.relative(problemsDir(root), note.dir);
        const outDir = path.join(outRoot, "problems", relDir);
        fs.mkdirSync(outDir, { recursive: true });

        // solution entries, linked from the note body (hash-route hrefs)
        const links: { href: string; title: string }[] = [];
        for (const sol of listSolutions(note.dir)) {
            const solPath = path.join(note.dir, sol);
            const { title: solTitle, description: solDesc } =
                readSolutionContent(solPath);
            const route = `problems/${relDir}/${sol.replace(/\.md$/, "")}`;
            entries[route] = {
                title: solTitle,
                // relative links resolve against the note dir (like the old
                // page URL dir) — one level above the solution's own route
                html: linkify(renderMarkdown(solDesc), route, `problems/${relDir}`),
            };
            links.push({ href: `#/${hrefFor(...route.split("/"))}`, title: solTitle });
        }

        // copied sources for direct download
        for (const src of listSourceFiles(note.dir)) {
            fs.copyFileSync(path.join(note.dir, src), path.join(outDir, src));
        }

        const route = `problems/${relDir}`;
        entries[route] = {
            title,
            // the problem note's route IS its dir; relative links authored in
            // problem.md resolve against it (linkify's default noteDir)
            html:
                linkify(renderMarkdown(description), route) +
                render(Solutions({ links })),
        };
    }
    return entries;
}

/** route path minus the last segment — the note file's directory */
function routeDir(route: string): string {
    return route.includes("/") ? route.slice(0, route.lastIndexOf("/")) : "";
}

/** freeform notes: build/notes/<rel minus .md> entries mirroring the tree */
function freeformEntries(root: string): Record<string, NoteEntry> {
    const base = notesDir(root);
    if (!fs.existsSync(base)) return {};
    const entries: Record<string, NoteEntry> = {};
    for (const rel of walkFiles(base)) {
        if (!rel.endsWith(".md")) continue;
        const route = `notes/${rel.slice(0, -3)}`;
        const text = fs.readFileSync(path.join(base, rel), "utf-8");
        entries[route] = {
            title: noteTitle(text, path.basename(rel, ".md")),
            html: linkify(renderMarkdown(text), route, routeDir(route)),
        };
    }
    return entries;
}

/**
 * Generate the site. Regenerates build/ from scratch (the directory is
 * removed first, so a deleted note disappears from the site). All note
 * markup lands in notes.json — no per-note HTML pages — and the shell
 * index.html comes from the Vue SPA (frontend/dist, see frontend.ts).
 */
export async function buildSite(
    root: string,
    opts: BuildOptions = {}
): Promise<BuildReport> {
    const outRoot = path.join(root, "build");
    fs.rmSync(outRoot, { recursive: true, force: true });
    fs.mkdirSync(outRoot, { recursive: true });

    const entries: Record<string, NoteEntry> = {
        ...problemEntries(root, outRoot),
        ...freeformEntries(root),
    };
    fs.writeFileSync(path.join(outRoot, "notes.json"), JSON.stringify(entries));

    // nav tree: problems/<category>/<title> folders, then mirrored notes/
    const tree: ShellNode[] = [];
    const problems = problemTree(root);
    if (problems.length) tree.push({ title: "problems", children: problems });
    tree.push(...notesTree(root));
    fs.writeFileSync(path.join(outRoot, "tree.json"), JSON.stringify(tree));

    if (opts.useFrontend ?? true) {
        const feDir = frontendDir();
        try {
            if (needsBuild(feDir, opts.feOutDir)) {
                await buildFrontend(feDir, opts.feOutDir);
            }
        } catch (err) {
            // no vite (fresh clone) or a build failure — the data files above
            // are still written; warn but don't fail the site build
            console.error(
                `frontend build skipped: ${err instanceof Error ? err.message : err}`
            );
        }
        if (fs.existsSync(path.join(distDir(feDir, opts.feOutDir), "index.html"))) {
            copyDist(feDir, outRoot, opts.feOutDir);
        }
    }
    return { dir: outRoot, notes: Object.keys(entries).length };
}
