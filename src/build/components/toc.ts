// Nested TOC component: document-ordered heading entries are grouped by
// level (a deeper level nests under its parent, a jump back pops), then
// rendered as <ul class="markdownIt-TOC"> lists.

import { h, type Element, type Node } from "../h.ts";

export interface TocEntry {
    level: number;
    title: string;
    slug: string;
}

interface TocNode {
    entry: TocEntry;
    children: TocNode[];
}

function nest(entries: TocEntry[]): TocNode[] {
    const roots: TocNode[] = [];
    const stack: TocNode[] = [];
    for (const entry of entries) {
        const node: TocNode = { entry, children: [] };
        while (stack.length && stack[stack.length - 1].entry.level >= entry.level) {
            stack.pop();
        }
        if (stack.length) {
            stack[stack.length - 1].children.push(node);
        } else {
            roots.push(node);
        }
        stack.push(node);
    }
    return roots;
}

export function Toc({ entries }: { entries: TocEntry[] }): Node {
    const list = (nodes: TocNode[]): Element =>
        h("ul", { class: "markdownIt-TOC" },
            nodes.map(n =>
                h("li", null,
                    h("a", { href: `#${n.entry.slug}` }, n.entry.title),
                    n.children.length ? list(n.children) : null
                )
            )
        );
    const roots = nest(entries);
    return roots.length ? list(roots) : null;
}
