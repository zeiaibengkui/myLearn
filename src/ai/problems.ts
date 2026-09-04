// Base knowledge-base accessors shared by every provider that takes a
// -p <problem> parameter: turn a problem spec (a note path or a pattern)
// into a note directory, list the problemset, open a note.
//
// The -p contract is: an explicit path (absolute, or relative to the CWD or
// to `problems/`) points at a note dir; anything else is a pattern that must
// match exactly one note (case-insensitive substring on the title dir name).

import fs from "node:fs";
import path from "node:path";
import type { Problem } from "../utils/problem.ts";
import { openProblem } from "../utils/noteFile.ts";
import { problemsDir, problemMdPath, readProblemMd } from "../utils/persist.ts";

export interface NoteInfo {
    /** note directory (absolute) */
    dir: string;
    category: string;
    title: string;
}

/** Every problem note: problems/<category>/<title dir>/problem.md.
 *  Freeform notes (the sibling `notes/` tree) have no problem.md → skipped. */
export function listProblems(root: string): NoteInfo[] {
    const base = problemsDir(root);
    if (!fs.existsSync(base)) return [];
    const notes: NoteInfo[] = [];
    for (const category of fs.readdirSync(base).sort()) {
        const catDir = path.join(base, category);
        if (!fs.statSync(catDir).isDirectory()) continue;
        for (const entry of fs.readdirSync(catDir).sort()) {
            const dir = path.join(catDir, entry);
            if (!fs.statSync(dir).isDirectory()) continue;
            if (!fs.existsSync(problemMdPath(dir))) continue;
            let title = entry;
            try {
                title = readProblemMd(dir).title || entry;
            } catch {
                // unreadable frontmatter — fall back to the dir name
            }
            notes.push({ dir, category, title });
        }
    }
    return notes;
}

/** Note(dir) resolution: exact path first, then pattern with exactly one match. */
export function resolveNote(root: string, spec: string): string {
    // 1. path candidates: as given (cwd-relative), project-relative, problems-relative
    for (const candidate of [
        path.resolve(spec),
        path.join(root, spec),
        path.join(problemsDir(root), spec),
    ]) {
        if (fs.existsSync(problemMdPath(candidate))) return candidate;
    }
    // 2. pattern: substring (case-insensitive) on the title dir name
    const needle = spec.toLowerCase();
    const matches = listProblems(root).filter((n) =>
        path.basename(n.dir).toLowerCase().includes(needle)
    );
    if (matches.length === 1) return matches[0].dir;
    if (matches.length === 0) {
        throw new Error(`No note matches "${spec}" in ${problemsDir(root)} — pass a note path or a pattern.`);
    }
    throw new Error(
        `"${spec}" matches more than one note:\n  ${matches
            .map((n) => n.dir)
            .join("\n  ")}\nBe more specific.`
    );
}

/** Resolve a spec to a live Problem proxy. */
export function openNote(root: string, spec: string): Problem {
    return openProblem(resolveNote(root, spec));
}
