#!/usr/bin/env node
// Local gallery server: serves index.html + candidate images, and accepts
// POST /feedback submissions which are appended to feedback-log.json and
// printed as FEEDBACK lines on stdout so the agent can pick them up.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.join(dir, "feedback-log.json");
const port = Number(process.env.PORT || 7331);

const candidates = JSON.parse(fs.readFileSync(path.join(dir, "prompts.json"), "utf8"));

const server = http.createServer((request, response) => {
	const url = new URL(request.url, `http://localhost:${port}`);

	if (url.pathname === "/feedback" && request.method === "POST") {
		let body = "";
		request.on("data", (chunk) => (body += chunk));
		request.on("end", () => {
			try {
				const payload = JSON.parse(body);
				const entry = {
					receivedAt: new Date().toISOString(),
					...payload,
				};
				const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf8")) : [];
				log.push(entry);
				fs.writeFileSync(logPath, `${JSON.stringify(log, null, "\t")}\n`);
				// Single-line stdout marker the agent watches for.
				console.log(`FEEDBACK ${JSON.stringify(entry)}`);
				response.writeHead(200, { "content-type": "application/json" });
				response.end(JSON.stringify({ ok: true }));
			} catch (error) {
				response.writeHead(400, { "content-type": "application/json" });
				response.end(JSON.stringify({ ok: false, error: String(error) }));
			}
		});
		return;
	}

	if (url.pathname === "/" || url.pathname === "/index.html") {
		response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		response.end(fs.readFileSync(path.join(dir, "index.html")));
		return;
	}

	if (url.pathname === "/candidates") {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify(candidates));
		return;
	}

	const safe = path.normalize(url.pathname).replace(/^([/\\])+/, "");
	if (!safe.startsWith("candidates") && safe !== "test.png") {
		response.writeHead(404);
		response.end("not found");
		return;
	}
	const filePath = path.join(dir, safe);
	if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
		response.writeHead(404);
		response.end("not found");
		return;
	}
	response.writeHead(200, { "content-type": "image/png" });
	response.end(fs.readFileSync(filePath));
});

server.on("error", (error) => {
	if (/** @type {any} */ (error).code === "EADDRINUSE") {
		console.log(`PORT ${port} IN USE`);
		process.exit(2);
	}
	throw error;
});

server.listen(port, () => {
	console.log(`GALLERY READY http://localhost:${port}`);
});
