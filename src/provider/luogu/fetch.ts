// Luogu fetcher: parses a problem page's `lentille-context` JSON payload
// (a Serde blob embedded in a <script type="application/json"> tag) and
// converts it to a Draft. Accepts a pid like "P4001" or a full problem URL.
//
// Payload shape (field names taken from the rendered page):
//   data.problem = { pid, name, difficulty, tags[], contenu: { name, background,
//   description, formatI, formatO, hint }, samples: [[input, output], ...], limits }
//
// NOTE: with no cookies/headers, Luogu may serve an anti-bot challenge page;
// then there is no payload and loadContext throws.

import type { Draft, Fetcher } from "../../utils/fetcher.ts";

const problemBase = "https://www.luogu.com.cn/problem/";
const isUrl = /^https?:\/\//i;
// Luogu pid: letters + digits, optionally more letters/digits, e.g. P4001, CF1234D, AT_abc123
const isPid = /^[A-Za-z]+_?[A-Za-z0-9]*[0-9]+[A-Za-z0-9]*$/;

/** exact host allowlist with label boundary — evil-luogu.com.cn must not match */
function isLuoguHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    return host === "luogu.com.cn" || host.endsWith(".luogu.com.cn");
}

const maxRedirects = 5;

/** Fetch a Luogu page, following redirects per-hop: every Location is
 *  validated against the host allowlist BEFORE the next request goes out. */
async function fetchLuoguPage(startUrl: string): Promise<Response> {
    let current = startUrl;
    for (let hop = 0; hop < maxRedirects; hop++) {
        const res = await fetch(current, {
            headers: { "User-Agent": "myLearn" },
            redirect: "manual",
        });
        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location) {
                throw new Error(`Luogu redirect without a Location: ${current}`);
            }
            const next = new URL(location, current);
            if (!isLuoguHost(next.hostname)) {
                throw new Error(
                    `Luogu redirected to a non-Luogu host: ${next.href}`
                );
            }
            current = next.href;
            continue;
        }
        return res;
    }
    throw new Error(`Too many redirects fetching Luogu page: ${startUrl}`);
}

const difficultyNames = [
    "暂无评定",
    "入门",
    "普及−",
    "普及/提高−",
    "普及+/提高",
    "提高+/省选−",
    "省选/NOI−",
    "NOI/NOI+/CTSC",
];

function loadContext(html: string): Record<string, any> {
    const match = html.match(
        /<script id="lentille-context" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) {
        throw new Error(
            "No lentille-context payload found — is this a Luogu problem page (or served an anti-bot challenge)?"
        );
    }
    return JSON.parse(match[1]);
}

const fetchLuogu: Fetcher = {
    // claims web URLs and pid-shaped words like "P4001" / "CF1234D"
    canFetch: (source) => isUrl.test(source) || isPid.test(source),
    convert: async (source) => {
    const url = (() => {
        if (isUrl.test(source)) {
            // full URLs are only followed when they point at Luogu itself
            const parsed = new URL(source);
            if (!isLuoguHost(parsed.hostname)) {
                throw new Error(`Not a Luogu URL: ${source}`);
            }
            return parsed.href;
        }
        return `${problemBase}${source}`; // pid like "P4001"
    })();
    const res = await fetchLuoguPage(url);
    if (!res.ok) {
        throw new Error(`Luogu returned HTTP ${res.status} for ${res.url}`);
    }

    const context = loadContext(await res.text());
    const problem = context.data?.problem;
    const contenu = problem?.contenu;
    if (!problem || !contenu) {
        throw new Error(`No problem data in ${url}`);
    }

    const pid: string = problem.pid;
    const title = `${pid} ${contenu.name}`.trim();

    const sections = [
        ["背景", contenu.background],
        ["题目描述", contenu.description],
        ["输入格式", contenu.formatI],
        ["输出格式", contenu.formatO],
        ["说明/提示", contenu.hint],
    ] as const;
    const body = sections
        .filter(([, text]) => text)
        .map(([heading, text]) => `## ${heading}\n\n${text}`)
        .join("\n\n");

    const samples: [string, string][] = Array.isArray(problem.samples)
        ? problem.samples
        : [];
    const sampleMd = samples
        .map(
            ([input, output], i) =>
                [
                    `### 样例 ${i + 1}`,
                    "",
                    "**输入**",
                    "",
                    "```text",
                    input,
                    "```",
                    "",
                    "**输出**",
                    "",
                    "```text",
                    output,
                    "```",
                ].join("\n")
        )
        .join("\n\n");

    const difficulty =
        difficultyNames[problem.difficulty] ?? String(problem.difficulty);
    const description = [
        `> 洛谷 [${pid}](https://www.luogu.com.cn/problem/${pid}) · 难度 ${difficulty}`,
        "",
        body,
        sampleMd ? `## 样例\n\n${sampleMd}` : "",
    ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

    return { title, description, sourceFiles: [] };
    },
};

export default fetchLuogu;
