#!/usr/bin/env node
/**
 * MCP server: exposes the clipping platform to AI agents (Claude, Cursor,
 * Cline, Continue) as tools. Thin over the public REST API — agents and
 * humans share one contract, one auth model, one credit meter.
 *
 * Config (env): ONEPCT_API_URL (default http://localhost:3001),
 *               ONEPCT_API_KEY (workspace API key).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.ONEPCT_API_URL ?? "http://localhost:3001";
const API_KEY = process.env.ONEPCT_API_KEY ?? "dev_sk_local";

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

const server = new McpServer({ name: "onepct-clip", version: "0.1.0" });

server.tool(
  "clip_video",
  "Submit a video (YouTube/public URL) to the AI clipping pipeline. Returns a projectId to poll with get_clips. The pipeline transcribes, selects the most viral moments, reframes to vertical, captions, brands, and renders.",
  {
    url: z.string().describe("YouTube or public video URL"),
    clipCount: z.number().int().min(1).max(10).default(5).describe("How many clips to produce"),
    lengthBucket: z.enum(["0-30s", "30-60s", "1-3m", "3-5m"]).default("30-60s"),
    prompt: z.string().optional().describe("Prompt-to-clip guidance, e.g. 'every moment discussing pricing'"),
    removeFillers: z.boolean().default(true),
  },
  async ({ url, clipCount, lengthBucket, prompt, removeFillers }) =>
    jsonResult(
      await api("/v1/videos", {
        method: "POST",
        body: JSON.stringify({ url, title: url, options: { clipCount, lengthBucket, prompt, removeFillers } }),
      })
    )
);

server.tool(
  "get_clips",
  "Get the clips of a project: virality scores (0-100 with hook/flow/value/trend breakdown), time ranges, render status and download URLs. Also reports per-stage pipeline progress.",
  { projectId: z.string() },
  async ({ projectId }) => {
    const [project, clips] = await Promise.all([
      api(`/v1/projects/${projectId}`),
      api(`/v1/projects/${projectId}/clips`),
    ]);
    return jsonResult({ project, ...(clips as object) });
  }
);

server.tool(
  "schedule_post",
  "Schedule a clip for publishing to a social platform. Title/description/hashtags are AI-prefilled from the brand-voice metadata generator when omitted.",
  {
    clipId: z.string(),
    platform: z.enum(["TIKTOK", "YOUTUBE", "INSTAGRAM", "X"]),
    scheduledAt: z.string().optional().describe("ISO-8601 time; omit to draft immediately"),
    title: z.string().optional(),
    description: z.string().optional(),
  },
  async ({ clipId, ...body }) =>
    jsonResult(await api(`/v1/clips/${clipId}/publish`, { method: "POST", body: JSON.stringify(body) }))
);

server.tool(
  "generate_metadata",
  "Generate brand-voice content metadata for a clip (titles, hook score, caption, hashtags, content pillar) using the 1P Studio generator.",
  { clipId: z.string() },
  async ({ clipId }) => jsonResult(await api(`/v1/clips/${clipId}/metadata`, { method: "POST" }))
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("onepct-clip MCP server on stdio");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
