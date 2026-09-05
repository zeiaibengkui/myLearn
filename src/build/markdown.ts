// The markdown renderer: one shared markdown-it instance with the plugin
// chain (katex, markdown-it-class bootstrap classes, markdown-it-anchor
// heading ids + permalinks) and the pieces that turn a markdown body into
// note content: slugify, the TOC collector, renderMarkdown, and linkify
// (rewrites body hrefs for the Vue hash router).

import markdownit from "markdown-it";
import mdKatex from "markdown-it-katex";
import classPlugin from "markdown-it-class";
import markdownItAnchor from "markdown-it-anchor";
import { h, render } from "./h.ts";
import { hrefFor } from "./util.ts";
import { Toc, type TocEntry } from "./components/toc.ts";

/** Heading id slug: lowercase, spaces → dashes, drop everything but
 *  letters/digits/dashes. The plugin default URI-encodes CJK; ours keeps the
 *  original characters, so Chinese anchors read naturally. */
function slugify(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}-]+/gu, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/** Headings collected by the anchor plugin's callback during the current
 *  render (the renderer is module-scoped and shared, so it resets per render). */
let tocEntries: TocEntry[] = [];

// one renderer for the whole build. markdown-it-class attaches bootstrap
// classes to rendered tags (keyed by token.tag); markdown-it-anchor gives
// headings ids + GitHub-style # permalinks, and feeds the TOC through its
// callback (our slugify keeps CJK — the plugin default URI-encodes it).
const md = markdownit({ html: false, linkify: true })
    .use(mdKatex)
    .use(classPlugin, {
        table: ["table", "table-striped"],
        img: "img-fluid",
        blockquote: "blockquote",
    })
    .use(markdownItAnchor, {
        slugify,
        permalink: markdownItAnchor.permalink.ariaHidden({ placement: "before" }),
        callback(token, info) {
            tocEntries.push({
                level: Number(token.tag.slice(1)),
                title: info.title,
                slug: info.slug,
            });
        },
    });

/**
 * Rewrite a rendered note body for the Vue hash router (the body is v-html'd
 * inside the SPA document, so a link is a *route* link, not a relative URL):
 *  - `href="#slug"` (TOC nodes, heading permalinks) becomes the current
 *    note's route plus the fragment: `href="#/problems/luogu/P4001#slug"`;
 *  - relative links ending in `.md`/`.html` (authored cross-note links, e.g.
 *    `[sol](P4001 题解.html)`) become route links to the resolved note,
 *    resolved against the current route's directory, suffix stripped;
 *  - everything else (absolute URLs, `#/...` route links, images) is left
 *    alone.
 */
export function linkify(html: string, routePath: string, noteDir = routePath): string {
    const routeHref = `#/${hrefFor(...routePath.split("/"))}`;
    return html.replace(/(\shref=")([^"]*)(")/g, (m, pre: string, href: string, post: string) => {
        if (href.startsWith("#")) {
            if (href === "#" || href.startsWith("#/")) return m;
            return `${pre}${routeHref}${href}${post}`;
        }
        if (!href.endsWith(".md") && !href.endsWith(".html")) return m;
        if (/^[a-z]+:/i.test(href) || href.startsWith("/")) return m; // absolute
        // markdown-it encodes spaces in destinations — normalize, then
        // re-encode per segment via hrefFor
        const target = decodeURIComponent(href).replace(/\.(md|html)$/, "");
        const resolved = noteDir ? `${noteDir}/${target}` : target;
        return `${pre}#/${hrefFor(...resolved.split("/"))}${post}`;
    });
}

/** Render a markdown body (raw HTML for NoteView). An explicit `@[toc]`
 *  marker — or one injected automatically when the note has ≥2 headings — is
 *  swapped for the nested TOC (the marker renders as a plain paragraph
 *  first). Without a marker no index is generated. */
export function renderMarkdown(markdown: string): string {
    const headings = markdown.match(/^\s{0,3}#{1,6}\s/gm);
    if (!/^@\[toc\]\s*$/m.test(markdown) && headings && headings.length >= 2) {
        markdown = `@[toc]\n\n${markdown}`;
    }
    tocEntries = [];
    const body = md.render(markdown);
    return tocEntries.length
        ? body.replace(
            /<p>\s*@\[toc\]\s*<\/p>/g,
            render(h(Toc, { entries: tocEntries }))
        )
        : body;
}
