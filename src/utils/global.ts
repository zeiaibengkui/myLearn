// extern global
declare global {
    var projectRoot: string;
    var projectConfig: {
        [key: string]: any;
    };
}

import fs from "node:fs";
import path from "node:path";

// The CLI normally requires the CWD to be an initialized project. But MCP
// clients spawn `ai serve` with the *client's* CWD (seldom a project), so
// MYLEARN_PROJECT pins the project explicitly for that case. Unset → CWD.
const root = process.env.MYLEARN_PROJECT
    ? path.resolve(process.env.MYLEARN_PROJECT)
    : process.cwd();
globalThis.projectRoot = root;

// test if there's a .mylearn/config.json file in the project root
const configPath = path.join(globalThis.projectRoot, ".mylearn", "config.json");
if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, "utf-8");
    globalThis.projectConfig = JSON.parse(configContent);
    console.error(`Working in ${projectRoot}`);
} else {
    console.error(
        "No config found." +
            " Please run 'myLearn init <dir>' to initialize a new project."
    );
    process.exit(1);
}
