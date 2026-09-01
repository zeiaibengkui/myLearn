// Layout and disk IO for notes. Single source of truth for where things
// live: notes are directories under `content/<category>/<title>/`,
// holding `problem.md` (frontmatter: title/category), one `<title>.md`
// per solution, and copied source files.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const problemMdName = "problem.md";

/** Make a single path segment safe (no separators, no "." / ".."). */
function safeSegment(segment: string): string {
    const cleaned = segment.replace(/[/\\]/g, "_");
    if (cleaned === "" || cleaned === "." || cleaned === "..") {
        throw new Error(`Invalid path segment: ${segment}`);
    }
    return cleaned;
}

export function problemDir(root: string, category: string, title: string): string {
    return path.join(root, "content", safeSegment(category), safeSegment(title));
}

export function problemMdPath(dir: string): string {
    return path.join(dir, problemMdName);
}

export function createProblem(
    root: string,
    category: string,
    draft: { title: string; description: string; sourceFiles: string[] }
): string {
    const dir = problemDir(root, category, draft.title);
    fs.mkdirSync(dir, { recursive: true });
    writeProblemMd(dir, {
        title: draft.title,
        category,
        description: draft.description,
    });
    for (const source of draft.sourceFiles) {
        addSourceFile(dir, source);
    }
    return dir;
}

export function readProblemMd(
    dir: string
): { title: string; category: string; description: string } {
    const mdPath = problemMdPath(dir);
    if (!fs.existsSync(mdPath)) {
        throw new Error(`No problem.md found in ${dir}`);
    }
    const { data, content } = matter.read(mdPath);
    return {
        title: data.title ?? "",
        category: data.category ?? "",
        description: content,
    };
}

export function writeProblemMd(
    dir: string,
    data: { title?: string; category?: string; description?: string }
): void {
    const mdPath = problemMdPath(dir);
    const { data: existing, content: existingContent } = fs.existsSync(mdPath)
        ? matter.read(mdPath)
        : { data: {}, content: "" };
    const mergedData = {
        ...existing,
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
    };
    const content = data.description !== undefined ? data.description : existingContent;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(mdPath, matter.stringify(content, mergedData));
}

/** solution .md files in a problem dir (everything except problem.md) */
export function listSolutions(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md") && f !== problemMdName)
        .sort();
}

/** non-markdown files (copied sources) in a problem dir */
export function listSourceFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => fs.statSync(path.join(dir, f)).isFile() && !f.endsWith(".md"))
        .sort();
}

export function addSolutionFile(
    dir: string,
    solution: { title: string; description: string }
): void {
    writeSolutionContent(path.join(dir, `${safeSegment(solution.title)}.md`), solution);
}

export function addSourceFile(dir: string, sourcePath: string): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(dir, path.basename(sourcePath)));
}

export function readSolutionContent(
    mdPath: string
): { title: string; description: string } {
    if (!fs.existsSync(mdPath)) {
        throw new Error(`No solution file: ${mdPath}`);
    }
    const { data, content } = matter.read(mdPath);
    return { title: data.title ?? path.basename(mdPath, ".md"), description: content };
}

export function writeSolutionContent(
    mdPath: string,
    data: { title?: string; description?: string }
): void {
    const { data: existing, content: existingContent } = fs.existsSync(mdPath)
        ? matter.read(mdPath)
        : { data: {}, content: "" };
    const mergedData = {
        ...existing,
        ...(data.title !== undefined ? { title: data.title } : {}),
    };
    const content = data.description !== undefined ? data.description : existingContent;
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, matter.stringify(content, mergedData));
}
