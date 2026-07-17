# 1P Clip — AI Video Repurposing Platform

OpusClip-class pipeline: **one long video in → ranked, captioned, vertical clips out**, then schedule and publish. Lives alongside (and does not touch) the original 1P Studio CRA + Firebase app at the repo root; that tool's brand-voice metadata generator is ported into this platform as the AI title/description/hashtag service.

```
INGEST → TRANSCRIBE → ANALYZE → SELECT → REFRAME → CAPTION → EDIT → BRAND → RENDER → PUBLISH
 yt-dlp    ASR seam    scenes    virality  Kalman     ASS burn  filler  template  FFmpeg    scheduler
 upload    (whisper/   faces     score     crop path  karaoke   removal watermark 9:16 mp4  (stub seam)
           mock)       energy    0-100     9:16/1:1   highlight
```

## Layout

| Path | What |
|---|---|
| `packages/shared` | Contracts: pipeline stages, **credits (single source of truth)**, EDL types, captions, virality, metadata |
| `packages/db` | Prisma schema (workspaces, projects, clips, EDL, renders, append-only credit ledger, API keys, jobs) + seed |
| `services/api` | REST app plane (Fastify): auth, uploads, videos, clips, EDL patch, credits, metadata, publish |
| `services/orchestrator` | Temporal worker: durable `videoPipeline` + cheap `renderClip` re-render workflow |
| `services/ml` | FastAPI intelligence plane; every model behind a seam in `app/models/*` with a working CPU mock |
| `services/render` | FFmpeg engine: ingest/normalize/hash/thumbs + EDL executor (crop-path, ASS captions, watermark) + NLE XML |
| `services/mcp` | MCP server: `clip_video`, `get_clips`, `schedule_post`, `generate_metadata` over the REST API |
| `apps/web` | Next.js app: upload → pipeline progress → clip grid → editor/metadata/publish |
| `api-spec/openapi.yaml` | Public API contract (source for SDK generation) |
| `infra/k8s` | Reference manifests incl. dedicated GPU pool for ml |

## Quickstart

```bash
cd platform
cp .env.example .env
docker compose up -d --build          # postgres, redis, temporal(+ui :8233), minio(:9001), ml, render, orchestrator, api

pnpm install
DATABASE_URL=postgresql://onepct:onepct@localhost:5432/onepct pnpm --filter @onepct/db migrate:deploy
DATABASE_URL=postgresql://onepct:onepct@localhost:5432/onepct pnpm --filter @onepct/db seed   # prints API key: dev_sk_local

pnpm --filter @onepct/web dev         # web app on :3000
```

Run a video through the pipeline (no keys required — deterministic mocks):

```bash
AUTH="Authorization: Bearer dev_sk_local"
# generate + upload a sample inside the render container, or bring your own upload/URL
curl -X POST :3001/v1/videos -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"uploadKey":"sources/sample.mp4","options":{"clipCount":3,"lengthBucket":"0-30s","removeFillers":true}}'
curl :3001/v1/projects/<projectId> -H "$AUTH"          # watch INGEST→…→RENDER
curl :3001/v1/projects/<projectId>/clips -H "$AUTH"    # virality-ranked clips + mp4 URLs
curl -X PATCH :3001/v1/clips/<clipId>/edl -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"ops":[...]}'                                    # edits re-render only (EDL is declarative)
curl -X POST :3001/v1/clips/<clipId>/metadata -H "$AUTH"  # 1P Studio brand-voice generator
curl :3001/v1/credits/ledger -H "$AUTH"                 # per-stage charges, append-only
```

Dev harness without the API: `pnpm exec tsx scripts/start-pipeline.ts --uploadKey sources/sample.mp4`.

## Real models & vendors (the seams)

Everything runs end-to-end on CPU mocks. Swap a stub by implementing its interface in one file — the pipeline never changes:

| Capability | Seam | Wire in |
|---|---|---|
| Transcription | `services/ml/app/models/asr.py` | `WITH_WHISPER=1` image build or `pip install -r requirements-whisper.txt` (`ASR_BACKEND=whisper`) |
| Clip selection + virality | `services/ml/app/models/selector.py` | set `ANTHROPIC_API_KEY` (falls back to heuristic) |
| Scene/face detection | `services/ml/app/models/vision.py` | PySceneDetect / YOLO+ByteTrack |
| Metadata generator | `services/api/src/metadata/service.ts` | set `ANTHROPIC_API_KEY` (mock offline) |
| Dubbing / TTS / gen-B-roll | `services/ml/app/models/{dubbing,tts,broll}.py` | vendor of choice; EDL ops + credit prices already exist |
| Social posting | `services/api/src/publish/publisher.ts` | per-platform OAuth publishers; scheduler already works |
| NVENC encode | `services/render` env `USE_NVENC=1` | GPU render nodes |

## MCP (agents)

```json
{ "mcpServers": { "onepct-clip": {
    "command": "node", "args": ["platform/services/mcp/dist/server.js"],
    "env": { "ONEPCT_API_URL": "http://localhost:3001", "ONEPCT_API_KEY": "dev_sk_local" } } } }
```

## Design invariants

1. One stage = one Temporal activity — idempotent, retryable, never double-charges (ledger idempotency keys).
2. Credits are defined once in `packages/shared/src/credits.ts`; pipeline metering, the API preflight, and the estimate endpoint all read it.
3. Whole-video stages cache by `contentHash` (Redis) — identical sources are analyzed once, ever.
4. The EDL is declarative — editing mutates it and re-runs RENDER only.
5. Models live behind seams in `ml/app/models/*` — swap a vendor by editing one file.
6. API-first — the web app, MCP server, and future SDKs consume the same REST contract (`api-spec/openapi.yaml`).

## Behind a TLS-intercepting proxy?

Drop your CA as `build-certs/ca-bundle.crt` before `docker compose build` (see `build-certs/README.md`). Images are apt-free (static ffmpeg, pip/npm only) so they build in restricted networks.
