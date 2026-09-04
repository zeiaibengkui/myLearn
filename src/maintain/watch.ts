// Watch the problems tree for changes against .mylearn/index/latest.json.
// Hash comparison is manual (a changed file is re-hashed from disk); mtime
// comparison against the snapshot is automatic (files are only re-hashed
// when the mtime differs), so an unchanged tree costs one stat per file.
// The diff is returned to the caller so a rebuild (index/scan) can be
// triggered for exactly the changed notes.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { notesDir, problemsDir } from "../utils/persist.ts";

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

/** Watched roots: problems/ is required; notes/ (sibling) is included only
 *  when present. Notes keys get a `notes/` prefix so problems keys stay as
 *  legacy rel paths (no snapshot churn on rename). */
function watchedRoots(root: string): { name: string; abs: string }[] {
    const problems = problemsDir(root);
    return [
        { name: "problems", abs: problems },
        ...(fs.existsSync(notesDir(root))
            ? [{ name: "notes", abs: notesDir(root) }]
            : []),
    ];
}

/** One-shot: compare problems/ (and notes/) with the snapshot, persist the
 *  new snapshot, and report what changed. Delegates rebuilding to the caller. */
export function watch(root: string): NoteDiff {
    const problems = problemsDir(root);
    if (!fs.existsSync(problems)) {
        throw new Error(`No problems directory: ${problems}`);
    }
    const snapshot = loadSnapshot(root);
    const next: NoteSnapshot = { updatedAt: Date.now(), files: {} };
    const diff: NoteDiff = { added: [], changed: [], removed: [] };

    for (const { name, abs } of watchedRoots(root)) {
        for (const rel of walkFiles(abs).sort()) {
            const key = name === "problems" ? rel : `${name}/${rel}`;
            const fileAbs = path.join(abs, rel);
            const stat = fs.statSync(fileAbs);
            const record = snapshot.files[key];
            if (!record) {
                diff.added.push(key);
                next.files[key] = { mtimeMs: stat.mtimeMs, hash: fileHash(fileAbs) };
            } else if (record.mtimeMs !== stat.mtimeMs) {
                const hash = fileHash(fileAbs);
                if (hash !== record.hash) diff.changed.push(key);
                next.files[key] = { mtimeMs: stat.mtimeMs, hash };
            } else {
                next.files[key] = record;
            }
        }
    }
    for (const rel of Object.keys(snapshot.files)) {
        if (!next.files[rel]) diff.removed.push(rel);
    }

    saveSnapshot(root, next);
    return diff;
}

/** Continuous: fs.watch problems/ + notes/ (debounced) and run watch() on
 *  each change. onChanges only fires when the diff is non-empty. Returns a
 *  stop() fn. */
export function watchContinuous(
    root: string,
    onChanges: (diff: NoteDiff) => void,
    debounceMs = 500
): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
        const diff = watch(root);
        if (diff.added.length || diff.changed.length || diff.removed.length) {
            onChanges(diff);
        }
    };
    const watchers = watchedRoots(root).map(({ abs }) => {
        const watcher = fs.watch(abs, { recursive: true }, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(refresh, debounceMs);
        });
        return watcher;
    });
    return () => watchers.forEach((w) => w.close());
}
