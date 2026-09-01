// Pure domain model. No IO — notes live on disk as files,
// accessed through the file-backed proxies in ./noteFile.ts.

export interface NoteFile {
    title: string;
    description: string;
    /** extra files copied into the note directory (e.g. the original PDF) */
    sourceFiles: string[];
}

export interface Solution extends NoteFile {}

export interface Problem extends NoteFile {
    category: string;
    solutions: Solution[];
}
