export async function extractFrameFromVideo(videoFile) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, video.duration * 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        URL.revokeObjectURL(url);
        resolve(base64);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };

    video.src = url;
  });
}

const SYSTEM_PROMPT = `You are a TikTok content strategist for The One Percent Nation, a self-help and leadership coaching brand. The creator is Anthony Brown, a Black male leader, real estate broker turned full-time entrepreneur, faith-adjacent, direct communicator, Oklahoma-based. His content pillars are: limiting beliefs, self-accountability, identity and mindset, leadership and purpose. His hook style: second-person identity challenges, truth bombs, direct confrontation of excuses.

Analyze this video frame and return ONLY valid JSON with no markdown, no backticks, no preamble. Fields: headline, seo_opener, caption, hashtags, content_pillar, hook_score, hook_score_reason.`;

export async function generateTikTokContent(videoFile, apiKey, onProgress) {
  onProgress('Extracting frame...');

  let frameBase64;
  try {
    frameBase64 = await extractFrameFromVideo(videoFile);
  } catch {
    frameBase64 = null;
  }

  onProgress('Analyzing with Claude...');

  const messages = [
    {
      role: 'user',
      content: frameBase64
        ? [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: frameBase64,
              },
            },
            {
              type: 'text',
              text: `This is a frame from a TikTok video file named "${videoFile.name}". Generate the content strategy JSON as instructed.`,
            },
          ]
        : [
            {
              type: 'text',
              text: `Generate TikTok content strategy JSON for a video named "${videoFile.name}". Use the file name as a contextual clue.`,
            },
          ],
    },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages,
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
  };
}
