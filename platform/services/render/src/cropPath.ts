import type { AspectRatio, CropKeyframe } from "@onepct/shared";

export interface CropGeometry {
  cropW: string; // ffmpeg expression
  cropH: string;
  xExpr: string;
  yExpr: string;
}

const RATIO: Record<AspectRatio, number> = { "9:16": 9 / 16, "1:1": 1, "16:9": 16 / 9 };

const MAX_SEGMENTS = 40;

/** Decimate keyframes to a bounded segment count so the ffmpeg expression stays sane. */
export function decimate(keyframes: CropKeyframe[], max = MAX_SEGMENTS): CropKeyframe[] {
  if (keyframes.length <= max) return keyframes;
  const out: CropKeyframe[] = [];
  const step = (keyframes.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const kf = keyframes[Math.round(i * step)];
    // Never drop a scene-cut step keyframe silently — keep the nearest one's interp.
    out.push(kf);
  }
  return out;
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(3) : "0";
}

/**
 * CropKeyframe[] (center positions, seconds relative to clip start) →
 * piecewise crop x/y expressions: sum of half-open window terms
 * gte(t,t0)*lt(t,t1)*lerp(...), clamped into frame. Scene cuts use step terms.
 */
export function buildCropGeometry(aspect: AspectRatio, keyframes: CropKeyframe[]): CropGeometry {
  const r = RATIO[aspect];
  // Crop window sized to the limiting dimension of the source.
  const cropW = `min(iw\\,ih*${fmt(r)})`;
  const cropH = `min(ih\\,iw/${fmt(r)})`;

  const kfs = decimate(
    [...keyframes].sort((a, b) => a.t - b.t).filter((k, i, arr) => i === 0 || k.t > arr[i - 1].t)
  );

  const axisExpr = (axis: "cx" | "cy", sizeExpr: string, boundExpr: string): string => {
    if (kfs.length === 0) return `(${boundExpr}-${sizeExpr})/2`;
    if (kfs.length === 1) return clampExpr(`${fmt(kfs[0][axis])}-${sizeExpr}/2`, sizeExpr, boundExpr);
    const terms: string[] = [];
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i];
      const b = kfs[i + 1];
      const t0 = fmt(a.t);
      const t1 = fmt(b.t);
      const window = i === 0 ? `lt(t\\,${t1})` : `gte(t\\,${t0})*lt(t\\,${t1})`;
      const value =
        a.interp === "step"
          ? fmt(a[axis])
          : `(${fmt(a[axis])}+(${fmt(b[axis])}-${fmt(a[axis])})*(t-${t0})/(${t1}-${t0}))`;
      terms.push(`${window}*(${value})`);
    }
    const last = kfs[kfs.length - 1];
    terms.push(`gte(t\\,${fmt(last.t)})*${fmt(last[axis])}`);
    return clampExpr(`(${terms.join("+")})-${sizeExpr}/2`, sizeExpr, boundExpr);
  };

  return {
    cropW,
    cropH,
    xExpr: axisExpr("cx", cropW, "iw"),
    yExpr: axisExpr("cy", cropH, "ih"),
  };
}

function clampExpr(topLeft: string, sizeExpr: string, boundExpr: string): string {
  return `max(0\\,min(${boundExpr}-${sizeExpr}\\,${topLeft}))`;
}

/** Output pixel dimensions for aspect × resolution tier. */
export function outputDims(aspect: AspectRatio, resolution: "R720" | "R1080" | "R4K"): { w: number; h: number } {
  const short = resolution === "R720" ? 720 : resolution === "R1080" ? 1080 : 2160;
  if (aspect === "9:16") return { w: short, h: Math.round((short * 16) / 9 / 2) * 2 };
  if (aspect === "1:1") return { w: short, h: short };
  return { w: Math.round((short * 16) / 9 / 2) * 2, h: short };
}
