// Explorer-tree data: problemTree() mirrors problems/<category>/<title>,
// notesTree() mirrors the nestable notes/ tree — both as ShellNode leaves whose
// hrefs are *route paths* consumed by the Vue hash router (no .html suffix, no
// leading "#/" — the SPA prefixes that on push; every segment encoded).

import fs from "node:fs";
import path from "node:path";
import { listProblems } from "../../ai/problems.ts";
import { notesDir, problemsDir } from "../../utils/persist.ts";
import { hrefFor, noteTitle, walkFiles } from "../util.ts";

export interface ShellNode {
    title: string;
    href?: string;
    children?: ShellNode[];
}

/** problems/<category>/<title> → a folder per category, note leaves. */
export function problemTree(root: string): ShellNode[] {
    const nodes: ShellNode[] = [];
    for (const note of listProblems(root)) {
        let cat = nodes.find(n => n.title === note.category);
        if (!cat) {
            cat = { title: note.category, children: [] };
            nodes.push(cat);
        }
        cat.children!.push({
            title: note.title,
            href: hrefFor(
                "problems",
                path.relative(problemsDir(root), note.dir)
            ),
        });
    }
    return nodes;
}

/** notes/ mirrored: directories become folders, .md files leaves. */
export function notesTree(root: string): ShellNode[] {
    const base = notesDir(root);
    if (!fs.existsSync(base)) return [];
    const rootNode: ShellNode = { title: "notes", children: [] };
    for (const rel of walkFiles(base)) {
        const parts = rel.split("/");
        let cur = rootNode.children!;
        for (let i = 0; i < parts.length; i++) {
            const last = i === parts.length - 1;
            if (last && parts[i].endsWith(".md")) {
                const text = fs.readFileSync(path.join(base, rel), "utf-8");
                cur.push({
                    title: noteTitle(text, path.basename(parts[i], ".md")),
                    href: hrefFor("notes", rel.slice(0, -3)),
                });
            } else {
                let folder = cur.find(n => n.title === parts[i]);
                if (!folder) {
                    folder = { title: parts[i], children: [] };
                    cur.push(folder);
                }
                cur = folder.children!;
            }
        }
    }
    return rootNode.children!.length ? [rootNode] : [];
}
