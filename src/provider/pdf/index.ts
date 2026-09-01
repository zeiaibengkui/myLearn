// PDF provider. Imported for its side effect (see arg.ts): registers its own
// CLI on the shared global program.
//   pdf import <file> -c <category>   import a local PDF as a note (markitdown)

import path from "node:path";
import { program } from "../../utils/program.ts";
import { importDraft } from "../../utils/fetcher.ts";
import fetchPdf from "./fetch.ts";

const pdf = program
    .command("pdf")
    .description("PDF provider: import local PDFs as notes");

pdf
    .command("import")
    .description("Import a local PDF via markitdown")
    .argument("<file>", "PDF file to import")
    .requiredOption("-c, --category <category>", "target category")
    .action(async (file: string, options: { category: string }) => {
        const draft = await fetchPdf.convert(path.resolve(file));
        const problem = importDraft(globalThis.projectRoot, options.category, draft);
        console.log(`Saved "${problem.title}" → content/${options.category}/${problem.title}/`);
    });
