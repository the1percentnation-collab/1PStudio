import { spawn } from "node:child_process";

export interface FfprobeInfo {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  codec: string;
}

export async function ffprobe(path: string): Promise<FfprobeInfo> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_streams",
    "-show_format",
    path,
  ]);
  const data = JSON.parse(out.stdout) as {
    streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string }>;
    format: { duration?: string };
  };
  const v = data.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error("no video stream");
  const [num, den] = (v.avg_frame_rate ?? "30/1").split("/").map(Number);
  return {
    durationSec: parseFloat(data.format.duration ?? "0"),
    width: v.width ?? 0,
    height: v.height ?? 0,
    fps: den ? num / den : 30,
    hasAudio: data.streams.some((s) => s.codec_type === "audio"),
    codec: v.codec_name,
  };
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/**
 * Spawn ffmpeg/ffprobe/yt-dlp. `onProgress` receives out_time seconds parsed
 * from `-progress pipe:2` style output (used for Temporal heartbeats upstream).
 */
export function run(
  cmd: string,
  args: string[],
  opts: { onProgress?: (outTimeSec: number) => void; timeoutMs?: number } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : undefined;

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      if (stderr.length > 1_000_000) stderr = stderr.slice(-500_000);
      if (opts.onProgress) {
        const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
        if (m) opts.onProgress(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
      }
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
