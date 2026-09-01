import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Draft, Fetcher } from "../../utils/fetcher.ts";

const execFileAsync = promisify(execFile);
const isUrl = /^https?:\/\//i;

async function convertPDF(pdfPath: string): Promise<Draft> {
    try {
        await execFileAsync("markitdown", ["--version"]);
    } catch {
        throw new Error(
            `markitdown is not available. Install it (e.g. 'pip install markitdown') so it is on your PATH.`
        );
    }

    // execFile (no shell) avoids command injection and quoting issues
    const { stdout } = await execFileAsync("markitdown", [pdfPath]);
    const firstLine = stdout.split("\n").find((l) => l.trim() !== "") ?? "";
    const title = firstLine.replace(/^#\s*/, "").trim() || path.basename(pdfPath, ".pdf");
    const description = [
        `# ${title}`,
        "",
        `## Original PDF converted from ${pdfPath}`,
        "",
        stdout.trim(),
    ].join("\n");

    return { title, description, sourceFiles: [pdfPath] };
}

// markitdown handles many local file formats, so this fetcher claims any
// non-URL source (file paths are passed to markitdown as-is)
const parsePDF: Fetcher = {
    canFetch: (source) => !isUrl.test(source),
    convert: convertPDF,
};

export default parsePDF;
