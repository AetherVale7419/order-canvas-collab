import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiError, infraiFromEnvironment } from "./infrai_realtime";
import {
  DocumentAccessError,
  OrderEditorService,
  accessRequestSchema,
  publishRequestSchema,
} from "./order_editor";

const service = new OrderEditorService(infraiFromEnvironment());

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/editor/access") {
      const input = accessRequestSchema.parse(await readJson(request));
      return json(response, 200, await service.openDocument(input));
    }
    if (request.method === "POST" && request.url === "/editor/events") {
      const input = publishRequestSchema.parse(await readJson(request));
      return json(response, 202, await service.publishChange(input));
    }
    return json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) return json(response, 400, { error: "Invalid request", issues: error.issues });
    if (error instanceof DocumentAccessError) return json(response, 403, { error: error.message });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.message, code: error.code });
    }
    return json(response, 500, { error: "Unexpected service error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Order editor listening on http://localhost:${port}`));
