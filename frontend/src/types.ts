/** Mirror of src/build/components/tree.ts's ShellNode — the shape of
 *  build/tree.json (written by src/build/index.ts). */
export interface ShellNode {
    title: string;
    href?: string;
    children?: ShellNode[];
}

/** Mirror of src/build/index.ts's NoteEntry — the shape of the values of
 *  build/notes.json (route path → pre-rendered note body). */
export interface NoteEntry {
    title: string;
    html: string;
}
