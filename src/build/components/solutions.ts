// "Solutions" section under a problem note page — one link per solution
// page, with the href shown in muted text (mirrors the build layout).

import { h, type Node } from "../h.ts";

export interface SolutionLink {
    href: string;
    title: string;
}

export function Solutions({ links }: { links: SolutionLink[] }): Node {
    if (!links.length) return null;
    return h("section", { class: "mt-4" },
        h("h2", { class: "h5" }, "Solutions"),
        h("ul", null,
            links.map(l =>
                h("li", null,
                    h("a", { href: l.href }, l.title),
                    " ",
                    h("span", { class: "text-muted small" }, l.href)
                )
            )
        )
    );
}
