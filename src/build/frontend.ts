// Vue SPA shell (frontend/) — build + copy integration for the site build.
// The SPA replaces build/index.html only (note pages stay static HTML, see
// build/index.ts). The repo frontend/ dir lives next to src/ — the project
// root passed to buildSite is the knowledge base, e.g. data/ — so every
// helper takes the fe dir explicitly and frontendDir() resolves it from this
// module's own location.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** repo/frontend — relative to this module (src/build → up 2 = repo root) */
export function frontendDir(): string {
    return fileURLToPath(new URL("../../frontend", import.meta.url));
}

/** SPA files whose mtime decides whether a rebuild is needed */
const SOURCES = ["src", "index.html", "vite.config.ts"];

/** absolute dir holding a built SPA (default: frontend/dist) */
export function distDir(feDir: string, outDir = "dist"): string {
    return path.isAbsolute(outDir) ? outDir : path.join(feDir, outDir);
}

/** newest mtime under a file or directory (recursive) */
function newestMtime(abs: string): number {
    const stat = fs.statSync(abs);
    if (stat.isFile()) return stat.mtimeMs;
    let newest = 0;
    for (const entry of fs.readdirSync(abs)) {
        newest = Math.max(newest, newestMtime(path.join(abs, entry)));
    }
    return newest;
}

/** true when the SPA sources changed since the last build (or none exists);
 *  false when there is no frontend at all (caller falls back to the h.ts
 *  shell). This is what keeps note-only rebuilds fast: buildSite only runs
 *  vite when the shell sources actually moved. */
export function needsBuild(feDir: string, outDir = "dist"): boolean {
    if (!fs.existsSync(path.join(feDir, "index.html"))) return false;
    const outIndex = path.join(distDir(feDir, outDir), "index.html");
    if (!fs.existsSync(outIndex)) return true;
    const distMtime = fs.statSync(outIndex).mtimeMs;
    let newest = 0;
    for (const rel of SOURCES) {
        const abs = path.join(feDir, rel);
        if (fs.existsSync(abs)) newest = Math.max(newest, newestMtime(abs));
    }
    return newest > distMtime;
}

/** programmatic vite build of the SPA. Throws when vite is unavailable
 *  (fresh clone without devDeps) — the caller degrades to the fallback. */
export async function buildFrontend(feDir: string, outDir = "dist"): Promise<void> {
    const { build } = await import("vite");
    await build({
        root: feDir,
        configFile: path.join(feDir, "vite.config.ts"),
        build: {
            outDir: distDir(feDir, outDir),
            emptyOutDir: true,
        },
    });
}

/** copy the built SPA over the site root (index.html + assets/) — run after
 *  the note pages were written, so the shell entry replaces the page slot */
export function copyDist(feDir: string, siteRoot: string, outDir = "dist"): void {
    const dist = distDir(feDir, outDir);
    for (const entry of fs.readdirSync(dist)) {
        fs.cpSync(path.join(dist, entry), path.join(siteRoot, entry), {
            recursive: true,
        });
    }
}
