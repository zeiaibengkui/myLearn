// Static site generator: render the knowledge base into <root>/build/.
// Every note becomes a full SEO-ready HTML page (markdown-it + katex, math
// rendered server-side): problem notes (problem.md + per-solution pages +
// copied source files) under build/problems/<category>/<title>/, freeform
// notes mirroring the nestable notes/ tree. build/index.html is a shell —
// Bootstrap + jQuery from CDN, a nav grouped by category, and a content
// iframe (jQuery swaps the iframe src; plain links are the no-JS fallback).
// The build tree is regenerated from scratch: build/ is removed first.

import fs from "node:fs";
import path from "node:path";
import markdownit from "markdown-it";
import mdKatex from "markdown-it-katex";
import classPlugin from "markdown-it-class";
import markdownItAnchor from "markdown-it-anchor";
import { listProblems } from "../ai/problems.ts";
import {
    listSolutions,
    listSourceFiles,
    notesDir,
    problemsDir,
    readProblemMd,
    readSolutionContent,
} from "../utils/persist.ts";

const BOOTSTRAP_CSS =
    "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css";
const BOOTSTRAP_JS =
    "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js";
// markdown-it-katex bundles katex@0.6 — keep the CSS in sync with it
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.6.0/dist/katex.min.css";
const JQUERY = "https://code.jquery.com/jquery-3.7.1.min.js";

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

/** One heading for the TOC: level (h1..h6), title (inline text stripped)
 *  and the slug used as the heading id — both come from markdown-it-anchor's
 *  callback, collected during a single render. The renderer is module-scoped
 *  and shared, so the list is reset per render. */
interface TocEntry {
    level: number;
    title: string;
    slug: string;
}
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

/** Dark-mode overrides the shell injects into iframe documents (scoped to
 *  `[data-bs-theme="dark"]`, so they are inert when the light theme is on;
 *  Base bootstrap swap happens via the `data-bs-theme` attribute itself). */
const DARK_CSS = [
    '[data-bs-theme="dark"] pre, [data-bs-theme="dark"] code, [data-bs-theme="dark"] .highlight { background-color: #26292e; color: #e9ecef; }',
    '[data-bs-theme="dark"] blockquote { border-color: #495057; }',
    '[data-bs-theme="dark"] td, [data-bs-theme="dark"] th { border-color: #37393d; }',
].join("\n");

/** JS the shell injects into the iframe: re-apply the theme when the shell
 *  toggles it (postMessage — also works when direct frame access is denied). */
const FRAME_THEME_JS = [
    'window.addEventListener("message", function (e) {',
    '  if (e && e.data && e.data.type === "mylearn-theme") {',
    '    document.documentElement.setAttribute("data-bs-theme", e.data.theme);',
    "  }",
    "});",
].join("\n");

export interface BuildReport {
    /** output directory (absolute) */
    dir: string;
    /** content pages written (the index.html shell is not counted) */
    pages: number;
}

/** HTML-escape for attribute/text contexts. */
function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

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

/** Relative link from build/ root — encode each path segment (paths with
 *  `/` included) so titles with spaces/`#`/`?` survive as hrefs; files on
 *  disk stay spelled as authored. */
function hrefFor(...segments: string[]): string {
    return segments
        .map(s => s.split("/").map(encodeURIComponent).join("/"))
        .join("/");
}

/** Full HTML document: title + description meta (SEO head), CDN styles. */
function pageHtml(
    title: string,
    description: string,
    body: string,
    chip?: string
): string {
    const safeTitle = esc(title);
    const safeDesc = esc(description);
    const badge = chip
        ? `<span class="badge text-bg-secondary ms-2">${esc(chip)}</span>`
        : "";
    return /* HTML */ `<!DOCTYPE html>
        <html lang="zh-CN">
            <head>
                <meta charset="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1" />
                <meta name="description" content="${safeDesc}" />
                <meta property="og:title" content="${safeTitle}" />
                <meta property="og:description" content="${safeDesc}" />
                <meta property="og:type" content="article" />
                <title>${safeTitle} – myLearn</title>
                <link rel="stylesheet" href="${BOOTSTRAP_CSS}" />
                <link rel="stylesheet" href="${KATEX_CSS}" />
            </head>
            <body class="bg-body-tertiary">
                <div class="container py-4">
                    <header class="d-flex align-items-center mb-3">
                        <h1 class="h3 mb-0">${safeTitle}</h1>
                        ${badge}
                    </header>
                    <main>${body}</main>
                </div>
            </body>
        </html> `;
}

/** all files under dir as rel paths, recursively (sorted) */
function walkFiles(dir: string, rel = ""): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(path.join(dir, rel)).sort()) {
        const child = rel ? `${rel}/${entry}` : entry;
        if (fs.statSync(path.join(dir, child)).isDirectory()) {
            out.push(...walkFiles(dir, child));
        } else {
            out.push(child);
        }
    }
    return out;
}

/** Title for a freeform note: first `# ` heading (markdown stripped), else the stem. */
function noteTitle(text: string, fallback: string): string {
    const m = text.match(/^\s{0,3}#\s+(.+)$/m);
    if (!m) return fallback;
    return m[1].replace(/[*_`]/g, "").trim() || fallback;
}

/** TOC list nested by heading level: a deeper level opens a new <ul>, a jump
 *  back closes them (entries are document-ordered). */
function tocHtml(entries: TocEntry[]): string {
    let out = "";
    const stack: number[] = [];
    for (const e of entries) {
        while (stack.length && stack[stack.length - 1] > e.level) {
            out += "</li></ul>";
            stack.pop();
        }
        if (!stack.length || stack[stack.length - 1] < e.level) {
            out += '<ul class="markdownIt-TOC">';
            stack.push(e.level);
        } else {
            out += "</li>";
        }
        out += `<li><a href="#${e.slug}">${esc(e.title)}</a>`;
    }
    while (stack.length) {
        out += "</li></ul>";
        stack.pop();
    }
    return out;
}

/** Render a markdown body. An explicit `@[toc]` marker — or one injected
 *  automatically when the note has ≥2 headings — is swapped for the nested
 *  TOC (the marker renders as a plain paragraph first). Without a marker no
 *  index is generated. */
function renderMarkdown(markdown: string): string {
    const headings = markdown.match(/^\s{0,3}#{1,6}\s/gm);
    if (!/^@\[toc\]\s*$/m.test(markdown) && headings && headings.length >= 2) {
        markdown = `@[toc]\n\n${markdown}`;
    }
    tocEntries = [];
    const body = md.render(markdown);
    return tocEntries.length
        ? body.replace(/<p>\s*@\[toc\]\s*<\/p>/g, tocHtml(tocEntries))
        : body;
}

function writeHtml(
    pagePath: string,
    title: string,
    description: string,
    body: string
): void {
    fs.mkdirSync(path.dirname(pagePath), { recursive: true });
    fs.writeFileSync(
        pagePath,
        pageHtml(title, seoDescription(description), body)
    );
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
        const links: string[] = [];
        for (const sol of listSolutions(note.dir)) {
            const solPath = path.join(note.dir, sol);
            const { title: solTitle, description: solDesc } =
                readSolutionContent(solPath);
            const solFile = sol.replace(/\.md$/, ".html");
            const href = hrefFor(solFile);
            writeHtml(
                path.join(outDir, solFile),
                solTitle,
                solDesc,
                renderMarkdown(solDesc)
            );
            pages++;
            links.push(
                `<li><a href="${href}">${esc(solTitle)}</a> <span class="text-muted small">${esc(href)}</span></li>`
            );
        }
        const solutionsBlock = links.length
            ? `<section class="mt-4"><h2 class="h5">Solutions</h2><ul>${links.join("\n")}</ul></section>`
            : "";

        // copied sources next to the note page
        for (const src of listSourceFiles(note.dir)) {
            fs.copyFileSync(path.join(note.dir, src), path.join(outDir, src));
        }

        writeHtml(
            path.join(outDir, "index.html"),
            title,
            description,
            renderMarkdown(description) + solutionsBlock
        );
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
        writeHtml(
            path.join(outRoot, "notes", `${rel.slice(0, -3)}.html`),
            noteTitle(text, path.basename(rel, ".md")),
            text,
            renderMarkdown(text)
        );
        pages++;
    }
    return pages;
}

/** One node of the explorer-style shell tree: folder (children) or note leaf. */
interface ShellNode {
    title: string;
    href?: string;
    children?: ShellNode[];
}

/** problems/<category>/<title> → a folder per category, note leaves. */
function problemTree(root: string): ShellNode[] {
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
function notesTree(root: string): ShellNode[] {
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

function countLeaves(nodes: ShellNode[]): number {
    return nodes.reduce(
        (n, x) => n + (x.href ? 1 : countLeaves(x.children ?? [])),
        0
    );
}

/** Explorer-style tree markup: bootstrap collapse folders, note links as
 *  leaves. Needs the bootstrap JS bundle (data-bs-toggle="collapse"). */
function renderTree(nodes: ShellNode[]): string {
    let nextId = 0;
    const render = (list: ShellNode[], openFirst = false): string =>
        list
            .map((n, i) => {
                if (n.children && n.children.length) {
                    const id = `t${nextId++}`;
                    const open = openFirst && i === 0;
                    return (
                        `<li><button type="button" class="btn btn-link btn-sm text-start w-100 text-truncate tree-toggle" data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="${open}">` +
                        `<span class="tree-caret">${open ? "▾" : "▸"}</span> ${esc(n.title)}</button>` +
                        `<ul class="list-unstyled ms-3 collapse${open ? " show" : ""}" id="${id}">${render(n.children)}</ul>` +
                        `</li>`
                    );
                }
                return `<li><a class="d-block text-truncate tree-link" href="${n.href}">${esc(n.title)}</a></li>`;
            })
            .join("");
    return `<ul ms-3 class="list-unstyled mb-0" id="tree">${render(nodes, true)}</ul>`;
}

/** Shell client: dark-mode toggle (persisted in localStorage, default from
 *  prefers-color-scheme), and iframe injection — on every frame load the
 *  shell inspects the frame document, injects the dark CSS + a theme
 *  listener script, and applies `data-bs-theme` directly (falls back to
 *  postMessage when the frame is cross-origin, e.g. opened via file://). */
const SHELL_SCRIPT = `
$(function () {
  var THEME_KEY = "mylearn-theme";
  var theme = localStorage.getItem(THEME_KEY);
  if (!theme) {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  var DARK_CSS = ${JSON.stringify(DARK_CSS)};

  function applyShell() {
    document.documentElement.setAttribute("data-bs-theme", theme);
    $("#themeToggle").text(theme === "dark" ? "light ☀" : "dark 🌙");
  }
  function injectFrame(frame) {
    var doc, win;
    try {
      doc = frame.contentDocument;
      win = frame.contentWindow;
    } catch (e) {
      return; // cross-origin frame — the shell theme still applies
    }
    if (!doc || !win) return;
    var style = doc.getElementById("mylearn-theme-css");
    if (!style) {
      style = doc.createElement("style");
      style.id = "mylearn-theme-css";
      doc.head.appendChild(style);
    }
    style.textContent = DARK_CSS; // rules are [data-bs-theme="dark"]-scoped
    if (!win.__myLearnThemeFrame) {
      win.__myLearnThemeFrame = true;
      var js = doc.createElement("script");
      js.textContent = ${JSON.stringify(FRAME_THEME_JS)};
      doc.head.appendChild(js);
    }
    doc.documentElement.setAttribute("data-bs-theme", theme);
  }

  $("#themeToggle").on("click", function () {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, theme);
    applyShell();
    var frame = document.getElementById("content");
    injectFrame(frame);
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({ type: "mylearn-theme", theme: theme }, "*");
    }
  });
  $("#content").on("load", function () { injectFrame(this); });

  function escH(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function setCrumbs(href) {
    var segs = (href || "").split("/").filter(Boolean).map(decodeURIComponent);
    var last = segs.length - 1;
    if (last >= 0 && /\.html$/.test(segs[last])) segs[last] = segs[last].replace(/\.html$/, "");
    if (last >= 0 && segs[last] === "index") segs.pop();
    if (!segs.length) {
      $("#crumbs").html('<li class="breadcrumb-item active">myLearn</li>');
      return;
    }
    $("#crumbs").html(
      segs.map(function (s, i) {
        var active = i === segs.length - 1;
        return '<li class="breadcrumb-item' + (active ? ' active" aria-current="page' : '') + '">' + escH(s) + "</li>";
      }).join("")
    );
  }
  $("#tree a").on("click", function (e) {
    e.preventDefault();
    var href = $(this).attr("href");
    $("#content").attr("src", href);
    $("#tree a").removeClass("active");
    $(this).addClass("active");
    setCrumbs(href);
  });
  $("#tree").on("click", ".tree-toggle", function () {
    var caret = $(this).find(".tree-caret");
    caret.text(caret.text() === "▸" ? "▾" : "▸");
  });

  applyShell();
  injectFrame(document.getElementById("content"));
  setCrumbs($("#content").attr("src"));
});
`;

/** The shell: Bootstrap nav (CDN) + explorer tree + breadcrumb + iframe. */
function buildIndexHtml(outRoot: string, tree: ShellNode[]): void {
    const treeHtml = countLeaves(tree) ? renderTree(tree) : "";
    const first = (function firstLeaf(nodes: ShellNode[]): string {
        for (const n of nodes) if (n.href) return n.href;
        for (const n of nodes) {
            const h = n.children ? firstLeaf(n.children) : "";
            if (h) return h;
        }
        return "";
    })(tree);
    const html = /* HTML */ `<!DOCTYPE html>
        <html lang="zh-CN">
            <head>
                <meta charset="utf-8" />
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1" />
                <meta
                    name="description"
                    content="myLearn knowledge base — problems and notes rendered as a static site" />
                <meta property="og:title" content="myLearn — knowledge base" />
                <meta property="og:type" content="website" />
                <title>myLearn — knowledge base</title>
                <link rel="stylesheet" href="${BOOTSTRAP_CSS}" />
                <style>
                    /* minimal shell chrome; colors come from bootstrap CSS variables */
                    #tree a {
                        padding: 0.15rem 0.5rem;
                        border-radius: 0.25rem;
                    }
                    #tree a:hover {
                        background: var(--bs-secondary-bg);
                    }
                    #tree .tree-toggle {
                        padding-left: 0.5rem;
                        box-shadow: none;
                    }
                </style>
            </head>
            <body class="bg-body-tertiary">
                <nav class="navbar navbar-dark bg-dark mb-3">
                    <div class="container-fluid">
                        <span class="navbar-brand">myLearn</span>
                        <span class="navbar-text small">knowledge base</span>
                        <button
                            id="themeToggle"
                            class="btn btn-sm btn-outline-light"
                            type="button">
                            dark 🌙
                        </button>
                    </div>
                </nav>
                <nav class="container-fluid mb-2" aria-label="breadcrumb">
                    <ol class="breadcrumb mb-0" id="crumbs"></ol>
                </nav>
                <div class="container-fluid">
                    <div class="row g-3">
                        <div class="col-3">
                            <div class="card">
                                <div class="card-body p-2">
                                    ${treeHtml ||
                                    '<div class="text-muted">nothing to show</div>'}
                                </div>
                            </div>
                        </div>
                        <div class="col-9">
                            <iframe
                                id="content"
                                class="w-100 rounded border"
                                src="${first}"
                                style="height: calc(100vh - 110px);"
                                title="content"></iframe>
                        </div>
                    </div>
                </div>
                <script src="${JQUERY}"></script>
                <script src="${BOOTSTRAP_JS}"></script>
                <script>
                    ${SHELL_SCRIPT};
                </script>
            </body>
        </html> `;
    fs.writeFileSync(path.join(outRoot, "index.html"), html);
}

/**
 * Generate the static site. Regenerates build/ from scratch (the directory
 * is removed first, so a deleted note disappears from the site).
 */
export function buildSite(root: string): BuildReport {
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
    buildIndexHtml(outRoot, tree);
    return { dir: outRoot, pages };
}
