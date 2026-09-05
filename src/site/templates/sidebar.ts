// Site sidebar walker — copied verbatim into a project's .vitepress/ by
// `myLearn site setup`. Builds a nested sidebar straight from the disk tree:
//   problems/<category>/<title>/problem.md → link /problems/<category>/<title>/
//   notes/… nestable freeform notes
// Titles come from gray-matter `title` frontmatter (fallback: directory/file
// name). No external deps — runs inside the VitePress config process.

import fs from "node:fs";
import path from "node:path";

export interface SidebarItem {
    text: string;
    link?: string;
    items?: SidebarItem[];
}

/** problems/<cat>/<title>/ — a problem dir with at least one .md file */
function problemItems(root: string, dir: string): SidebarItem[] {
    const problems = path.join(dir, "problems");
    if (!fs.existsSync(problems)) return [];
    const items: SidebarItem[] = [];
    for (const category of fs.readdirSync(problems).sort()) {
        const catDir = path.join(problems, category);
        const catItems = fs
            .readdirSync(catDir)
            // category readmes are not problem notes; files are skipped
            .filter((e) => e.toLowerCase() !== "readme.md")
            .filter((e) => hasMd(path.join(catDir, e)))
            .sort()
            .map((title) => problemItem(root, path.join(catDir, title)));
        if (catItems.length) items.push({ text: category, items: catItems });
    }
    return items;
}

function hasMd(dir: string): boolean {
    if (!fs.existsSync(dir)) return false;
    if (!fs.statSync(dir).isDirectory()) return false;
    return fs
        .readdirSync(dir)
        .some((e) => e.toLowerCase().endsWith(".md"));
}

/** a problem dir: leaf = problem note (problem.md, else first .md), children = other .md files */
function problemItem(root: string, dir: string): SidebarItem {
    const mds = fs
        .readdirSync(dir)
        .filter((e) => e.toLowerCase().endsWith(".md"))
        .sort();
    const problemIdx = mds.findIndex((e) => e.toLowerCase() === "problem.md");
    const leaf = problemIdx === -1 ? mds[0] : mds[problemIdx];
    const leafPath = path.join(dir, leaf);
    const title = readTitle(
        leafPath,
        problemIdx === -1 ? path.basename(dir) : leaf.replace(/\.md$/i, "")
    );
    const item: SidebarItem = { text: title, link: toRoute(root, leafPath) };
    const rest = mds.filter((_, i) => i !== problemIdx && !routeIsDir(root, path.join(dir, mds[i])));
    if (rest.length) {
        item.items = rest.map((e) => {
            const p = path.join(dir, e);
            return { text: readTitle(p, e.replace(/\.md$/i, "")), link: toRoute(root, p) };
        });
    }
    return item;
}

/** every .md (and index dirs) under a notes/ style tree, recursively */
function notesItems(root: string, dir: string): SidebarItem[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs
        .readdirSync(dir)
        .sort((a, b) => {
            const aDir = fs.statSync(path.join(dir, a)).isDirectory();
            const bDir = fs.statSync(path.join(dir, b)).isDirectory();
            return Number(bDir) - Number(aDir) || a.localeCompare(b); // dirs first
        })
        .filter((e) => {
            const p = path.join(dir, e);
            try {
                return fs.statSync(p).isDirectory() || e.toLowerCase().endsWith(".md");
            } catch {
                return false;
            }
        });
    const items: SidebarItem[] = [];
    for (const e of entries) {
        const p = path.join(dir, e);
        if (fs.statSync(p).isDirectory()) {
            const sub = notesItems(root, p);
            if (sub.length) items.push({ text: e, items: sub });
        } else if (e.toLowerCase() === "index.md") {
            // index.md is its dir — text = the dir name, link the dir route
            items.push({ text: path.basename(dir), link: toRoute(root, p) });
        } else {
            items.push({ text: readTitle(p, e.replace(/\.md$/i, "")), link: toRoute(root, p) });
        }
    }
    return items;
}

/**
 * VitePress sidebar config: ONE "/" key with the combined tree, so both
 * sections are visible on every route (problems pages / notes pages / home) —
 * with per-section keys VitePress scopes a page to its section and the other
 * one disappears.
 */
export function buildSidebar(root: string): Record<string, SidebarItem[]> {
    const problems = problemItems(root, root);
    const notes = notesItems(root, path.join(root, "notes"));
    return { "/": [...problems, ...notes] };
}

/** source file → route: index.md/problem.md resolve to their dir ("/x/y/") */
function toRoute(root: string, file: string): string {
    let rel = path.relative(root, file).replaceAll(path.sep, "/").replace(/\.md$/i, "");
    let isDir = false;
    for (const suffix of ["/index", "/problem"]) {
        if (rel.endsWith(suffix)) {
            rel = rel.slice(0, -suffix.length);
            isDir = true;
            break;
        }
    }
    return "/" + rel + (isDir ? "/" : "");
}

function routeIsDir(root: string, file: string): boolean {
    return toRoute(root, file).endsWith("/");
}

function readTitle(file: string, fallback: string): string {
    try {
        const head = fs.readFileSync(file, "utf-8").slice(0, 400);
        const m = /^title:\s*(.+)$/m.exec(head);
        if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch {
        // unreadable file — fall back to the name
    }
    return fallback;
}
