// A fetcher converts a source (local file, pid, URL...) into a problem draft.
// It knows nothing about categories or the model.
//
// Fetchers declare what they can handle via canFetch(), so the pipeline can
// auto-select one when the user doesn't pass an explicit type.

export interface Draft {
    title: string;
    description: string;
    sourceFiles: string[];
}

export interface Fetcher {
    /** does this fetcher recognize the source? (URL shape, pid pattern, file form...) */
    canFetch(source: string): boolean;
    /** convert the source into a Draft, throwing on failure (never silently empty) */
    convert(source: string): Promise<Draft>;
}
