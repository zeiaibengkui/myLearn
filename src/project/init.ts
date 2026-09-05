import path from "node:path";
import fs from "node:fs";
import { scaffoldSite } from "../site/setup.ts";
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

export default function initProject(path: string) {
    console.log("init project at", path);
    genPath(tree, path);
    // new projects are site-ready: .vitepress/ scaffold (VitePress renders
    // the markdown in place — re-run `site setup` to refresh the templates)
    scaffoldSite(path);
}
