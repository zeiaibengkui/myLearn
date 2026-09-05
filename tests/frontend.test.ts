// SPA tests — the real repo frontend/ is built with vite (bundling from
// local node_modules only, no network/CDN) into an isolated outDir so the
// repo artifact frontend/dist is never touched by tests. Also unit-tests the
// build glue in src/build/frontend.ts (needsBuild/copyDist) and the buildSite
// SPA path (tree.json + notes.json + SPA index.html from an isolated feOutDir).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "vite";
import { buildSite } from "../src/build/index.ts";
import {
    copyDist,
    distDir,
    frontendDir,
    needsBuild,
} from "../src/build/frontend.ts";

function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "mylearn-frontend-test-"));
}

/** build the real SPA into an isolated dir (never the repo dist) */
async function buildTo(outDir: string): Promise<string> {
    const feDir = frontendDir();
    await build({
        root: feDir,
        configFile: path.join(feDir, "vite.config.ts"),
        build: { outDir, emptyOutDir: true },
    });
    return outDir;
}

describe("frontend build", () => {
    test("vite builds the SPA (offline, no CDN for bootstrap)", async () => {
        const out = await buildTo(path.join(tmpRoot(), "dist"));
        const index = fs.readFileSync(path.join(out, "index.html"), "utf-8");
        // vue mount point + relative hashed assets (base: "./")
        assert.ok(index.includes('<div id="app">'));
        assert.match(index, /<script[^>]+src="\.\/assets\/[^"]+\.js"/);
        // the icons font stays a CDN link; bootstrap is bundled instead
        assert.ok(index.includes("bootstrap-icons@1.11.3"));
        assert.ok(!index.includes("cdn.jsdelivr.net/npm/bootstrap@"));
        assert.ok(!index.includes("cdn.jsdelivr.net/npm/katex"));
        const assets = fs.readdirSync(path.join(out, "assets"));
        assert.ok(assets.some((a) => a.endsWith(".css")), "bundled bootstrap css");
        const js = assets
            .filter((a) => a.endsWith(".js"))
            .map((a) => fs.readFileSync(path.join(out, "assets", a), "utf-8"))
            .join("");
        const css = assets
            .filter((a) => a.endsWith(".css"))
            .map((a) => fs.readFileSync(path.join(out, "assets", a), "utf-8"))
            .join("");
        // data fetching + hash router + icon glyphs + theme plumbing
        assert.ok(js.includes("tree.json"));
        assert.ok(js.includes("notes.json"));
        assert.ok(js.includes(":note(.*)"), "hash router catch-all route");
        assert.ok(js.includes("bi-folder2"));
        assert.ok(js.includes("mylearn-theme"));
        // katex CSS bundled (must match the server-side katex version)
        assert.ok(css.includes(".katex"));
    });

    test("needsBuild: dist missing → true, dist newer → false, source edit → true", () => {
        const fe = tmpRoot();
        fs.mkdirSync(path.join(fe, "src"));
        fs.writeFileSync(path.join(fe, "index.html"), "<div id='app'></div>");
        fs.writeFileSync(path.join(fe, "src", "main.ts"), "// s");
        // no dist yet
        assert.ok(needsBuild(fe));
        // dist built after the sources → fresh, skip
        const dist = path.join(fe, "dist");
        fs.mkdirSync(dist);
        fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html>");
        fs.utimesSync(path.join(dist, "index.html"), new Date(), new Date(Date.now() + 5000));
        assert.ok(!needsBuild(fe));
        // a source edited after the build → rebuild
        fs.utimesSync(path.join(fe, "src", "main.ts"), new Date(), new Date(Date.now() + 10_000));
        assert.ok(needsBuild(fe));
        // no frontend at all → false (caller skips the SPA)
        const bare = tmpRoot();
        assert.ok(!needsBuild(bare));
    });

    test("copyDist overlays the built SPA over the site root", () => {
        const fe = tmpRoot();
        const dist = path.join(fe, "dist");
        fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
        fs.writeFileSync(path.join(dist, "index.html"), "<div id='app'></div>");
        fs.writeFileSync(path.join(dist, "assets", "a.js"), "//");
        const site = tmpRoot();
        copyDist(fe, site);
        assert.equal(
            fs.readFileSync(path.join(site, "index.html"), "utf-8"),
            "<div id='app'></div>"
        );
        assert.ok(fs.existsSync(path.join(site, "assets", "a.js")));
    });

    test("buildSite writes data files and serves the SPA shell", async () => {
        const root = tmpRoot();
        try {
            const pdir = path.join(root, "problems", "luogu", "P4001");
            fs.mkdirSync(pdir, { recursive: true });
            fs.writeFileSync(
                path.join(pdir, "problem.md"),
                "---\ntitle: P4001\ncategory: luogu\n---\n\n# Sum\n\nBody.\n"
            );
            fs.mkdirSync(path.join(root, "notes"), { recursive: true });
            fs.writeFileSync(path.join(root, "notes", "trick.md"), "# Trick\n\n$a$.\n");

            const feOut = await buildTo(path.join(tmpRoot(), "dist"));
            const report = await buildSite(root, { feOutDir: feOut });

            // the shell is the Vue SPA entry
            const index = fs.readFileSync(path.join(root, "build", "index.html"), "utf-8");
            assert.ok(index.includes('<div id="app">'));
            assert.ok(fs.existsSync(path.join(root, "build", "assets")));
            assert.equal(report.notes, 2); // P4001 + trick

            // notes.json: route-path keys with pre-rendered bodies
            const entries = JSON.parse(
                fs.readFileSync(path.join(root, "build", "notes.json"), "utf-8")
            );
            assert.equal(entries["problems/luogu/P4001"].title, "P4001");
            assert.ok(entries["notes/trick"].html.includes('class="katex"'));

            // tree.json: route-path hrefs (no .html/index), problems/ then notes/
            const tree = JSON.parse(
                fs.readFileSync(path.join(root, "build", "tree.json"), "utf-8")
            );
            assert.equal(tree[0].title, "problems");
            assert.equal(tree[0].children[0].title, "luogu");
            assert.equal(tree[0].children[0].children[0].title, "P4001");
            assert.equal(tree[0].children[0].children[0].href, "problems/luogu/P4001");
            assert.equal(tree[1].title, "notes");
            assert.equal(tree[1].children[0].title, "Trick"); // from the # heading
            assert.equal(tree[1].children[0].href, "notes/trick");
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
