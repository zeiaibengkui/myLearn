// The markdown renderer: one shared markdown-it instance with the plugin
// chain (katex markdown-it-class bootstrap classes, markdown-it-anchor
// heading ids + permalinks) and the pieces that turn a markdown body into
// page content: slugify, the TOC collector, renderMarkdown, seoDescription.

import markdownit from "markdown-it";
import mdKatex from "markdown-it-katex";
import classPlugin from "markdown-it-class";
import markdownItAnchor from "markdown-it-anchor";
import { h, render } from "./h.ts";
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
 * Plain-text snippet for <meta name="description">: drop math (inline and
 * block) and fenced code, then strip markdown syntax (headings, emphasis,
 * links → text), collapse whitespace, truncate to ~160 chars.
 */
export function seoDescription(markdown: string): string {
    const text = markdown
        .replace(/\$\$[\s\S]*?\$\$/g, " ")
        .replace(/\$[^$]*\$/g, " ")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]*>/g, " ") // html tags (markdown-it keeps them escaped anyway)
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/[*_~`>$]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

/** Render a markdown body (raw HTML for Page content). An explicit `@[toc]`
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
