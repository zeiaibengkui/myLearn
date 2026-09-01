// The global commander instance, shared by everyone who registers CLI
// commands: built-ins in arg.ts and each provider module (imported for its
// side effect, e.g. `import "../provider/luogu/index.ts"`). Keeping it in its
// own module avoids the import cycle arg.ts ↔ provider registration.

import { Command } from "commander";

export const program = new Command();
