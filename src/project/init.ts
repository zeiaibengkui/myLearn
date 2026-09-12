import path from "node:path";
import fs from "node:fs";
import { DEFAULT_SITE_REPO, cloneSite } from "./clone.ts";
type RecursiveRecord = {
    [key: string]: string | RecursiveRecord;
};
const tree = {
    problems: {
        cato1: {
            "readme.md": "This is cato1",
            "Problem 1": {
                "Problem 1.md": "This is problem 1",
                "Solution 1.md": "This is solution 1",
            },
        },
    },
    // freeform notes without a problem statement (same depth as problems/);
    // can be nested
    notes: {} as RecursiveRecord,
    "readme.md": "# myLearn new project",
    ".mylearn": {
        "config.json": "{}",
        index: {} as RecursiveRecord,
    },
};

export type ProjectTree = typeof tree | RecursiveRecord;

function genPath(tree: ProjectTree, root: string) {
    for (const [key, value] of Object.entries(tree)) {
        const isDir = typeof value == "object";
        const fullPath = path.join(root, key);

        // test if the path or exists and is a directory
        if (
            fs.existsSync(fullPath) &&
            fs.statSync(fullPath).isDirectory() !== isDir
        ) {
            throw new Error(
                `Path ${fullPath} already exists and is not a ${isDir ? "directory" : "file"}`
            );
        }
        if (isDir) {
            fs.mkdirSync(fullPath, { recursive: true });
            genPath(value as ProjectTree, fullPath);
        } else {
            fs.writeFileSync(fullPath, value);
        }
    }
}

export interface InitOptions {
    /** take the site scaffold from a remote KB (true → DEFAULT_SITE_REPO) */
    online?: string | boolean;
}

export default function initProject(target: string, options: InitOptions = {}) {
    console.log("init project at", target);
    genPath(tree, target);
    // The bare tree is all the CLI writes — the site scaffold isn't shipped
    // here: a configured KB is the template, so `--online [repo]` clones one
    // (its .vitepress/ + build/CI files) into the new project.
    const online = options.online;
    if (online) {
        cloneSite(target, typeof online === "string" ? online : DEFAULT_SITE_REPO);
    }
}
