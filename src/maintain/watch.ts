// Watch the problems tree for changes against .mylearn/index/latest.json.
// Hash comparison is manual (a changed file is re-hashed from disk); mtime
// comparison against the snapshot is automatic (files are only re-hashed
// when the mtime differs), so an unchanged tree costs one stat per file.
// The diff is returned to the caller so a rebuild (index/scan) can be
// triggered for exactly the changed notes.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { problemsDir } from "../utils/persist.ts";

export interface SnapshotFile {
    mtimeMs: number;
    hash: string;
}

export interface NoteSnapshot {
    updatedAt: number;
    files: Record<string, SnapshotFile>;
}

export interface NoteDiff {
    added: string[];
    changed: string[];
    removed: string[];
}

export function indexDir(root: string): string {
    return path.join(root, ".mylearn", "index");
}

function latestPath(root: string): string {
    return path.join(indexDir(root), "latest.json");
}

/** empty snapshot when latest.json does not exist yet (first run) */
export function loadSnapshot(root: string): NoteSnapshot {
    const p = latestPath(root);
    if (!fs.existsSync(p)) return { updatedAt: 0, files: {} };
    return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveSnapshot(root: string, snapshot: NoteSnapshot): void {
    fs.mkdirSync(indexDir(root), { recursive: true });
    fs.writeFileSync(latestPath(root), JSON.stringify(snapshot, null, 2));
}

/** relative paths of all files under dir, deterministically sorted */
function walkFiles(dir: string, rel = ""): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(path.join(dir, rel))) {
        const child = rel ? `${rel}/${entry}` : entry;
        if (fs.statSync(path.join(dir, child)).isDirectory()) {
            out.push(...walkFiles(dir, child));
        } else {
            out.push(child);
        }
    }
    return out;
}

function fileHash(filePath: string): string {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** One-shot: compare problems/ with the snapshot, persist the new snapshot,
 *  and report what changed. Delegates rebuilding to the caller. */
export function watch(root: string): NoteDiff {
    const base = problemsDir(root);
    if (!fs.existsSync(base)) {
        throw new Error(`No problems directory: ${base}`);
    }
    const snapshot = loadSnapshot(root);
    const next: NoteSnapshot = { updatedAt: Date.now(), files: {} };
    const diff: NoteDiff = { added: [], changed: [], removed: [] };

    for (const rel of walkFiles(base).sort()) {
        const abs = path.join(base, rel);
        const stat = fs.statSync(abs);
        const record = snapshot.files[rel];
        if (!record) {
            diff.added.push(rel);
            next.files[rel] = { mtimeMs: stat.mtimeMs, hash: fileHash(abs) };
        } else if (record.mtimeMs !== stat.mtimeMs) {
            const hash = fileHash(abs);
            if (hash !== record.hash) diff.changed.push(rel);
            next.files[rel] = { mtimeMs: stat.mtimeMs, hash };
        } else {
            next.files[rel] = record;
        }
    }
    for (const rel of Object.keys(snapshot.files)) {
        if (!next.files[rel]) diff.removed.push(rel);
    }

    saveSnapshot(root, next);
    return diff;
}

/** Continuous: fs.watch problems/ (debounced) and run watch() on each change.
 *  onChanges only fires when the diff is non-empty. Returns a stop() fn. */
export function watchContinuous(
    root: string,
    onChanges: (diff: NoteDiff) => void,
    debounceMs = 500
): () => void {
    const base = problemsDir(root);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
        const diff = watch(root);
        if (diff.added.length || diff.changed.length || diff.removed.length) {
            onChanges(diff);
        }
    };
    const watcher = fs.watch(base, { recursive: true }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(refresh, debounceMs);
    });
    return () => watcher.close();
}
