/**
 * NLE timeline export: FCP7-interchange XML (xmeml v4), importable by both
 * Adobe Premiere Pro and DaVinci Resolve. Exports the DECISION (in/out points
 * on the source), not baked pixels — the editor re-links to the source file.
 */
export interface NleExportInput {
  projectTitle: string;
  clipTitle: string;
  sourceFileName: string; // e.g. "normalized.mp4"
  fps: number;
  sourceWidth: number;
  sourceHeight: number;
  startSec: number;
  endSec: number;
}

export function buildPremiereXml(input: NleExportInput): string {
  const fps = Math.round(input.fps) || 30;
  const inF = Math.round(input.startSec * fps);
  const outF = Math.round(input.endSec * fps);
  const durF = outF - inF;
  const name = escapeXml(input.clipTitle);
  const file = escapeXml(input.sourceFileName);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>${name}</name>
    <duration>${durF}</duration>
    <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <width>${input.sourceWidth}</width>
            <height>${input.sourceHeight}</height>
          </samplecharacteristics>
        </format>
        <track>
          <clipitem id="clipitem-1">
            <name>${name}</name>
            <duration>${durF}</duration>
            <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
            <start>0</start>
            <end>${durF}</end>
            <in>${inF}</in>
            <out>${outF}</out>
            <file id="file-1">
              <name>${file}</name>
              <pathurl>./${file}</pathurl>
              <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
              <media>
                <video>
                  <samplecharacteristics>
                    <width>${input.sourceWidth}</width>
                    <height>${input.sourceHeight}</height>
                  </samplecharacteristics>
                </video>
                <audio><channelcount>2</channelcount></audio>
              </media>
            </file>
          </clipitem>
        </track>
      </video>
      <audio>
        <track>
          <clipitem id="clipitem-2">
            <name>${name}</name>
            <duration>${durF}</duration>
            <start>0</start>
            <end>${durF}</end>
            <in>${inF}</in>
            <out>${outF}</out>
            <file id="file-1"/>
          </clipitem>
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
