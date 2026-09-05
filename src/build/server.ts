// Live preview server for the generated site (zero deps, node:http). The
// SPA shell needs build/ served over a real origin (same-origin fetch of
// tree.json/notes.json/copied sources; file:// blocks it), and after each
// rebuild browsers should refresh — a tiny SSE endpoint, plus a client
// script injected into every served HTML page connecting to it.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

/** SSE endpoint the injected page scripts connect to. */
export const RELOAD_PATH = "/__mylearn/reload";

const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".cpp": "text/plain; charset=utf-8",
};

/** Injected before </body> of every served HTML page: reload on broadcast,
 *  reconnect after a dropped connection (e.g. a rebuild that closed it). */
const RELOAD_CLIENT = `<script>/* myLearn live-reload */
(function () {
    function connect() {
        var es = new EventSource("${RELOAD_PATH}");
        es.onmessage = function () { location.reload(); };
        es.onerror = function () { es.close(); setTimeout(connect, 1000); };
    }
    connect();
})();
</script>`;

export interface LiveServer {
    /** raw http server — await .listen(), call .close() on stop */
    server: http.Server;
    /** notify connected browsers to reload — call after each rebuild */
    broadcast(): void;
    /** end SSE connections and close the server (SIGINT) */
    close(): void;
}

export function buildServer(buildDir: string): LiveServer {
    const clients = new Set<http.ServerResponse>();
    const server = http.createServer((req, res) => {
        if (req.url?.split("?")[0] === RELOAD_PATH) {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-store",
                Connection: "keep-alive",
            });
            res.write(": connected\n\n");
            clients.add(res);
            req.on("close", () => clients.delete(res));
            return;
        }
        serveFile(req, res, buildDir);
    });
    // idle keep-alive sockets must not delay daemon shutdown
    server.keepAliveTimeout = 1500;
    return {
        server,
        broadcast() {
            for (const c of clients) c.write("data: reload\n\n");
        },
        close() {
            for (const c of clients) c.end();
            server.close();
        },
    };
}

function serveFile(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    buildDir: string
): void {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
    }
    let pathname: string;
    try {
        pathname = decodeURIComponent(
            new URL(req.url ?? "/", "http://localhost").pathname
        );
    } catch {
        res.writeHead(400).end();
        return;
    }
    if (pathname.includes("\0") || pathname.includes("\\")) {
        res.writeHead(400).end();
        return;
    }

    let rel = pathname.replace(/^\/+/, "");
    if (!rel) rel = "index.html";
    const file = path.resolve(buildDir, rel);
    // stay inside the build dir ('..' path segments are normalized by the
    // URL class; encoded ones are defeated here)
    if (file !== buildDir && !file.startsWith(buildDir + path.sep)) {
        res.writeHead(404).end();
        return;
    }

    let disk = file;
    try {
        const stat = fs.statSync(disk);
        if (stat.isDirectory()) {
            disk = path.join(file, "index.html");
            fs.statSync(disk);
        }
        const raw = fs.readFileSync(disk);
        const type = MIME[path.extname(disk).toLowerCase()] ?? "application/octet-stream";
        const body = type.startsWith("text/html")
            ? injectReload(raw.toString("utf-8"))
            : raw;
        res.writeHead(200, {
            "Content-Type": type,
            "Cache-Control": "no-store",
        });
        res.end(req.method === "HEAD" ? undefined : body);
    } catch {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
    }
}

function injectReload(html: string): string {
    const body = html.match(/<\/body>/i);
    return body ? html.replace(/<\/body>/i, `${RELOAD_CLIENT}</body>`) : html + RELOAD_CLIENT;
}
