import type { Problem } from "../utils/problem.ts";
import { createProblem } from "../utils/persist.ts";
import { openProblem } from "../utils/noteFile.ts";
import parsePDF from "./pdf.ts";
import fetchLuogu from "./luogu.ts";
import type { Fetcher } from "./types.ts";

// Registry order = auto-detection precedence: fetchers are tried in order and
// the first one whose canFetch(source) matches is used.
const fetchers = {
    luogu: fetchLuogu,
    pdf: parsePDF,
} satisfies Record<string, Fetcher>;

export type FetchType = keyof typeof fetchers;

export function resolveFetcher(source: string, explicit?: string): Fetcher {
    if (explicit) {
        const fetcher = (fetchers as Record<string, Fetcher>)[explicit];
        if (!fetcher) {
            throw new Error(`Unsupported type: ${explicit}`);
        }
        return fetcher;
    }
    for (const fetcher of Object.values(fetchers)) {
        if (fetcher.canFetch(source)) return fetcher;
    }
    throw new Error(`No fetcher can handle: ${source}`);
}

/** Convert a source into a saved Problem and return it as a live proxy. */
export async function fetchProblem(
    root: string,
    source: string,
    category: string,
    type?: string
): Promise<Problem> {
    const fetcher = resolveFetcher(source, type);
    const draft = await fetcher.convert(source);
    const dir = createProblem(root, category, draft);
    return openProblem(dir);
}
