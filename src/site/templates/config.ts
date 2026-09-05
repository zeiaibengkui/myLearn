// myLearn VitePress site — copied into the project by `myLearn site setup`.
// The project root IS the docs root: problems/ + notes/ render in place, no
// generation step. Run vitepress from the project root (`myLearn site dev`,
// the package.json scripts, or the CI workflow) — the sidebar walker uses
// process.cwd().
//
// GitHub Pages: repo sites live under /<repo>/ — the scaffolded workflow
// sets MYLEARN_BASE to /<git repo name>/; user sites (<user>.github.io)
// serve from "/". Locally it stays "/" (vitepress dev/preview ignore base
// concerns for navigation).

import { defineConfig } from "vitepress";
import fs from "node:fs";
import path from "node:path";
import { buildSidebar } from "./sidebar.ts";

function base(): string {
    const raw = process.env.MYLEARN_BASE ?? "/";
    // normalize so the same build output works for a user-site repo
    return raw !== "/" && /\.github\.io\/?$/.test(raw) ? "/" : raw;
}

/** copy every non-markdown file under problems/ into the output, so hosted
 *  pages keep the solution sources / PDFs downloadable (VitePress copies only
 *  .vitepress/public/, and md-only files are handled by the page scan) */
function mirrorSources(root: string, dir: string, outDir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const src = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            mirrorSources(root, src, outDir);
            continue;
        }
        if (entry.name.startsWith(".") || entry.name.toLowerCase().endsWith(".md")) continue;
        const dest = path.join(outDir, path.relative(root, src));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

export default defineConfig({
    base: base(),
    title: "myLearn",
    description: "Personal competitive-programming knowledge base",
    markdown: {
        math: true, // $…$ / $$…$$ via markdown-it-mathjax3
    },
    cleanUrls: true,
    // .mylearn/ (project config + snapshot) is not content; the scaffolded
    // workflow/package.json dirs are not content either
    srcExclude: [".mylearn/**", "node_modules/**", ".github/**"],
    rewrites: {
        // every problem note is the index of its dir → /problems/<cat>/<title>/
        "problems/:category/:title/problem.md": "problems/:category/:title/index.md",
        "readme.md": "index.md",
    },
    themeConfig: {
        nav: [{ text: "Home", link: "/" }],
        sidebar: buildSidebar(process.cwd()),
        outline: { level: [2, 3] },
        search: { provider: "local" },
        // sidebar entries auto-follow the notes tree; only set explicit
        // values if you want a fixed order or extra top-level links
        docFooter: { prev: "Previous", next: "Next" },
    },
    buildEnd: (siteConfig) => {
        const root = process.cwd();
        const problems = path.join(root, "problems");
        if (fs.existsSync(problems)) mirrorSources(root, problems, siteConfig.outDir);
    },
});
