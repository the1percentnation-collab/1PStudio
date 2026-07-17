import { createHash, randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { db } from "./lib/db";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";

export interface AuthContext {
  workspaceId: string;
  userId: string;
  via: "apiKey" | "session";
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

/**
 * One auth guard for humans and machines: `Authorization: Bearer <api-key>`
 * (hashed lookup — agents, SDKs, MCP) or `Bearer <JWT>` from the OTP flow.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.code(401).send({ error: "missing bearer token" });
    return;
  }
  const token = header.slice(7).trim();

  const hashedKey = createHash("sha256").update(token).digest("hex");
  const apiKey = await db.apiKey.findUnique({ where: { hashedKey } });
  if (apiKey && !apiKey.revokedAt) {
    db.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    req.auth = { workspaceId: apiKey.workspaceId, userId: apiKey.userId, via: "apiKey" };
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; workspaceId: string };
    req.auth = { workspaceId: payload.workspaceId, userId: payload.userId, via: "session" };
    return;
  } catch {
    reply.code(401).send({ error: "invalid token" });
  }
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/v1/auth/otp/request", async (req, reply) => {
    const { email } = req.body as { email?: string };
    if (!email) return reply.code(400).send({ error: "email required" });
    const user = await db.user.upsert({ where: { email }, update: {}, create: { email } });
    const code = String(randomInt(100000, 999999));
    await db.otpCode.create({
      data: { userId: user.id, code, expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    // Dev transport: the OTP goes to stdout. Swap in an email provider here.
    app.log.info(`OTP for ${email}: ${code}`);
    return { ok: true };
  });

  app.post("/v1/auth/otp/verify", async (req, reply) => {
    const { email, code } = req.body as { email?: string; code?: string };
    if (!email || !code) return reply.code(400).send({ error: "email and code required" });
    const user = await db.user.findUnique({ where: { email }, include: { memberships: true } });
    if (!user) return reply.code(401).send({ error: "invalid code" });
    const otp = await db.otpCode.findFirst({
      where: { userId: user.id, code, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!otp) return reply.code(401).send({ error: "invalid code" });
    await db.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

    let workspaceId = user.memberships[0]?.workspaceId;
    if (!workspaceId) {
      const workspace = await db.workspace.create({
        data: { name: `${email.split("@")[0]}'s workspace`, memberships: { create: { userId: user.id, role: "OWNER" } } },
      });
      workspaceId = workspace.id;
    }
    const token = jwt.sign({ userId: user.id, workspaceId }, JWT_SECRET, { expiresIn: "30d" });
    return { token, workspaceId };
  });
}
