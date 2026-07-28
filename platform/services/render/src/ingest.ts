import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffprobe, run, type FfprobeInfo } from "./ffmpeg";
import { BUCKETS, downloadToFile, uploadFile } from "./storage";

export interface IngestRequest {
  sourceVideoId: string;
  originUrl?: string; // YouTube / public MP4 URL (yt-dlp)
  uploadKey?: string; // "sources/..." key of a direct upload
}

export interface IngestResult {
  contentHash: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  normalizedKey: string;
  thumbKeys: { hook: string; mid: string; end: string };
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/**
 * Download (yt-dlp) or fetch (MinIO) → sha256 contentHash of the ORIGINAL →
 * normalize to a uniform working format → probe → extract hook/mid/end
 * thumbnails (they feed the ported 1P Studio metadata generator) → upload all.
 */
export async function ingest(req: IngestRequest): Promise<IngestResult> {
  const dir = await mkdtemp(join(tmpdir(), "ingest-"));
  try {
    const rawPath = join(dir, "raw.mp4");

    if (req.originUrl) {
      const [ytCmd, ...ytPre] = (process.env.YTDLP_CMD ?? "yt-dlp").split(" ");
      await run(
        ytCmd,
        [...ytPre, "-f", "bv*[height<=1080]+ba/b[height<=1080]/b", "--merge-output-format", "mp4", "-o", rawPath, req.originUrl],
        { timeoutMs: 15 * 60_000 }
      );
    } else if (req.uploadKey) {
      await downloadToFile(req.uploadKey, rawPath);
    } else {
      throw new Error("ingest requires originUrl or uploadKey");
    }

    const contentHash = await sha256File(rawPath);

    const normPath = join(dir, "norm.mp4");
    await run(
      "ffmpeg",
      [
        "-y", "-i", rawPath,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart",
        normPath,
      ],
      { timeoutMs: 30 * 60_000 }
    );

    const info: FfprobeInfo = await ffprobe(normPath);

    const thumbAt = async (pct: number, name: string): Promise<string> => {
      const t = Math.max(0, info.durationSec * pct);
      const out = join(dir, `${name}.jpg`);
      await run("ffmpeg", ["-y", "-ss", t.toFixed(2), "-i", normPath, "-frames:v", "1", "-q:v", "3", out]);
      const key = `${BUCKETS.artifacts}/${contentHash}/thumbs/${name}.jpg`;
      await uploadFile(key, out, "image/jpeg");
      return key;
    };

    const normalizedKey = `${BUCKETS.artifacts}/${contentHash}/normalized.mp4`;
    await uploadFile(normalizedKey, normPath, "video/mp4");
    const [hook, mid, end] = await Promise.all([thumbAt(0.04, "hook"), thumbAt(0.45, "mid"), thumbAt(0.85, "end")]);

    return {
      contentHash,
      durationSec: info.durationSec,
      width: info.width,
      height: info.height,
      fps: info.fps,
      normalizedKey,
      thumbKeys: { hook, mid, end },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
