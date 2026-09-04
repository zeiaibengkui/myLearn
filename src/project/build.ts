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
import { listProblems } from "../ai/problems.ts";
import {
    listSolutions,
    listSourceFiles,
    notesDir,
    problemsDir,
    readProblemMd,
    readSolutionContent,
} from "../utils/persist.ts";

const BOOTSTRAP_CSS = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css";
// markdown-it-katex bundles katex@0.6 — keep the CSS in sync with it
const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex@0.6.0/dist/katex.min.css";
const JQUERY = "https://code.jquery.com/jquery-3.7.1.min.js";

// one renderer for the whole build (plugins are per instance)
const md = markdownit({ html: false, linkify: true }).use(mdKatex);

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
    '  }',
    '});',
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
        .map((s) => s.split("/").map(encodeURIComponent).join("/"))
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
    const badge = chip ? `<span class="badge text-bg-secondary ms-2">${esc(chip)}</span>` : "";
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${safeDesc}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:type" content="article">
<title>${safeTitle} – myLearn</title>
<link rel="stylesheet" href="${BOOTSTRAP_CSS}">
<link rel="stylesheet" href="${KATEX_CSS}">
</head>
<body class="bg-body-tertiary">
<div class="container py-4">
<header class="d-flex align-items-center mb-3">
    <h1 class="h3 mb-0">${safeTitle}</h1>${badge}
</header>
<main>
${body}
</main>
</div>
</body>
</html>
`;
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

function writeHtml(pagePath: string, title: string, description: string, body: string): void {
    fs.mkdirSync(path.dirname(pagePath), { recursive: true });
    fs.writeFileSync(pagePath, pageHtml(title, seoDescription(description), body));
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
            const { title: solTitle, description: solDesc } = readSolutionContent(solPath);
            const solFile = sol.replace(/\.md$/, ".html");
            const href = hrefFor(solFile);
            writeHtml(path.join(outDir, solFile), solTitle, solDesc, md.render(solDesc));
            pages++;
            links.push(`<li><a href="${href}">${esc(solTitle)}</a> <span class="text-muted small">${esc(href)}</span></li>`);
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
            md.render(description) + solutionsBlock
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
            md.render(text)
        );
        pages++;
    }
    return pages;
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
  $("#nav a").on("click", function (e) {
    e.preventDefault();
    $("#content").attr("src", $(this).attr("href"));
    $("#nav a").removeClass("active");
    $(this).addClass("active");
  });

  applyShell();
  injectFrame(document.getElementById("content"));
});
`;

/** The shell: Bootstrap nav (CDN) + grouped links + content iframe. */
function buildIndexHtml(outRoot: string, groups: { group: string; title: string; href: string; chip?: string }[]): void {
    let current = "";
    const items = groups
        .map((n) => {
            const head =
                n.group !== current
                    ? `<h6 class="text-uppercase small text-secondary pt-3 ps-2 mb-1">${esc(n.group)}</h6>`
                    : "";
            current = n.group;
            return head + `<a class="list-group-item list-group-item-action" href="${n.href}">${esc(n.title)}${n.chip ? ` <span class="small text-muted">${esc(n.chip)}</span>` : ""}</a>`;
        })
        .join("\n");
    const first = groups[0]?.href ?? "";
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="myLearn knowledge base — problems and notes rendered as a static site">
<meta property="og:title" content="myLearn — knowledge base">
<meta property="og:type" content="website">
<title>myLearn — knowledge base</title>
<link rel="stylesheet" href="${BOOTSTRAP_CSS}">
</head>
<body class="bg-body-tertiary">
<nav class="navbar navbar-dark bg-dark mb-3">
    <div class="container-fluid">
        <span class="navbar-brand">myLearn</span>
        <span class="navbar-text small">knowledge base</span>
        <button id="themeToggle" class="btn btn-sm btn-outline-light" type="button">dark 🌙</button>
    </div>
</nav>
<div class="container-fluid">
    <div class="row g-3">
        <div class="col-3">
            <div class="card">
                <div class="card-body p-2">
                    <div class="list-group list-group-flush" id="nav">${items || '<div class="list-group-item text-muted">nothing to show</div>'}</div>
                </div>
            </div>
        </div>
        <div class="col-9">
            <iframe id="content" class="w-100 rounded border" src="${first}" style="height: calc(100vh - 110px);" title="content"></iframe>
        </div>
    </div>
</div>
<script src="${JQUERY}"></script>
<script>
${SHELL_SCRIPT}
</script>
</body>
</html>
`;
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

    // shell nav: one group per category (problem notes), then Notes
    const groups: { group: string; title: string; href: string; chip?: string }[] = [];
    for (const note of listProblems(root)) {
        groups.push({
            group: note.category,
            title: note.title,
            href: hrefFor("problems", path.relative(problemsDir(root), note.dir), "index.html"),
        });
    }
    const notesBase = notesDir(root);
    if (fs.existsSync(notesBase)) {
        for (const rel of walkFiles(notesBase)) {
            if (!rel.endsWith(".md")) continue;
            const text = fs.readFileSync(path.join(notesBase, rel), "utf-8");
            groups.push({
                group: "notes",
                title: noteTitle(text, path.basename(rel, ".md")),
                href: hrefFor("notes", `${rel.slice(0, -3)}.html`),
            });
        }
    }
    buildIndexHtml(outRoot, groups);
    return { dir: outRoot, pages };
}
