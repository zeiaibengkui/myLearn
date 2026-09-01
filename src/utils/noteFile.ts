// File-backed proxies: a note object is a live view over its files on disk.
// Property reads hit disk (frontmatter/body via gray-matter, solutions via
// directory listing); scalar writes persist to the file immediately.
// No caching — every get reflects current disk state, which is fine for an
// interactive CLI tool.

import path from "node:path";
import type { Problem, Solution } from "./problem.ts";
import {
    listSolutions,
    listSourceFiles,
    readProblemMd,
    readSolutionContent,
    writeProblemMd,
    writeSolutionContent,
} from "./persist.ts";

const problemFields = ["title", "category", "description", "solutions", "sourceFiles"] as const;
const solutionFields = ["title", "description", "sourceFiles"] as const;

function makeBackedNote<T extends object>(
    fields: readonly string[],
    getValue: (prop: string) => unknown,
    setValue: (prop: string, value: unknown) => boolean
): T {
    return new Proxy({} as T, {
        get(_target, prop) {
            return typeof prop === "string" && fields.includes(prop)
                ? getValue(prop)
                : undefined;
        },
        set(_target, prop, value) {
            if (typeof prop === "string" && fields.includes(prop)) {
                return setValue(prop, value);
            }
            // structural props (solutions/sourceFiles) are mutated via
            // persist.ts helpers, not `set`
            return false;
        },
        has(_target, prop) {
            return typeof prop === "string" && fields.includes(prop);
        },
        ownKeys() {
            return [...fields];
        },
        getOwnPropertyDescriptor(_target, prop) {
            if (typeof prop === "string" && fields.includes(prop)) {
                return { enumerable: true, configurable: true, value: getValue(prop) };
            }
        },
    });
}

export function openProblem(dir: string): Problem {
    return makeBackedNote<Problem>(
        problemFields,
        (prop) => {
            const { title, category, description } = readProblemMd(dir);
            switch (prop) {
                case "title":
                    return title;
                case "category":
                    return category;
                case "description":
                    return description;
                case "solutions":
                    return listSolutions(dir).map((file) =>
                        openSolution(path.join(dir, file))
                    );
                case "sourceFiles":
                    return listSourceFiles(dir);
                default:
                    return undefined;
            }
        },
        (prop, value) => {
            switch (prop) {
                case "title":
                    writeProblemMd(dir, { title: value as string });
                    return true;
                case "category":
                    writeProblemMd(dir, { category: value as string });
                    return true;
                case "description":
                    writeProblemMd(dir, { description: value as string });
                    return true;
                default:
                    return false;
            }
        }
    );
}

export function openSolution(mdPath: string): Solution {
    return makeBackedNote<Solution>(
        solutionFields,
        (prop) => {
            const { title, description } = readSolutionContent(mdPath);
            switch (prop) {
                case "title":
                    return title;
                case "description":
                    return description;
                case "sourceFiles":
                    return [];
                default:
                    return undefined;
            }
        },
        (prop, value) => {
            switch (prop) {
                case "title":
                    writeSolutionContent(mdPath, { title: value as string });
                    return true;
                case "description":
                    writeSolutionContent(mdPath, { description: value as string });
                    return true;
                default:
                    return false;
            }
        }
    );
}
