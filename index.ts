// stderr: the CLI greeting must never land on stdout, because `ai serve`
// owns stdout as its JSON-RPC channel (MCP stdio transport).
console.error("Welcome to myLearn!");
await import("./src/utils/global.ts");
await import("./src/utils/arg.ts");
