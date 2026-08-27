import { Command } from "commander";
import path from "node:path";
import initProject from "../project/init.ts";
const program = new Command();
program
    .name("myLearn")
    .description("nodejs cli learning tool")
    .version("0.8.0");
/* program
    .command("split")
    .description("Split a string into substrings and display as an array")
    .argument("<string>", "string to split")
    .option("--first", "display just the first substring")
    .option("-s, --separator <char>", "separator character", ",")
    .action((str, options) => {
        const limit = options.first ? 1 : undefined;
        console.log(str.split(options.separator, limit));
    }); */
program
    .command("init")
    .argument("<string>", "dir", String)
    .action((dir: string, options) => {
        const pth = path.resolve(dir);
        initProject(pth);
    });
program.parse();
