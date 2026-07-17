import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerAuthRoutes } from "./auth";
import { registerClipRoutes } from "./routes/clips";
import { registerCreditRoutes } from "./routes/credits";
import { registerMetadataRoutes } from "./routes/metadata";
import { registerProjectRoutes } from "./routes/projects";
import { registerPublishRoutes } from "./routes/publish";
import { registerVideoRoutes } from "./routes/videos";

const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024 });

app.register(cors, { origin: true });

app.get("/healthz", async () => ({ ok: true, service: "api" }));

registerAuthRoutes(app);
registerVideoRoutes(app);
registerProjectRoutes(app);
registerClipRoutes(app);
registerCreditRoutes(app);
registerMetadataRoutes(app);
registerPublishRoutes(app);

const port = Number(process.env.API_PORT ?? 3001);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
