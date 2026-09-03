"use client";
import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleScrape = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.දෝෂය || "Scraping failed");
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto" }}>
      <h1 style={{ color: "#009270", fontSize: "24px" }}>🏏 ක්‍රික්බස් ස්ක්‍රේපර්</h1>
      <p style={{ color: "#888" }}>Cricbuzz match URL එක දාන්න - සියලුම data JSON වලින් ලැබේ</p>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.cricbuzz.com/live-cricket-scores/170010/..."
          style={{
            flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #333",
            backgroundColor: "#1a1a1a", color: "#fff", fontSize: "14px"
          }}
        />
        <button
          onClick={handleScrape}
          disabled={loading}
          style={{
            padding: "12px 24px", borderRadius: "8px", border: "none",
            backgroundColor: "#009270", color: "#fff", cursor: "pointer",
            fontSize: "14px", fontWeight: "bold"
          }}
        >
          {loading ? "⏳ Scraping..." : "🔍 Scrape කරන්න"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px", backgroundColor: "#ff000022", border: "1px solid #ff0000", borderRadius: "8px", color: "#ff6666" }}>
          දෝෂය: {error}
        </div>
      )}

      {data && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <h2 style={{ color: "#009270" }}>📊 ප්‍රතිඵල</h2>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(data, null, 2));
              }}
              style={{
                padding: "8px 16px", borderRadius: "6px", border: "1px solid #009270",
                backgroundColor: "transparent", color: "#009270", cursor: "pointer"
              }}
            >
              📋 JSON Copy කරන්න
            </button>
          </div>
          <pre style={{
            backgroundColor: "#111", padding: "16px", borderRadius: "8px",
            overflow: "auto", maxHeight: "600px", fontSize: "12px",
            border: "1px solid #333", lineHeight: "1.5"
          }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ marginTop: "30px", padding: "16px", backgroundColor: "#111", borderRadius: "8px", border: "1px solid #333" }}>
        <h3 style={{ color: "#009270" }}>🔗 API භාවිතය</h3>
        <code style={{ color: "#00deaa" }}>GET /api/scrape?url=CRICBUZZ_MATCH_URL</code>
        <p style={{ color: "#888", marginTop: "10px" }}>
          ඕනෑම Cricbuzz match URL එකක් දෙන්න (Info, Live, Scorecard, Squads ආදිය). 
          Match ID එක extract කරලා සියලුම tabs scrape කරනවා.
        </p>
      </div>
    </div>
  );
}
