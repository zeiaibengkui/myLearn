// The fetch contract shared by provider fetchers (see src/provider/<name>/fetch.ts).
// A Fetcher is a pure capability: declare what it claims (canFetch) and
// convert a source into a Draft; providers save the Draft into the knowledge
// base via importDraft — or keep their own wiring, the contract is minimal.

import type { Problem } from "./problem.ts";
import { createProblem } from "./persist.ts";
import { openProblem } from "./noteFile.ts";

export interface Draft {
    title: string;
    description: string;
    sourceFiles: string[];
}

export interface Fetcher {
    canFetch(source: string): boolean;
    convert(source: string): Promise<Draft>;
}

/** Save a draft under content/<category>/<title>/ and return it as a live proxy. */
export function importDraft(root: string, category: string, draft: Draft): Problem {
    return openProblem(createProblem(root, category, draft));
}
