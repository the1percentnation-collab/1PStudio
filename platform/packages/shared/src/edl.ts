import type { AspectRatio } from "./pipeline";

/**
 * The Edit Decision List: a declarative description of a clip's edit,
 * executed by services/render. Editing a clip mutates the EDL and
 * re-triggers RENDER only — never the whole pipeline.
 * Times are seconds relative to the SOURCE video unless noted.
 */

export interface CropKeyframe {
  /** Seconds relative to clip start. */
  t: number;
  /** Crop-window center X in source pixels. */
  cx: number;
  /** Crop-window center Y in source pixels. */
  cy: number;
  /** Step (scene cut) vs linear interpolation into the NEXT keyframe. */
  interp?: "linear" | "step";
}

export type EditOp =
  | { kind: "trim"; startSec: number; endSec: number }
  | { kind: "removeFiller"; ranges: [number, number][] }
  | { kind: "cropPath"; aspect: AspectRatio; keyframes: CropKeyframe[] }
  | { kind: "captionBurn"; captionSetId: string }
  | { kind: "watermark"; assetKey?: string; position?: "br" | "bl" | "tr" | "tl" }
  | { kind: "textOverlay"; atSec: number; durationSec: number; text: string; style?: string }
  | { kind: "music"; assetKey: string; gainDb: number; duck: boolean }
  | { kind: "transition"; atSec: number; style: "cut" | "fade" | "whip" }
  // ---- priced-but-stubbed ops (render rejects them with a typed error today) ----
  | { kind: "broll"; atSec: number; durationSec: number; assetKey: string; source: "image" | "stock" | "generated" }
  | { kind: "voiceover"; atSec: number; audioKey: string }
  | { kind: "dub"; language: string; audioKey: string }
  | { kind: "intro"; assetKey: string }
  | { kind: "outro"; assetKey: string };

export interface Edl {
  version: number;
  ops: EditOp[];
}

export function getTrim(edl: Edl): { startSec: number; endSec: number } | undefined {
  const op = edl.ops.find((o): o is Extract<EditOp, { kind: "trim" }> => o.kind === "trim");
  return op ? { startSec: op.startSec, endSec: op.endSec } : undefined;
}

const STUBBED_OPS = new Set(["broll", "voiceover", "dub", "intro", "outro"]);

export function isStubbedOp(op: EditOp): boolean {
  return STUBBED_OPS.has(op.kind);
}
