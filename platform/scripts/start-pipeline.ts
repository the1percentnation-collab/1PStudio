/**
 * Dev harness: enqueue a video through the full pipeline without the API.
 *   pnpm tsx scripts/start-pipeline.ts --uploadKey sources/sample.mp4
 *   pnpm tsx scripts/start-pipeline.ts --url https://www.youtube.com/watch?v=...
 */
import { Client, Connection } from "@temporalio/client";
import { getPrisma } from "@onepct/db";
import type { VideoPipelineInput } from "@onepct/shared";

async function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
  const uploadKey = args.get("uploadKey");
  const url = args.get("url");
  if (!uploadKey && !url) throw new Error("pass --uploadKey or --url");

  const db = getPrisma();
  const workspace = await db.workspace.findFirstOrThrow();
  const project = await db.project.create({
    data: {
      workspaceId: workspace.id,
      title: args.get("title") ?? (url ?? uploadKey ?? "untitled"),
      sourceVideo: { create: { originUrl: url, uploadKey } },
    },
    include: { sourceVideo: true },
  });
  const workflowId = `video-${project.sourceVideo!.id}`;
  const job = await db.job.create({ data: { projectId: project.id, workflowId, kind: "videoPipeline" } });

  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233" });
  const client = new Client({ connection });
  const input: VideoPipelineInput = {
    sourceVideoId: project.sourceVideo!.id,
    projectId: project.id,
    workspaceId: workspace.id,
    jobId: job.id,
    options: {
      clipCount: Number(args.get("clips") ?? 3),
      lengthBucket: "0-30s",
      resolution: "R1080",
      removeFillers: true,
    },
  };
  const handle = await client.workflow.start("videoPipeline", {
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? "video-pipeline",
    workflowId,
    args: [input],
  });
  console.log(`started ${workflowId} (project ${project.id})`);
  const result = await handle.result();
  console.log("pipeline done:", result);

  const clips = await db.clip.findMany({ where: { projectId: project.id }, include: { renders: true } });
  for (const clip of clips) {
    console.log(
      `clip ${clip.id} [${clip.startSec}-${clip.endSec}] virality=${clip.viralityScore} "${clip.title}" -> ` +
        clip.renders.map((r) => `${r.resolution}:${r.status}:${r.outputKey}`).join(", ")
    );
  }
  const ledger = await db.creditLedger.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } });
  console.log("ledger:", ledger.map((l) => `${l.reason}:${l.stage ?? "-"}:${l.delta}`).join(" | "));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
