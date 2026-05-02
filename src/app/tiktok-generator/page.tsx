"use client";

import { useState } from "react";
import styles from "./page.module.css";

type ContentType = "full" | "hook" | "script" | "caption";

interface GenerateResponse {
  result: string;
  contentType: ContentType;
  topic: string;
  error?: string;
}

const NICHES = [
  "General",
  "Fitness & Health",
  "Beauty & Fashion",
  "Finance & Business",
  "Food & Cooking",
  "Travel",
  "Tech & Gaming",
  "Education",
  "Comedy & Entertainment",
  "Motivation & Self-improvement",
  "Real Estate",
  "Parenting",
];

const TONES = [
  "Energetic & Hype",
  "Educational & Informative",
  "Funny & Witty",
  "Inspirational & Motivational",
  "Calm & Trustworthy",
  "Controversial & Bold",
  "Storytelling & Emotional",
];

export default function TikTokGenerator() {
  const [topic, setTopic] = useState("");
  const [niche, setNiche] = useState("General");
  const [tone, setTone] = useState("Energetic & Hype");
  const [duration, setDuration] = useState("30");
  const [contentType, setContentType] = useState<ContentType>("full");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic.");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");
    setCopied(false);

    try {
      const res = await fetch("/api/generate-tiktok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, niche, tone, duration, contentType }),
      });

      const data: GenerateResponse = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setResult(data.result);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const contentTypeLabels: Record<ContentType, string> = {
    full: "Full Package",
    hook: "Hooks Only",
    script: "Video Script",
    caption: "Captions Only",
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🎵</span>
          <span>1PStudio</span>
        </div>
        <h1 className={styles.title}>TikTok Content Generator</h1>
        <p className={styles.subtitle}>
          AI-powered scripts, hooks, captions &amp; hashtags — ready to film
        </p>
      </header>

      <main className={styles.main}>
        <section className={styles.formSection}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="topic">
              What&apos;s your video about? *
            </label>
            <input
              id="topic"
              className={styles.input}
              type="text"
              placeholder="e.g. 5 morning habits that changed my life"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              maxLength={200}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="niche">
                Niche
              </label>
              <select
                id="niche"
                className={styles.select}
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              >
                {NICHES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="tone">
                Tone
              </label>
              <select
                id="tone"
                className={styles.select}
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Video Duration</label>
            <div className={styles.durationGroup}>
              {(["15", "30", "60"] as const).map((d) => (
                <button
                  key={d}
                  className={`${styles.durationBtn} ${duration === d ? styles.durationBtnActive : ""}`}
                  onClick={() => setDuration(d)}
                  type="button"
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Generate</label>
            <div className={styles.contentTypeGroup}>
              {(Object.keys(contentTypeLabels) as ContentType[]).map((ct) => (
                <button
                  key={ct}
                  className={`${styles.contentTypeBtn} ${contentType === ct ? styles.contentTypeBtnActive : ""}`}
                  onClick={() => setContentType(ct)}
                  type="button"
                >
                  {contentTypeLabels[ct]}
                </button>
              ))}
            </div>
          </div>

          <button
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={loading}
            type="button"
          >
            {loading ? (
              <>
                <span className={styles.spinner} />
                Generating…
              </>
            ) : (
              "Generate Content"
            )}
          </button>

          {error && <p className={styles.error}>{error}</p>}
        </section>

        {result && (
          <section className={styles.resultSection}>
            <div className={styles.resultHeader}>
              <h2 className={styles.resultTitle}>Your Content</h2>
              <button className={styles.copyBtn} onClick={handleCopy} type="button">
                {copied ? "✓ Copied!" : "Copy All"}
              </button>
            </div>
            <pre className={styles.resultContent}>{result}</pre>
          </section>
        )}
      </main>
    </div>
  );
}
