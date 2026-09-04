// Small pure helpers shared by the build orchestrator and components.

import fs from "node:fs";
import path from "node:path";

/** Relative link from build/ root — encode each path segment (paths with
 *  `/` included) so titles with spaces/`#`/`?` survive as hrefs; files on
 *  disk stay spelled as authored. */
export function hrefFor(...segments: string[]): string {
    return segments
        .map(s => s.split("/").map(encodeURIComponent).join("/"))
        .join("/");
}

/** Title for a freeform note: first `# ` heading (markdown stripped), else the stem. */
export function noteTitle(text: string, fallback: string): string {
    const m = text.match(/^\s{0,3}#\s+(.+)$/m);
    if (!m) return fallback;
    return m[1].replace(/[*_`]/g, "").trim() || fallback;
}

/** all files under dir as rel paths, recursively (sorted) */
export function walkFiles(dir: string, rel = ""): string[] {
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
