import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isStubbedOp,
  type AspectRatio,
  type CaptionLine,
  type CaptionStyle,
  type Edl,
  type EditOp,
  type Resolution,
} from "@onepct/shared";
import { buildAss } from "./ass";
import { buildCropGeometry, outputDims } from "./cropPath";
import { ffprobe, run } from "./ffmpeg";
import { BUCKETS, downloadToFile, uploadFile } from "./storage";

export interface RenderRequest {
  renderId: string;
  clipId: string;
  sourceKey: string; // normalized source, "artifacts/<hash>/normalized.mp4"
  clip: { startSec: number; endSec: number };
  edl: Edl;
  captions?: { lines: CaptionLine[]; style?: Partial<CaptionStyle> };
  resolution: Resolution;
  watermarkText?: string;
  outputPrefix?: string; // defaults to "renders/<clipId>"
}

export interface RenderResult {
  outputKey: string;
  thumbKey: string;
  durationSec: number;
}

export class UnsupportedOpError extends Error {
  constructor(public readonly op: string) {
    super(`EDL op "${op}" is a priced-but-stubbed capability; no vendor is wired yet`);
  }
}

function esc(path: string): string {
  // Escape for use inside an ffmpeg filter argument.
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export async function renderEdl(req: RenderRequest, onProgress?: (sec: number) => void): Promise<RenderResult> {
  for (const op of req.edl.ops) {
    if (isStubbedOp(op)) throw new UnsupportedOpError(op.kind);
  }

  const dir = await mkdtemp(join(tmpdir(), "render-"));
  try {
    const srcPath = join(dir, "src.mp4");
    await downloadToFile(req.sourceKey, srcPath);
    const srcInfo = await ffprobe(srcPath);

    const trimOp = req.edl.ops.find((o): o is Extract<EditOp, { kind: "trim" }> => o.kind === "trim");
    const start = trimOp?.startSec ?? req.clip.startSec;
    const end = trimOp?.endSec ?? req.clip.endSec;
    if (!(end > start)) throw new Error(`invalid trim window ${start}-${end}`);

    const cropOp = req.edl.ops.find((o): o is Extract<EditOp, { kind: "cropPath" }> => o.kind === "cropPath");
    const aspect: AspectRatio = cropOp?.aspect ?? "9:16";
    const dims = outputDims(aspect, req.resolution);
    const geom = buildCropGeometry(aspect, cropOp?.keyframes ?? []);

    const inputs: string[] = ["-ss", start.toFixed(3), "-to", end.toFixed(3), "-i", srcPath];
    const vFilters: string[] = [];
    const extraInputs: { args: string[]; label: string }[] = [];

    // Filler removal happens first; times are relative to clip start (same
    // domain the ml editor used when it re-fit caption timings).
    const fillerOp = req.edl.ops.find((o): o is Extract<EditOp, { kind: "removeFiller" }> => o.kind === "removeFiller");
    let aChain = srcInfo.hasAudio ? "loudnorm" : "";
    if (fillerOp && fillerOp.ranges.length > 0) {
      const cond = fillerOp.ranges.map(([a, b]) => `between(t\\,${a.toFixed(3)}\\,${b.toFixed(3)})`).join("+");
      vFilters.push(`select='not(${cond})',setpts=N/FRAME_RATE/TB`);
      if (srcInfo.hasAudio) aChain = `aselect='not(${cond})',asetpts=N/SR/TB,loudnorm`;
    }

    vFilters.push(`crop=w='${geom.cropW}':h='${geom.cropH}':x='${geom.xExpr}':y='${geom.yExpr}'`);
    vFilters.push(`scale=${dims.w}:${dims.h}:flags=lanczos`, "setsar=1");

    const fontsDir = process.env.FONTS_DIR;
    if (req.captions && req.captions.lines.length > 0) {
      const assPath = join(dir, "captions.ass");
      await writeFile(assPath, buildAss(req.captions.lines, req.captions.style, dims.w, dims.h));
      vFilters.push(`ass='${esc(assPath)}'${fontsDir ? `:fontsdir='${esc(fontsDir)}'` : ""}`);
    }
    const fontFile = fontsDir ? `fontfile='${esc(join(fontsDir, "DejaVuSans-Bold.ttf"))}':` : "";

    for (const op of req.edl.ops) {
      if (op.kind === "textOverlay") {
        const text = op.text.replace(/'/g, "").replace(/:/g, "\\:").replace(/%/g, "\\%");
        vFilters.push(
          `drawtext=${fontFile}text='${text}':fontcolor=white:borderw=3:bordercolor=black:fontsize=${Math.round(dims.h * 0.035)}:x=(w-text_w)/2:y=h*0.12:enable='between(t\\,${op.atSec}\\,${op.atSec + op.durationSec})'`
        );
      } else if (op.kind === "transition" && op.style === "fade") {
        const dur = 0.35;
        if (op.atSec <= 1) vFilters.push(`fade=t=in:st=0:d=${dur}`);
        else vFilters.push(`fade=t=out:st=${(op.atSec - dur).toFixed(2)}:d=${dur}`);
      }
    }

    // Watermark: PNG asset overlay when provided, drawtext badge otherwise.
    const wmOp = req.edl.ops.find((o): o is Extract<EditOp, { kind: "watermark" }> => o.kind === "watermark");
    let filterComplex: string;
    if (wmOp?.assetKey) {
      const wmPath = join(dir, "wm.png");
      await downloadToFile(wmOp.assetKey, wmPath);
      extraInputs.push({ args: ["-i", wmPath], label: "wm" });
      const pos = overlayPos(wmOp.position ?? "br");
      filterComplex = `[0:v]${vFilters.join(",")}[v0];[1:v]scale=${Math.round(dims.w * 0.14)}:-1[wm];[v0][wm]overlay=${pos}[vout]`;
    } else {
      if (wmOp) {
        vFilters.push(
          `drawtext=${fontFile}text='${(req.watermarkText ?? "made with 1P Clip").replace(/'/g, "")}':fontcolor=white@0.6:borderw=2:bordercolor=black@0.4:fontsize=${Math.round(dims.h * 0.022)}:x=w-text_w-40:y=h-text_h-40`
        );
      }
      filterComplex = `[0:v]${vFilters.join(",")}[vout]`;
    }

    // Music bed: mix under the source audio (duck simplified to a fixed bed level).
    const musicOp = req.edl.ops.find((o): o is Extract<EditOp, { kind: "music" }> => o.kind === "music");
    let audioMap: string[] = srcInfo.hasAudio ? ["-map", "0:a"] : [];
    if (musicOp && srcInfo.hasAudio) {
      const musicPath = join(dir, "music.m4a");
      await downloadToFile(musicOp.assetKey, musicPath);
      extraInputs.push({ args: ["-stream_loop", "-1", "-i", musicPath], label: "music" });
      const musicIdx = wmOp?.assetKey ? 2 : 1;
      const gain = Math.pow(10, (musicOp.gainDb - (musicOp.duck ? 12 : 0)) / 20).toFixed(3);
      filterComplex += `;[0:a]${aChain || "anull"}[a0];[${musicIdx}:a]volume=${gain}[am];[a0][am]amix=inputs=2:duration=first[aout]`;
      audioMap = ["-map", "[aout]"];
      aChain = "";
    } else if (srcInfo.hasAudio && aChain) {
      filterComplex += `;[0:a]${aChain}[aout]`;
      audioMap = ["-map", "[aout]"];
    }

    const outPath = join(dir, "out.mp4");
    const args = [
      "-y",
      ...inputs,
      ...extraInputs.flatMap((e) => e.args),
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      ...audioMap,
      "-c:v", process.env.USE_NVENC === "1" ? "h264_nvenc" : "libx264",
      "-preset", process.env.USE_NVENC === "1" ? "p5" : "medium",
      ...(process.env.USE_NVENC === "1" ? [] : ["-crf", "19"]),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      "-shortest",
      outPath,
    ];
    await run("ffmpeg", args, { onProgress, timeoutMs: 30 * 60_000 });

    const outInfo = await ffprobe(outPath);
    const thumbPath = join(dir, "thumb.jpg");
    await run("ffmpeg", ["-y", "-ss", (outInfo.durationSec * 0.1).toFixed(2), "-i", outPath, "-frames:v", "1", "-q:v", "3", thumbPath]);

    const prefix = req.outputPrefix ?? `${BUCKETS.renders}/${req.clipId}`;
    const outputKey = `${prefix}/v${req.edl.version}_${req.resolution}.mp4`;
    const thumbKey = `${prefix}/v${req.edl.version}_thumb.jpg`;
    await uploadFile(outputKey, outPath, "video/mp4");
    await uploadFile(thumbKey, thumbPath, "image/jpeg");

    return { outputKey, thumbKey, durationSec: outInfo.durationSec };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function overlayPos(corner: "br" | "bl" | "tr" | "tl"): string {
  switch (corner) {
    case "br": return "W-w-48:H-h-48";
    case "bl": return "48:H-h-48";
    case "tr": return "W-w-48:48";
    case "tl": return "48:48";
  }
}
