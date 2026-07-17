import Fastify from "fastify";
import { ffprobe } from "./ffmpeg";
import { ingest, type IngestRequest } from "./ingest";
import { buildPremiereXml, type NleExportInput } from "./nle";
import { renderEdl, UnsupportedOpError, type RenderRequest } from "./renderEdl";

const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

// Renders are heavy; bound concurrency with a tiny semaphore.
const MAX_CONCURRENT = Number(process.env.RENDER_CONCURRENCY ?? 2);
let active = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((res) => waiters.push(res));
  active++;
}
function release(): void {
  active--;
  waiters.shift()?.();
}

app.get("/healthz", async () => ({ ok: true, service: "render" }));

app.post("/ingest", async (req, reply) => {
  try {
    const result = await ingest(req.body as IngestRequest);
    return result;
  } catch (err) {
    req.log.error(err);
    reply.code(500);
    return { error: (err as Error).message };
  }
});

app.post("/render", async (req, reply) => {
  await acquire();
  try {
    const result = await renderEdl(req.body as RenderRequest);
    return result;
  } catch (err) {
    req.log.error(err);
    if (err instanceof UnsupportedOpError) {
      reply.code(422);
      return { error: err.message, code: "UNSUPPORTED_OP", op: err.op };
    }
    reply.code(500);
    return { error: (err as Error).message };
  } finally {
    release();
  }
});

app.post("/nle/premiere-xml", async (req) => {
  const xml = buildPremiereXml(req.body as NleExportInput);
  return { xml };
});

app.post("/probe", async (req, reply) => {
  const { path } = req.body as { path: string };
  try {
    return await ffprobe(path);
  } catch (err) {
    reply.code(500);
    return { error: (err as Error).message };
  }
});

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
