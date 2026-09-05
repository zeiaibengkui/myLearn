// Static site generator: render the knowledge base into <root>/build/.
// Every note becomes a full SEO-ready HTML page (markdown-it + katex, math
// rendered server-side): problem notes (problem.md + per-solution pages +
// copied source files) under build/problems/<category>/<title>/, freeform
// notes mirroring the nestable notes/ tree. build/index.html is the shell —
// Bootstrap + jQuery from CDN, a nav grouped by category, and a content
// iframe (jQuery swaps the iframe src; plain links are the no-JS fallback).
// The build tree is regenerated from scratch: build/ is removed first.
//
// Markup is composed React-style: components in components/*.ts build
// elements via h() (see h.ts); this module is the orchestrator — reads the
// knowledge base, then renders each page/shell through the components.

import fs from "node:fs";
import path from "node:path";
import { h, raw, render, type Node } from "./h.ts";
import { Page } from "./components/page.ts";
import { Shell } from "./components/shell.ts";
import { Tree } from "./components/tree.ts";
import { Solutions } from "./components/solutions.ts";
import {
    countLeaves,
    firstLeaf,
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
import { renderMarkdown, seoDescription } from "./markdown.ts";
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

export interface BuildReport {
    /** output directory (absolute) */
    dir: string;
    /** content pages written (the index.html shell is not counted) */
    pages: number;
}

export interface BuildOptions {
    /** false → render the h.ts fallback shell even when frontend/dist
     *  exists (tests); true (default) → SPA when built, fallback otherwise */
    useFrontend?: boolean;
    /** where the SPA was built to (default frontend/dist) — tests build
     *  into an isolated dir so they never touch the repo artifact */
    feOutDir?: string;
}

export { seoDescription };

/** Write a rendered document to pagePath (parents created). */
function writeSite(pagePath: string, node: Node): void {
    fs.mkdirSync(path.dirname(pagePath), { recursive: true });
    fs.writeFileSync(pagePath, render(node));
}

/** problem notes + their solution pages + copied sources */
function buildProblemNotes(root: string, outRoot: string): number {
    let pages = 0;
    for (const note of listProblems(root)) {
        const { title, description } = readProblemMd(note.dir);
        const relDir = path.relative(problemsDir(root), note.dir);
        const outDir = path.join(outRoot, "problems", relDir);
        fs.mkdirSync(outDir, { recursive: true });

        // solution pages, linked from the note page (relative hrefs)
        const links: { href: string; title: string }[] = [];
        for (const sol of listSolutions(note.dir)) {
            const solPath = path.join(note.dir, sol);
            const { title: solTitle, description: solDesc } =
                readSolutionContent(solPath);
            const solFile = sol.replace(/\.md$/, ".html");
            writeSite(path.join(outDir, solFile), h(Page, {
                title: solTitle,
                description: seoDescription(solDesc),
                content: raw(renderMarkdown(solDesc)),
            }));
            pages++;
            links.push({ href: hrefFor(solFile), title: solTitle });
        }

        // copied sources next to the note page
        for (const src of listSourceFiles(note.dir)) {
            fs.copyFileSync(path.join(note.dir, src), path.join(outDir, src));
        }

        writeSite(path.join(outDir, "index.html"), h(Page, {
            title,
            description: seoDescription(description),
            content: [
                raw(renderMarkdown(description)),
                h(Solutions, { links }),
            ],
        }));
        pages++;
    }
    return pages;
}

/** freeform notes: build/notes/<rel minus .md>.html mirroring the tree */
function buildFreeformNotes(root: string, outRoot: string): number {
    const base = notesDir(root);
    if (!fs.existsSync(base)) return 0;
    let pages = 0;
    for (const rel of walkFiles(base)) {
        if (!rel.endsWith(".md")) continue;
        const text = fs.readFileSync(path.join(base, rel), "utf-8");
        writeSite(path.join(outRoot, "notes", `${rel.slice(0, -3)}.html`), h(Page, {
            title: noteTitle(text, path.basename(rel, ".md")),
            description: seoDescription(text),
            content: raw(renderMarkdown(text)),
        }));
        pages++;
    }
    return pages;
}

function shellMarkup(tree: ShellNode[]): Node {
    return h(Shell, {
        tree: countLeaves(tree) ? h(Tree, { nodes: tree }) : null,
        first: firstLeaf(tree),
    });
}

/**
 * Generate the static site. Regenerates build/ from scratch (the directory
 * is removed first, so a deleted note disappears from the site). build/
 * index.html is the shell: the Vue SPA (frontend/dist, see frontend.ts) when
 * it is built, otherwise the h.ts fallback shell; build/tree.json carries the
 * same tree the SPA renders, fetched by the browser at runtime.
 */
export async function buildSite(
    root: string,
    opts: BuildOptions = {}
): Promise<BuildReport> {
    const outRoot = path.join(root, "build");
    fs.rmSync(outRoot, { recursive: true, force: true });
    fs.mkdirSync(outRoot, { recursive: true });

    let pages = buildProblemNotes(root, outRoot);
    pages += buildFreeformNotes(root, outRoot);

    // shell tree: problems/<category>/<title> folders, then mirrored notes/
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
            // no vite (fresh clone) or a build failure — the fallback shell
            // below still produces a working site
            console.error(
                `frontend build skipped: ${err instanceof Error ? err.message : err}`
            );
        }
        if (fs.existsSync(path.join(distDir(feDir, opts.feOutDir), "index.html"))) {
            copyDist(feDir, outRoot, opts.feOutDir);
        } else {
            writeSite(path.join(outRoot, "index.html"), shellMarkup(tree));
        }
    } else {
        writeSite(path.join(outRoot, "index.html"), shellMarkup(tree));
    }
    return { dir: outRoot, pages };
}
