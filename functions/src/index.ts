import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import Anthropic from "@anthropic-ai/sdk";
import * as express from "express";

initializeApp();

const app = express();
app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "1PStudio API" });
});

app.post("/api/generate-tiktok", async (req, res) => {
  const { topic, contentType, tone, duration, niche } = req.body as {
    topic: string;
    contentType: "hook" | "script" | "caption" | "full";
    tone: string;
    duration: string;
    niche: string;
  };

  if (!topic) {
    res.status(400).json({ error: "topic is required" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Anthropic API key not configured" });
    return;
  }

  const client = new Anthropic({ apiKey });

  const durationLabel = duration === "15" ? "15-second" : duration === "30" ? "30-second" : "60-second";
  const toneLabel = tone || "engaging and entertaining";
  const nicheLabel = niche || "general";

  const prompts: Record<string, string> = {
    hook: `Generate 3 attention-grabbing TikTok hooks for a ${durationLabel} video about "${topic}" in the ${nicheLabel} niche. Tone: ${toneLabel}.

Each hook should:
- Be 1-2 sentences max
- Start with a pattern interrupt or bold statement
- Create curiosity or urgency
- Work for a TikTok opening

Format as:
Hook 1: [hook text]
Hook 2: [hook text]
Hook 3: [hook text]`,

    script: `Write a TikTok video script for a ${durationLabel} video about "${topic}" in the ${nicheLabel} niche. Tone: ${toneLabel}.

Include:
- HOOK (0-3s): Opening line to stop the scroll
- BODY: Main content broken into short punchy beats
- CTA (last 3s): Clear call to action

Keep it conversational, fast-paced, and optimized for TikTok's format. Use [PAUSE], [TEXT ON SCREEN:], or [B-ROLL:] cues where helpful.`,

    caption: `Write 3 TikTok captions for a video about "${topic}" in the ${nicheLabel} niche. Tone: ${toneLabel}.

Each caption should:
- Be under 150 characters (TikTok best practice)
- Include a hook or question
- Have a soft CTA
- Feel native to TikTok

Format as:
Caption 1: [text]
Caption 2: [text]
Caption 3: [text]`,

    full: `Create a complete TikTok content package for a ${durationLabel} video about "${topic}" in the ${nicheLabel} niche. Tone: ${toneLabel}.

Provide:

## HOOKS (pick one)
3 attention-grabbing opening lines

## VIDEO SCRIPT
Full ${durationLabel} script with timing cues, dialogue, and visual directions

## CAPTION
Best caption option (under 150 chars) + 2 alternatives

## HASHTAGS
10-15 relevant hashtags — mix of niche, trending, and broad

## POSTING TIPS
2-3 quick tips for maximizing reach with this content`,
  };

  const promptKey = contentType || "full";
  const prompt = prompts[promptKey] ?? prompts.full;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You are an expert TikTok content strategist who specializes in viral short-form video content. You understand TikTok's algorithm, trends, and what drives engagement. Write in a natural, conversational style that resonates with TikTok audiences.",
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      res.status(500).json({ error: "Unexpected response type from AI" });
      return;
    }

    res.json({
      result: content.text,
      contentType: promptKey,
      topic,
      usage: message.usage,
    });
  } catch (err) {
    console.error("Anthropic API error:", err);
    res.status(500).json({ error: "Failed to generate content" });
  }
});

export const api = onRequest(app);

export const onUserCreated = onDocumentCreated("users/{userId}", (event) => {
  const data = event.data?.data();
  console.log("New user created:", event.params.userId, data);
});
