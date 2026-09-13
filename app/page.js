"use client";
import { useState } from "react";

// ========== TEXT RENDERER FUNCTIONS ==========

function renderInfo(info) {
  if (!info || info.error) return "  No match info available\n";
  let out = "";
  if (info.match_title) out += `  Match: ${info.match_title}\n`;
  if (info.match) out += `  ${info.match}\n`;
  if (info.series) out += `  Series: ${info.series}\n`;
  if (info.date) out += `  Date: ${info.date}\n`;
  if (info.time) out += `  Time: ${info.time}\n`;
  if (info.start_time) out += `  Start Time: ${info.start_time}\n`;
  if (info.end_time) out += `  End Time: ${info.end_time}\n`;
  if (info.venue) out += `  Venue: ${info.venue}\n`;
  if (info.stadium) out += `  Stadium: ${info.stadium}\n`;
  if (info.city) out += `  City: ${info.city}\n`;
  if (info.country) out += `  Country: ${info.country}\n`;
  if (info.capacity) out += `  Capacity: ${info.capacity}\n`;
  if (info.ends) out += `  Ends: ${info.ends}\n`;
  if (info.toss) out += `  Toss: ${info.toss}\n`;
  if (info.umpires) out += `  Umpires: ${info.umpires}\n`;
  if (info.third_umpire) out += `  3rd Umpire: ${info.third_umpire}\n`;
  if (info.referee) out += `  Referee: ${info.referee}\n`;
  if (info.teams) out += `  Teams: ${info.teams.join(" vs ")}\n`;
  if (info.hosts_to) out += `  Hosts To: ${info.hosts_to}\n`;

  // Any other keys not already printed
  const printed = new Set([
    "match_title", "match", "series", "date", "time", "start_time", "end_time",
    "venue", "stadium", "city", "country", "capacity", "ends", "toss",
    "umpires", "third_umpire", "referee", "teams", "hosts_to"
  ]);
  for (const [k, v] of Object.entries(info)) {
    if (!printed.has(k) && typeof v === "string") {
      out += `  ${k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}: ${v}\n`;
    }
  }
  return out || "  No match info available\n";
}

function renderLive(live) {
  if (!live || Object.keys(live).length === 0) return "  No live data available\n";
  let out = "";
  if (live.status) out += `  Status: ${live.status}\n`;
  if (live.start_times) {
    const st = live.start_times;
    if (st.ist) out += `  IST: ${st.ist}\n`;
    if (st.gmt) out += `  GMT: ${st.gmt}\n`;
    if (st.local) out += `  LOCAL: ${st.local}\n`;
  }
  if (live.latest_update) out += `  Latest Update: ${live.latest_update}\n`;
  if (live.latest_ball) {
    const lb = live.latest_ball;
    out += `  Latest Ball: `;
    if (lb.over) out += `Over ${lb.over} `;
    if (lb.badge) out += `[${lb.badge}] `;
    out += `${lb.text}\n`;
  }
  return out || "  No live data available\n";
}

function renderScorecard(scorecard) {
  if (!scorecard) return "  No scorecard data available\n";
  if (scorecard.status && !scorecard.batting && !scorecard.bowling) {
    return `  ${scorecard.status}\n`;
  }

  let out = "";
  if (scorecard.status) out += `  Status: ${scorecard.status}\n`;

  // Determine batting/bowling teams from the data structure
  // The scorecard has batting[] and bowling[] arrays
  // batting = the team that batted, bowling = the team that bowled against them
  if (scorecard.batting && scorecard.batting.length > 0) {
    out += "\n  --------- BATTING ---------\n";
    out += `  ${"Name".padEnd(25)} ${"R".padStart(4)} ${"B".padStart(4)} ${"4s".padStart(4)} ${"6s".padStart(4)} ${"SR".padStart(7)}\n`;
    out += `  ${"-".repeat(55)}\n`;
    for (const b of scorecard.batting) {
      const name = (b.name || "").padEnd(25);
      const r = (b.runs || "-").toString().padStart(4);
      const balls = (b.balls || "-").toString().padStart(4);
      const fours = (b.fours || "-").toString().padStart(4);
      const sixes = (b.sixes || "-").toString().padStart(4);
      const sr = (b.strike_rate || "-").toString().padStart(7);
      out += `  ${name} ${r} ${balls} ${fours} ${sixes} ${sr}\n`;
      if (b.dismissal) out += `    ${b.dismissal}\n`;
    }
  }

  if (scorecard.bowling && scorecard.bowling.length > 0) {
    out += "\n  --------- BOWLING ---------\n";
    out += `  ${"Name".padEnd(25)} ${"O".padStart(5)} ${"M".padStart(4)} ${"R".padStart(4)} ${"W".padStart(4)} ${"Econ".padStart(7)}\n`;
    out += `  ${"-".repeat(55)}\n`;
    for (const b of scorecard.bowling) {
      const name = (b.name || "").padEnd(25);
      const overs = (b.overs || "-").toString().padStart(5);
      const m = (b.maidens || "-").toString().padStart(4);
      const r = (b.runs || "-").toString().padStart(4);
      const w = (b.wickets || "-").toString().padStart(4);
      const econ = (b.economy || "-").toString().padStart(7);
      out += `  ${name} ${overs} ${m} ${r} ${w} ${econ}\n`;
    }
  }

  if (scorecard.fall_of_wickets && scorecard.fall_of_wickets.length > 0) {
    out += "\n  --------- FALL OF WICKETS ---------\n";
    out += `  ${"Player".padEnd(25)} ${"Score".padStart(8)} ${"Over".padStart(6)}\n`;
    out += `  ${"-".repeat(42)}\n`;
    for (const f of scorecard.fall_of_wickets) {
      out += `  ${(f.player || "").padEnd(25)} ${(f.score || "").padStart(8)} ${(f.over || "").padStart(6)}\n`;
    }
  }

  return out || "  No scorecard data available\n";
}

function renderSquads(squads) {
  if (!squads) return "  No squad data available\n";
  if (squads.status) return `  ${squads.status}\n`;

  let out = "";
  for (const [teamName, teamData] of Object.entries(squads)) {
    out += `\n  --- ${teamName} ---\n`;

    if (teamData.playing_xi && teamData.playing_xi.length > 0) {
      out += "  Playing XI:\n";
      for (let i = 0; i < teamData.playing_xi.length; i++) {
        const p = teamData.playing_xi[i];
        out += `    ${(i + 1).toString().padStart(2)}. ${p.name}`;
        if (p.role && p.role !== "Player") out += ` (${p.role})`;
        out += "\n";
      }
    }

    if (teamData.bench && teamData.bench.length > 0) {
      out += "  Bench:\n";
      for (const p of teamData.bench) {
        out += `    - ${p.name}`;
        if (p.role && p.role !== "Player") out += ` (${p.role})`;
        out += "\n";
      }
    }

    if (teamData.support_staff && teamData.support_staff.length > 0) {
      out += "  Support Staff:\n";
      for (const p of teamData.support_staff) {
        out += `    - ${p.name}`;
        if (p.role) out += ` (${p.role})`;
        out += "\n";
      }
    }

    // Fallback for info-page squads format
    if (teamData.players && teamData.players.length > 0) {
      for (let i = 0; i < teamData.players.length; i++) {
        const p = teamData.players[i];
        out += `    ${(i + 1).toString().padStart(2)}. ${p.name}`;
        if (p.role && p.role !== "Player") out += ` (${p.role})`;
        out += "\n";
      }
    }
  }
  return out || "  No squad data available\n";
}

function renderPointsTable(points) {
  if (!points) return "";
  if (points.status) return `  ${points.status}\n`;
  if (!Array.isArray(points) || points.length === 0) return "  No points table data\n";

  let out = `  ${"#".padStart(3)} ${"Team".padEnd(30)} ${"P".padStart(3)} ${"W".padStart(3)} ${"L".padStart(3)} ${"NR".padStart(3)} ${"Pts".padStart(4)} ${"NRR".padStart(7)}\n`;
  out += `  ${"-".repeat(62)}\n`;
  for (const t of points) {
    out += `  ${(t.position || "").padStart(3)} ${(t.team || "").padEnd(30)} ${(t.played || "").padStart(3)} ${(t.won || "").padStart(3)} ${(t.lost || "").padStart(3)} ${(t.no_result || "").padStart(3)} ${(t.points || "").padStart(4)} ${(t.nrr || "").padStart(7)}\n`;
  }
  return out;
}

function renderCommentary(commentary) {
  if (!commentary || commentary.length === 0) return "  No commentary available\n";

  let out = "";
  const maxItems = 50; // Show last 50 commentary entries
  const items = commentary.slice(0, maxItems);
  for (const c of items) {
    let line = "  ";
    if (c.over) line += `[${c.over}] `;
    if (c.badge) line += `(${c.badge}) `;
    line += c.text;
    out += line + "\n";
  }
  if (commentary.length > maxItems) {
    out += `\n  ... and ${commentary.length - maxItems} more entries\n`;
  }
  return out;
}

// ========== MAIN FUNCTION: Convert full JSON to text ==========
function jsonToText(data) {
  let text = "";

  text += "Created By Viruna Randinu\n";
  text += "=".repeat(60) + "\n\n";

  // MATCH INFO
  text += "======== MATCH INFO ========\n";
  text += renderInfo(data.info);
  text += "\n";

  // LIVE STATUS
  text += "======== LIVE STATUS ========\n";
  text += renderLive(data.live);
  text += "\n";

  // SCORECARD
  text += "======== SCORECARD ========\n";
  text += renderScorecard(data.scorecard);
  text += "\n";

  // SQUADS
  text += "======== SQUADS ========\n";
  text += renderSquads(data.squads);
  text += "\n";

  // POINTS TABLE
  if (data.points_table) {
    text += "======== POINTS TABLE ========\n";
    text += renderPointsTable(data.points_table);
    text += "\n";
  }

  // COMMENTARY
  text += "======== COMMENTARY ========\n";
  text += renderCommentary(data.full_commentary);
  text += "\n";

  text += "=".repeat(60) + "\n";
  text += "Created By Viruna Randinu\n";

  return text;
}

// ========== PAGE COMPONENT ==========
export default function Home() {
  const [url, setUrl] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleScrape = async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setOutput("");
    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scraping failed");
      const text = jsonToText(json);
      setOutput(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleScrape();
  };

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "10px" }}>
      <h1 style={{ color: "#00c896", fontSize: "22px", marginBottom: "4px" }}>
        🏏 Cricbuzz Scraper
      </h1>
      <p style={{ color: "#888", fontSize: "13px", margin: "0 0 16px 0" }}>
        Created By Viruna Randinu — Paste any Cricbuzz match URL below
      </p>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://www.cricbuzz.com/live-cricket-scores/..."
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "6px",
            border: "1px solid #333",
            backgroundColor: "#111",
            color: "#fff",
            fontSize: "14px",
            outline: "none",
          }}
        />
        <button
          onClick={handleScrape}
          disabled={loading}
          style={{
            padding: "10px 20px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: loading ? "#555" : "#00c896",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Scraping..." : "Scrape"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            backgroundColor: "#2a0a0a",
            border: "1px solid #ff4444",
            borderRadius: "6px",
            color: "#ff6666",
            fontSize: "13px",
            marginBottom: "16px",
          }}
        >
          Error: {error}
        </div>
      )}

      {output && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "6px" }}>
            <button
              onClick={() => navigator.clipboard.writeText(output)}
              style={{
                padding: "6px 14px",
                borderRadius: "4px",
                border: "1px solid #00c896",
                backgroundColor: "transparent",
                color: "#00c896",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Copy Text
            </button>
          </div>
          <pre
            style={{
              backgroundColor: "#0d0d0d",
              padding: "16px",
              borderRadius: "6px",
              overflow: "auto",
              fontSize: "12px",
              lineHeight: "1.6",
              border: "1px solid #222",
              color: "#d0d0d0",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
