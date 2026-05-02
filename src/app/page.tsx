import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        gap: "1.5rem",
        padding: "2rem",
      }}
    >
      <h1
        style={{
          fontSize: "clamp(2rem, 5vw, 3.5rem)",
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: "#f0f0f0",
          margin: 0,
        }}
      >
        1PStudio
      </h1>
      <p style={{ color: "#666", margin: 0, fontSize: "1.0625rem" }}>
        AI-powered content tools for creators
      </p>
      <Link
        href="/tiktok-generator"
        style={{
          background: "linear-gradient(135deg, #fe2c55, #c9014b)",
          borderRadius: "12px",
          color: "#fff",
          fontSize: "1rem",
          fontWeight: 600,
          padding: "0.875rem 2rem",
          textDecoration: "none",
          marginTop: "0.5rem",
        }}
      >
        🎵 TikTok Content Generator
      </Link>
    </main>
  );
}
