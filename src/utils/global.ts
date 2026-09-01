// extern global
declare global {
    var projectRoot: string;
    var projectConfig: {
        [key: string]: any;
    };
}

globalThis.projectRoot = process.cwd();

// test if there's a .mylearn/config.json file in the project root
import fs from "node:fs";
import path from "node:path";

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
