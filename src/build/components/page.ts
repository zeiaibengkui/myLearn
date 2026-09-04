// Page component: the full HTML document for one note — SEO head
// (title/description/og meta), CDN styles, a header holding the title +
// optional chip, and the rendered content in <main>. The content itself is
// raw (markdown-rendered HTML passed in via raw()).

import { h, type Element, type Node } from "../h.ts";
import { BOOTSTRAP_CSS, KATEX_CSS } from "../cdn.ts";

export interface PageProps {
    title: string;
    description: string;
    content: Node;
    chip?: string;
}

export function Page({ title, description, content, chip }: PageProps): Element {
    return h("html", { lang: "zh-CN" },
        h("head", null,
            h("meta", { charset: "utf-8" }),
            h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
            h("meta", { name: "description", content: description }),
            h("meta", { property: "og:title", content: title }),
            h("meta", { property: "og:description", content: description }),
            h("meta", { property: "og:type", content: "article" }),
            h("title", null, `${title} – myLearn`),
            h("link", { rel: "stylesheet", href: BOOTSTRAP_CSS }),
            h("link", { rel: "stylesheet", href: KATEX_CSS })
        ),
        h("body", { class: "bg-body-tertiary" },
            h("div", { class: "container py-4" },
                h("header", { class: "d-flex align-items-center mb-3" },
                    h("h1", { class: "h3 mb-0" }, title),
                    chip ? h("span", { class: "badge text-bg-secondary ms-2" }, chip) : null
                ),
                h("main", null, content)
            )
        )
    );
}
