// Explorer-style tree component (bootstrap collapse folders, note-link
// leaves) plus the data from which it is assembled: problemTree() mirrors
// problems/<category>/<title>, notesTree() mirrors the nestable notes/ tree.

import fs from "node:fs";
import path from "node:path";
import { h, type Element } from "../h.ts";
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
                path.relative(problemsDir(root), note.dir),
                "index.html"
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
                    href: hrefFor("notes", `${rel.slice(0, -3)}.html`),
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

export function countLeaves(nodes: ShellNode[]): number {
    return nodes.reduce(
        (n, x) => n + (x.href ? 1 : countLeaves(x.children ?? [])),
        0
    );
}

/** href of the first leaf (depth-first) — the iframe's default content. */
export function firstLeaf(nodes: ShellNode[]): string {
    for (const n of nodes) if (n.href) return n.href;
    for (const n of nodes) {
        const h = n.children ? firstLeaf(n.children) : "";
        if (h) return h;
    }
    return "";
}

export function Tree({ nodes }: { nodes: ShellNode[] }): Element {
    let nextId = 0;
    const render = (list: ShellNode[], openFirst = false): Element[] =>
        list.map((n, i) => {
            if (n.children && n.children.length) {
                const id = `t${nextId++}`;
                const open = openFirst && i === 0;
                return h("li", null,
                    h("button", {
                        type: "button",
                        class: "btn btn-link btn-sm text-start w-100 text-truncate tree-toggle",
                        "data-bs-toggle": "collapse",
                        "data-bs-target": `#${id}`,
                        "aria-expanded": open ? "true" : "false",
                    },
                        h("i", {
                            class: "tree-caret bi " + (open ? "bi-chevron-down" : "bi-chevron-right"),
                            "aria-hidden": "true",
                        }),
                        h("i", { class: "bi bi-folder2 mx-1", "aria-hidden": "true" }),
                        n.title
                    ),
                    h("ul", {
                        class: `list-unstyled ms-3 collapse${open ? " show" : ""}`,
                        id,
                    }, render(n.children))
                );
            }
            return h("li", null,
                h("a", { class: "d-block text-truncate tree-link", href: n.href }, n.title)
            );
        });
    return h("ul", { class: "list-unstyled mb-0", id: "tree" }, render(nodes, true));
}
