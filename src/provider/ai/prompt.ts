// Paste-prompt assembly: the `ai <prompt>` verb has no LLM access, it builds
// a self-contained bundle (task + problem statement + samples) that can be
// pasted into any AI chat.

import type { Problem } from "../../utils/problem.ts";

export function buildPrompt(
    problem: Problem,
    prompt: string,
    noteDir?: string
): string {
    const solutions = problem.solutions.map((s) => `* ${s.title}`).join("\n");
    return [
        "# Task",
        "",
        prompt,
        "",
        `# Problem: ${problem.title}`,
        `- category: ${problem.category}`,
        ...(noteDir ? [`- note: ${noteDir}`] : []),
        "",
        problem.description,
        "",
        ...(solutions ? ["## Existing solutions", "", solutions, ""] : []),
    ].join("\n");
}
