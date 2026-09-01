// stderr: keep the greeting off stdout — stdout carries command output that
// may be piped or parsed.
console.error("Welcome to myLearn!");
await import("./src/utils/global.ts");
await import("./src/utils/arg.ts");
