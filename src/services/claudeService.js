function extractFrameAt(video, pct) {
  return new Promise((resolve) => {
    const targetTime = video.duration * pct;
    video.currentTime = targetTime;

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
      } catch {
        resolve(null);
      }
    };

    video.addEventListener('seeked', onSeeked);
  });
}

export async function extractFramesFromVideo(videoFile) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      try {
        // hook frame (very start), mid frame, end frame
        const hookFrame = await extractFrameAt(video, 0.04);
        const midFrame = await extractFrameAt(video, 0.45);
        const endFrame = await extractFrameAt(video, 0.85);
        URL.revokeObjectURL(url);
        resolve({ hookFrame, midFrame, endFrame });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ hookFrame: null, midFrame: null, endFrame: null });
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ hookFrame: null, midFrame: null, endFrame: null });
    };

    video.src = url;
  });
}

// Legacy single-frame export kept for backwards compatibility
export async function extractFrameFromVideo(videoFile) {
  const { hookFrame } = await extractFramesFromVideo(videoFile);
  return hookFrame;
}

const SYSTEM_PROMPT = `You are a TikTok content strategist for The One Percent Nation, a self-help and leadership coaching brand. The creator is Anthony Brown, a Black male leader, real estate broker turned full-time entrepreneur, faith-adjacent, direct communicator, Oklahoma-based. His content pillars are: limiting beliefs, self-accountability, identity and mindset, leadership and purpose. His hook style: second-person identity challenges, truth bombs, direct confrontation of excuses.

Return ONLY valid JSON with no markdown, no backticks, no preamble. Fields:
- headline (string): punchy, all-caps title optimized for TikTok search — max 60 chars
- seo_opener (string): first 3 seconds of spoken text or on-screen text that stops the scroll
- caption (string): full TikTok caption including opening line, body, and soft CTA — 150-300 chars
- hashtags (string): 12-15 hashtags, mix of niche, broad, and trending — space-separated
- content_pillar (string): one of "Self-Sabotage & Limiting Beliefs", "Accountability & Execution", "Identity & Mindset Shift", "Leadership & Purpose"
- hook_score (number 1-10): how strong the opening hook is
- hook_score_reason (string): one sentence explaining the score and one concrete tip to improve it
- titles (array of 3 strings): alternate video title options, each a different angle
- transcript_summary (string): 1-2 sentence summary of what the video is about (derive from transcript if provided, otherwise from frames)`;

function buildImageBlock(base64, label) {
  return [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
    { type: 'text', text: label },
  ];
}

export async function generateTikTokContent(videoFile, apiKey, onProgress, transcript = '') {
  onProgress('Extracting frames...');

  let frames = { hookFrame: null, midFrame: null, endFrame: null };
  try {
    frames = await extractFramesFromVideo(videoFile);
  } catch {
    /* non-fatal */
  }

  onProgress('Analyzing with Claude...');

  const contentBlocks = [];

  if (frames.hookFrame) contentBlocks.push(...buildImageBlock(frames.hookFrame, '[HOOK FRAME — opening shot]'));
  if (frames.midFrame)  contentBlocks.push(...buildImageBlock(frames.midFrame,  '[MID FRAME — ~45% through video]'));
  if (frames.endFrame)  contentBlocks.push(...buildImageBlock(frames.endFrame,  '[END FRAME — ~85% through video]'));

  const transcriptSection = transcript.trim()
    ? `\n\nVIDEO TRANSCRIPT:\n"""\n${transcript.trim()}\n"""\n`
    : '';

  contentBlocks.push({
    type: 'text',
    text: `Video filename: "${videoFile.name}"${transcriptSection}\n\nGenerate the full content strategy JSON as instructed.`,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contentBlocks }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';

  onProgress('Parsing response...');

  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    throw new Error('Failed to parse Claude response as JSON');
  }

  return {
    headline: parsed.headline || '',
    seo_opener: parsed.seo_opener || '',
    caption: parsed.caption || '',
    hashtags: parsed.hashtags || '',
    content_pillar: parsed.content_pillar || 'Identity & Mindset Shift',
    hook_score: typeof parsed.hook_score === 'number' ? parsed.hook_score : 5,
    hook_score_reason: parsed.hook_score_reason || '',
    titles: Array.isArray(parsed.titles) ? parsed.titles : [],
    transcript_summary: parsed.transcript_summary || '',
  };
}
