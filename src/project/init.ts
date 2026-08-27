import path from "node:path";
import fs from "node:fs";
type RecursiveRecord = {
    [key: string]: string | RecursiveRecord;
};
const tree = {
    content: {
        cato1: { "readme.md": "This is cato1" },
    } as RecursiveRecord,
    "readme.md": "# myLearn new project",
    "config.json": "{}",
};

export type ProjectTree = typeof tree;

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
}
