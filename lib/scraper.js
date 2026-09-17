const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Connection: "keep-alive",
};

// 1. URL & MATCH INFO EXTRACTION
function extractMatchInfo(inputUrl) {
  if (!inputUrl) return null;
  const str = String(inputUrl).trim();

  const m = str.match(/(?:^|\/)(\d{5,})(?:\/|$|\?)/);
  if (m) {
    const matchId = m[1];
    let slug = "";
    if (str.includes(matchId + "/")) {
      slug = str.split(matchId + "/")[1].split("?")[0].replace(/\/+$/, "") || "";
    }
    return { matchId, slug };
  }
  return null;
}

function buildUrls(matchId, slug) {
  const base = "https://www.cricbuzz.com";
  const s = slug ? `/${slug}` : "";
  return {
    info: `${base}/cricket-match-facts/${matchId}${s}`,
    live: `${base}/live-cricket-scores/${matchId}${s}`,
    scorecard: `${base}/live-cricket-scorecard/${matchId}${s}`,
    squads: `${base}/cricket-match-squads/${matchId}${s}`,
    overs: `${base}/live-cricket-over-by-over/${matchId}${s}`,
    fullCommentary: `${base}/live-cricket-full-commentary/${matchId}${s}`,
    highlights: `${base}/cricket-match-highlights/${matchId}${s}`,
  };
}

// 2. CACHE-BUSTING FETCH
async function fetchPage(url) {
  try {
    const cbUrl =
      url +
      (url.includes("?") ? "&" : "?") +
      `_cb=${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const res = await fetch(cbUrl, {
      headers: {
        ...HEADERS,
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    return null;
  }
}

function nameFromUrl(href) {
  if (!href) return null;
  const parts = href.split("/");
  const slug = parts[parts.length - 1] || parts[parts.length - 2];
  if (!slug) return null;
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function oversStringToBalls(ovStr) {
  if (!ovStr) return 0;
  const cleaned = String(ovStr).replace(/[^\d\.]/g, "");
  const parts = cleaned.split(".");
  const ov = parseInt(parts[0], 10) || 0;
  const b = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
  return ov * 6 + b;
}

function parseRunsAndWkts(scoreStr) {
  if (!scoreStr) return { runs: 0, wkts: 0 };
  const m = String(scoreStr).match(/^(\d+)(?:-(\d+))?/);
  if (m) {
    return {
      runs: parseInt(m[1], 10) || 0,
      wkts: m[2] ? parseInt(m[2], 10) || 0 : 0,
    };
  }
  return { runs: 0, wkts: 0 };
}

// 3. IN-MEMORY MONOTONIC PROGRESSION ENGINE
const matchMemoryStore = new Map();
const MEMORY_TTL = 1000 * 60 * 60; // 1 hour

function applyMonotonicIntegrity(matchId, scorecard) {
  if (!matchId) return;
  const now = Date.now();

  for (const [id, rec] of matchMemoryStore.entries()) {
    if (now - rec.lastUpdated > MEMORY_TTL) matchMemoryStore.delete(id);
  }

  let mem = matchMemoryStore.get(matchId);
  if (!mem) {
    mem = { lastUpdated: now, innings: [] };
    matchMemoryStore.set(matchId, mem);
  }

  const incomingInnings = scorecard.innings || [];
  incomingInnings.forEach((inn, idx) => {
    const incBalls = oversStringToBalls(inn.overs);
    const { runs: incRuns, wkts: incWkts } = parseRunsAndWkts(inn.score);

    if (!mem.innings[idx]) {
      mem.innings[idx] = {
        balls: incBalls,
        runs: incRuns,
        wkts: incWkts,
        score: inn.score,
        overs: inn.overs,
        total: inn.total,
        batting: inn.batting,
        bowling: inn.bowling,
        fall_of_wickets: inn.fall_of_wickets,
      };
    } else {
      const prev = mem.innings[idx];
      if (incBalls < prev.balls) {
        inn.score = prev.score;
        inn.overs = prev.overs;
        inn.total = prev.total;
        if (!inn.batting || inn.batting.length < (prev.batting?.length || 0)) {
          inn.batting = prev.batting;
        }
        if (!inn.bowling || inn.bowling.length < (prev.bowling?.length || 0)) {
          inn.bowling = prev.bowling;
        }
        if (!inn.fall_of_wickets || inn.fall_of_wickets.length < (prev.fall_of_wickets?.length || 0)) {
          inn.fall_of_wickets = prev.fall_of_wickets;
        }
      } else {
        prev.balls = Math.max(prev.balls, incBalls);
        prev.runs = Math.max(prev.runs, incRuns);
        prev.wkts = Math.max(prev.wkts, incWkts);
        prev.score = inn.score;
        prev.overs = inn.overs;
        prev.total = inn.total;
        prev.batting = inn.batting;
        prev.bowling = inn.bowling;
        prev.fall_of_wickets = inn.fall_of_wickets;
      }
    }
  });

  mem.lastUpdated = now;
}

// 4. PARSE MATCH FACTS
function parseInfo(html) {
  if (!html) return {};
  const $ = cheerio.load(html);
  const result = {};

  const h1 = $("h1 span").first().text().trim();
  if (h1) result.match_title = h1;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const schema = JSON.parse($(el).html());
      if (schema["@type"] === "SportsEvent") {
        result.start_time = schema.startDate || "";
        result.end_time = schema.endDate || "";
        if (schema.location) {
          result.venue = schema.location.name || "";
          if (schema.location.address) {
            result.city = (schema.location.address.addressLocality || "").trim();
            result.country = schema.location.address.addressCountry || "";
          }
        }
        if (schema.competitor) result.teams = schema.competitor.map((c) => c.name);
        if (schema.superEvent) result.series = schema.superEvent.name || "";
      }
    } catch {}
  });

  $(".facts-row-grid").each((_, el) => {
    const label = $(el).find(".font-bold").first().text().trim();
    const allText = $(el).children().last().text().trim();
    if (!label || !allText || label === allText) return;
    if (label.toLowerCase().includes("squad")) return;

    const keyMap = {
      Match: "match",
      Series: "series",
      Date: "date",
      Time: "time",
      Venue: "venue",
      Umpires: "umpires",
      "3rd Umpire": "third_umpire",
      Referee: "referee",
      Toss: "toss",
      Stadium: "stadium",
      City: "city",
      Capacity: "capacity",
      Ends: "ends",
      "Hosts To": "hosts_to",
    };

    const key = keyMap[label] || label.toLowerCase().replace(/\s+/g, "_");
    result[key] = allText;
  });

  if (result.start_time) {
    const ts = Date.parse(result.start_time);
    if (!isNaN(ts)) {
      result.matchStartTimestamp = ts;
    }
  }

  return result;
}

// 5. PARSE LIVE & COMMENTARY
function parseLiveAndCommentary(liveHtml, fullCommHtml) {
  const result = { live: {}, commentary: [] };
  const html = liveHtml || fullCommHtml;
  if (!html) return result;
  const $ = cheerio.load(html);

  const statusEl = $(
    ".text-cbLive, .text-cbComplete, .text-cbPreview, .cb-text-live, .cb-text-complete, .cb-text-preview, .text-cbTextLink"
  ).first();
  const status = statusEl.text().trim();
  if (status && status !== "W" && status.length > 1) {
    result.live.status = status;
  }

  const times = [];
  $(".font-extrabold.text-xl").each((_, el) => {
    const time = $(el).text().trim();
    const label = $(el).next("span").text().trim();
    if (time) times.push(label ? `${time} ${label}` : time);
  });
  if (times.length > 0) {
    result.live.start_times = {
      ist: times[0] || "",
      gmt: times[1] || "",
      local: times[2] || "",
    };
  }

  const allComms = [];
  $(".flex.mx-4, .flex.wb\\:mx-4, div[class*='border-t']").each((_, el) => {
    const text = $(el).text().trim();
    const overEl = $(el).find(".font-bold.text-center, span.font-bold").first();
    const over = overEl.text().trim();

    if (
      text.length > 10 &&
      (over || text.includes("to ") || text.includes("won by") || text.includes("opt to"))
    ) {
      const badge = $(el).find("div.rounded-full").first().text().trim();
      const textDiv = $(el).children().last();
      const cleanText = textDiv.text().trim() || text;

      if (!allComms.some((c) => c.text === cleanText)) {
        const item = {};
        if (over && /^\d+\.?\d*$/.test(over)) item.over = over;
        if (badge) item.badge = badge;
        item.text = cleanText;
        allComms.push(item);
      }
    }
  });

  if (allComms.length > 0) {
    const latestBall = allComms.find((c) => c.over);
    result.live.latest_update = allComms[0].text;
    if (latestBall) {
      result.live.latest_ball = latestBall;
    }
  }

  result.commentary = allComms;
  return result;
}

// 6. SCORECARD SUB-PARSERS
function parseBattingFromContainer($, container) {
  const battingData = [];
  container.find("div[class*='scorecard-bat-grid']").each((_, row) => {
    const divs = $(row).children("div");
    if (divs.length >= 5) {
      const firstDiv = divs.eq(0);
      let name = firstDiv.find("span.hover\\:underline").text().trim();
      if (!name) {
        const link = firstDiv.find("a[href*='/profiles/']").first();
        if (link.length) {
          const title = link.attr("title") || "";
          name = title.replace(/^View Profile Of\s*/i, "").trim();
          if (!name) name = nameFromUrl(link.attr("href"));
        }
      }
      if (!name || name === "Batter" || name === "Bowler") return;

      const dismissal = firstDiv
        .find(".text-cbTxtSec, [class*='text-cbTxtSec']")
        .text()
        .trim();
      const vals = [];
      for (let i = 1; i < divs.length; i++) vals.push(divs.eq(i).text().trim());

      const entry = { name };
      if (dismissal) entry.dismissal = dismissal;
      if (vals[0]) entry.runs = vals[0];
      if (vals[1]) entry.balls = vals[1];
      if (vals[2]) entry.fours = vals[2];
      if (vals[3]) entry.sixes = vals[3];
      if (vals[4]) entry.strike_rate = vals[4];
      battingData.push(entry);
    }
  });
  return battingData;
}

function parseBowlingFromContainer($, container) {
  const bowlingData = [];
  container.find("div[class*='scorecard-bowl-grid']").each((_, row) => {
    const divs = $(row).children("div");
    if (divs.length >= 5) {
      let name = divs.eq(0).find("span.hover\\:underline").text().trim();
      if (!name) name = nameFromUrl(divs.eq(0).find("a[href*='/profiles/']").first().attr("href"));
      if (!name || name === "Bowler" || name === "Batter") return;
      const vals = [];
      for (let i = 1; i < divs.length; i++) vals.push(divs.eq(i).text().trim());
      bowlingData.push({
        name,
        overs: vals[0],
        maidens: vals[1],
        runs: vals[2],
        wickets: vals[3],
        economy: vals[4] || "",
      });
    }
  });
  return bowlingData;
}

function parseFOWFromContainer($, container) {
  const fows = [];
  container.find(".scorecard-fow-grid, [class*='scorecard-fow-grid']").each((_, row) => {
    const cols = $(row).children();
    if (cols.length >= 3) {
      const col0 = cols.eq(0).text().trim();
      const score = cols.eq(1).text().trim();
      const over = cols.eq(2).text().trim();

      if (score && /\d+-\d+/.test(score)) {
        const player = col0
          .replace(/View match performance.*$/i, "")
          .replace(/View profile.*$/i, "")
          .trim();
        fows.push({ score, player, over });
      }
    }
  });
  return fows;
}

function parseScorecard(html) {
  if (!html) return { status: "Could not fetch scorecard" };
  const $ = cheerio.load(html);

  if (
    $("div:contains('scorecard will appear once the match starts')").length > 0 &&
    $(".scorecard-bat-grid").length === 0
  ) {
    return { status: "Match not started yet" };
  }

  const result = {};
  const statusEl = $(
    ".text-cbComplete, .text-cbLive, .text-cbPreview, .cb-text-complete, .cb-text-live, .cb-text-preview, .text-cbTextLink"
  ).first();
  if (statusEl.length) {
    const st = statusEl.text().trim();
    if (st && st !== "W" && st.length > 1) {
      result.status = st;
      if (/\b(won by|won the match|match tied|match drawn|no result|abandoned)\b/i.test(st)) {
        result.result = st;
      }
    }
  }

  const innings = [];
  $("div[id^='team-'][id*='-innings-']").each((_, headerEl) => {
    const header = $(headerEl);
    const inningsData = {};

    const shortName = header.find("div.font-bold").first().text().trim();
    if (shortName) inningsData.team_short = shortName;

    const fullName = header.find("div.hidden.tb\\:block").text().trim();
    if (fullName) inningsData.team_name = fullName;
    else if (shortName) inningsData.team_name = shortName;

    const spans = header.find("span");
    const scoreTxt = spans.eq(0).text().trim();
    const oversTxt = spans.eq(1).text().trim();
    if (scoreTxt) inningsData.score = scoreTxt;
    if (oversTxt) inningsData.overs = oversTxt.replace(/[()]/g, "").trim();

    const contentDiv = header.next();

    contentDiv.find("div").each((__, e) => {
      const t = $(e).text().trim();
      if (t.startsWith("Extras") && t.length < 100 && t.length > 6) {
        inningsData.extras = t.replace("Extras", "").trim();
      }
      if (t.startsWith("Total") && t.length < 100 && t.length > 5 && !inningsData.total) {
        inningsData.total = t.replace("Total", "").trim();
      }
    });

    const batting = parseBattingFromContainer($, contentDiv);
    if (batting.length > 0) inningsData.batting = batting;

    const bowling = parseBowlingFromContainer($, contentDiv);
    if (bowling.length > 0) inningsData.bowling = bowling;

    const fow = parseFOWFromContainer($, contentDiv);
    if (fow.length > 0) inningsData.fall_of_wickets = fow;

    innings.push(inningsData);
  });

  if (innings.length > 0) {
    result.innings = innings;
  }

  return result;
}

// 7. SQUADS PARSER
function parseSquads(squadsHtml, infoHtml) {
  const result = {};

  if (squadsHtml) {
    const $ = cheerio.load(squadsHtml);
    let team1 = $("h1.font-bold.ml-2").text().trim();
    let team2 = $("h1.font-bold.mr-2").text().trim();

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const schema = JSON.parse($(el).html());
        if (schema.competitor && schema.competitor.length >= 2) {
          team1 = schema.competitor[0].name || team1;
          team2 = schema.competitor[1].name || team2;
        }
      } catch {}
    });

    if (!team1) team1 = "Team 1";
    if (!team2) team2 = "Team 2";

    result[team1] = { playing_xi: [], bench: [], support_staff: [] };
    result[team2] = { playing_xi: [], bench: [], support_staff: [] };

    const seen1 = new Set();
    const seen2 = new Set();

    $("div.pb-5").each((_, section) => {
      const title = $(section).find("h1, h2, h3").first().text().trim().toLowerCase();
      let category = "bench";
      if (title.includes("playing xi")) category = "playing_xi";
      else if (title.includes("support")) category = "support_staff";
      else if (title.includes("bench")) category = "bench";

      const row = $(section).children("div").first();
      const cols = row.children();

      if (cols.length >= 2) {
        cols.eq(0).find("a[href*='/profiles/']").each((__, a) => {
          let name = $(a)
            .find("span")
            .filter((___, s) => {
              const t = $(s).text().trim();
              return t.length > 1 && !t.includes("View") && !t.includes("svg");
            })
            .first()
            .text()
            .trim();
          if (!name) name = nameFromUrl($(a).attr("href"));
          const role =
            $(a).find(".text-cbTxtSec, [class*='text-cbTxtSec']").first().text().trim() || "Player";

          if (name && !seen1.has(name)) {
            seen1.add(name);
            result[team1][category].push({ name, role });
          }
        });

        cols.eq(1).find("a[href*='/profiles/']").each((__, a) => {
          let name = $(a)
            .find("span")
            .filter((___, s) => {
              const t = $(s).text().trim();
              return t.length > 1 && !t.includes("View") && !t.includes("svg");
            })
            .first()
            .text()
            .trim();
          if (!name) name = nameFromUrl($(a).attr("href"));
          const role =
            $(a).find(".text-cbTxtSec, [class*='text-cbTxtSec']").first().text().trim() || "Player";

          if (name && !seen2.has(name)) {
            seen2.add(name);
            result[team2][category].push({ name, role });
          }
        });
      }
    });

    for (const team of [team1, team2]) {
      if (result[team].bench && result[team].bench.length === 0) delete result[team].bench;
      if (result[team].support_staff && result[team].support_staff.length === 0)
        delete result[team].support_staff;
      if (result[team].playing_xi && result[team].playing_xi.length === 0)
        delete result[team].playing_xi;
    }

    if (Object.keys(result[team1]).length > 0 || Object.keys(result[team2]).length > 0) {
      return result;
    }
  }

  // Fallback to Info page squads
  if (infoHtml) {
    const $ = cheerio.load(infoHtml);
    $(".facts-row-grid").each((_, el) => {
      const labelText = $(el).find(".font-bold").first().text().trim();
      if (!labelText.toLowerCase().includes("squad")) return;
      const teamName = labelText.replace(/\s*squad\s*/gi, "").trim();
      const players = [];
      const seen = new Set();

      $(el).find("a[href*='/profiles/']").each((__, a) => {
        let name = $(a).attr("title") || "";
        name = name.replace(/^View Profile Of\s*/i, "").trim();
        if (!name || name === "View profile") {
          name = nameFromUrl($(a).attr("href"));
        }
        if (name && !seen.has(name)) {
          seen.add(name);
          let role = "Player";
          if (name.includes("(c)")) role = "Captain";
          if (name.includes("(wk)")) role = "Wicket-Keeper";
          players.push({ name, role });
        }
      });

      if (players.length > 0) {
        result[teamName] = { players };
      }
    });
  }

  return Object.keys(result).length > 0 ? result : { status: "No squad data available" };
}

// 8. POINTS TABLE PARSER
function parsePointsTable(html) {
  if (!html) return { status: "Could not fetch points table" };
  const $ = cheerio.load(html);
  const standings = [];

  $(".point-table-grid").each((i, row) => {
    if (i === 0) return;
    const cols = $(row).children();
    if (cols.length >= 8) {
      const pos = cols.eq(0).text().trim();
      const team = cols.eq(1).text().trim();
      const p = cols.eq(2).text().trim();
      const w = cols.eq(3).text().trim();
      const l = cols.eq(4).text().trim();
      const nr = cols.eq(5).text().trim();
      const pts = cols.eq(6).text().trim();
      const nrr = cols.eq(7).text().trim();

      if (team) {
        standings.push({
          position: pos,
          team,
          played: p,
          won: w,
          lost: l,
          no_result: nr,
          points: pts,
          nrr,
        });
      }
    }
  });

  return standings.length > 0 ? standings : { status: "No points table data available" };
}

function getPointsTableUrl(html) {
  if (!html) return null;
  const $ = cheerio.load(html);
  let url = null;
  $("a[href*='points-table']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      url = href.startsWith("http") ? href : `https://www.cricbuzz.com${href}`;
      return false;
    }
  });
  return url;
}

// 9. BUILD REAL-TIME MATCH STATE, COUNTDOWN & MULTI-INNINGS SUMMARY
function buildStateAndSummary(info, live, scorecard, comm) {
  const now = Date.now();
  const startTs =
    info.matchStartTimestamp || (info.start_time ? Date.parse(info.start_time) : null);
  const innings = scorecard.innings || [];

  // 1. Result detection
  let resultText = scorecard.result || "";
  if (
    !resultText &&
    scorecard.status &&
    /\b(won by|won the match|tied|drawn|no result|abandoned)\b/i.test(scorecard.status)
  ) {
    resultText = scorecard.status;
  }
  if (
    !resultText &&
    live.status &&
    /\b(won by|won the match|tied|drawn|no result|abandoned)\b/i.test(live.status)
  ) {
    resultText = live.status;
  }
  if (!resultText && comm.length > 0) {
    const resComm = comm.find((c) =>
      /\b(won by|won the match|defeat.*in the final)\b/i.test(c.text)
    );
    if (resComm) {
      const m =
        resComm.text.match(/([^.]+won by [^.]+)/i) ||
        resComm.text.match(/([^.]+defeat [^.]+)/i);
      if (m) resultText = m[1].trim();
    }
  }

  // 2. Determine State & Countdown
  let status = "IN_PROGRESS";
  let stateLabel = "ON Progress";
  let statusText = "In Progress";
  let isUpcoming = false;
  let isLive = false;
  let isCompleted = false;
  let countdown = null;

  if (resultText) {
    status = "COMPLETED";
    stateLabel = "Match Ended";
    statusText = resultText;
    isCompleted = true;
  } else if (
    scorecard.status === "Match not started yet" ||
    (startTs && startTs > now && innings.length === 0)
  ) {
    status = "UPCOMING";
    stateLabel = "Upcoming";
    isUpcoming = true;

    if (startTs && startTs > now) {
      const diff = startTs - now;
      const totalSeconds = Math.floor(diff / 1000);
      const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");

      countdown = {
        hours,
        minutes,
        seconds,
        total_seconds: totalSeconds,
        formatted: `${hours}:${minutes}:${seconds}`,
        text: `${hours}h ${minutes}m ${seconds}s`,
      };
      statusText = `Match starts in ${countdown.text}`;
    } else {
      statusText = live.status || "Match not started yet";
    }
  } else {
    status = "IN_PROGRESS";
    stateLabel = "ON Progress";
    isLive = true;
    statusText = live.status || "Match in progress";
  }

  const matchState = {
    status,
    state_label: stateLabel,
    status_text: statusText,
    is_upcoming: isUpcoming,
    is_live: isLive,
    is_completed: isCompleted,
    start_time: info.start_time || null,
    matchStartTimestamp: startTs || null,
    current_timestamp: now,
    diff_ms: startTs ? startTs - now : null,
    countdown,
  };

  if (isCompleted && resultText) {
    matchState.result = resultText;
    const winMatch = resultText.match(/^([A-Za-z\s]+)\s+won/i);
    if (winMatch) matchState.winner = winMatch[1].trim();
  }

  // 3. Multi-Innings Score Summary (Includes BOTH Batting & Finished Teams)
  const teamNames = info.teams || [];
  const team1DefaultName = teamNames[0] || innings[0]?.team_name || "Team 1";
  const team2DefaultName = teamNames[1] || innings[1]?.team_name || "Team 2";

  let team1Obj = {
    name: team1DefaultName,
    short: innings[0]?.team_short || "",
    score: innings[0]?.score || (isUpcoming ? "Yet to bat" : "0-0"),
    runs: parseRunsAndWkts(innings[0]?.score).runs,
    wickets: parseRunsAndWkts(innings[0]?.score).wkts,
    overs: innings[0]?.overs || (isUpcoming ? "0.0 Ov" : "0.0 Ov"),
    total: innings[0]?.total || "",
    is_batting: false,
    is_completed: innings.length > 1 || isCompleted,
  };

  let team2Obj = {
    name: team2DefaultName,
    short: innings[1]?.team_short || "",
    score: innings[1]?.score || "Yet to bat",
    runs: parseRunsAndWkts(innings[1]?.score).runs,
    wickets: parseRunsAndWkts(innings[1]?.score).wkts,
    overs: innings[1]?.overs || "0.0 Ov",
    total: innings[1]?.total || "",
    is_batting: false,
    is_completed: isCompleted,
  };

  let currentBattingTeam = "";
  let currentBowlingTeam = "";
  let target = null;
  let runsNeeded = null;
  let ballsRemaining = null;
  let reqRunRate = null;
  let currRunRate = null;
  let equation = "";

  if (innings.length === 1) {
    team1Obj.is_batting = isLive;
    currentBattingTeam = team1Obj.name;
    currentBowlingTeam = team2Obj.name;
    if (innings[0].total) {
      const crrM = innings[0].total.match(/RR:\s*([\d\.]+)/i);
      if (crrM) currRunRate = crrM[1];
    }
  } else if (innings.length >= 2) {
    team1Obj.is_completed = true;
    team1Obj.is_batting = false;
    team2Obj.is_batting = isLive;
    currentBattingTeam = team2Obj.name;
    currentBowlingTeam = team1Obj.name;

    const t1Runs = team1Obj.runs;
    target = t1Runs > 0 ? t1Runs + 1 : null;
    if (target && isLive) {
      runsNeeded = Math.max(0, target - team2Obj.runs);
      const ballsBowled = oversStringToBalls(team2Obj.overs);
      ballsRemaining = Math.max(0, 120 - ballsBowled);
      if (ballsRemaining > 0) {
        reqRunRate = ((runsNeeded / ballsRemaining) * 6).toFixed(2);
      }
      equation = `${team2Obj.name} need ${runsNeeded} runs in ${ballsRemaining} balls`;
    }

    if (innings[1].total) {
      const crrM = innings[1].total.match(/RR:\s*([\d\.]+)/i);
      if (crrM) currRunRate = crrM[1];
    }
  }

  const matchSummary = {
    status,
    status_text: statusText,
    toss: info.toss || "",
    current_innings: innings.length || 0,
    current_batting_team: currentBattingTeam,
    current_bowling_team: currentBowlingTeam,
    target,
    runs_needed: runsNeeded,
    balls_remaining: ballsRemaining,
    req_run_rate: reqRunRate,
    curr_run_rate: currRunRate,
    equation: equation || resultText || statusText,
    team1: team1Obj,
    team2: team2Obj,
    innings: innings.map((inn, i) => ({
      innings_number: i + 1,
      team_name: inn.team_name,
      team_short: inn.team_short,
      score: inn.score,
      runs: parseRunsAndWkts(inn.score).runs,
      wickets: parseRunsAndWkts(inn.score).wkts,
      overs: inn.overs,
      total: inn.total,
      is_batting: i === innings.length - 1 && isLive,
      is_completed: i < innings.length - 1 || isCompleted,
    })),
  };

  // Enhance live object with both scores
  live.status = equation || resultText || live.status || statusText;
  live.team1_score = `${team1Obj.name} ${team1Obj.score}${
    team1Obj.overs ? " (" + team1Obj.overs + ")" : ""
  }`;
  live.team2_score = `${team2Obj.name} ${team2Obj.score}${
    team2Obj.overs ? " (" + team2Obj.overs + ")" : ""
  }`;
  live.current_score = innings.length >= 2 ? live.team2_score : live.team1_score;
  live.batting_team = currentBattingTeam;
  live.bowling_team = currentBowlingTeam;
  if (target) live.target = target;
  if (equation) live.equation = equation;

  return { matchState, matchSummary };
}

// 10. MAIN EXPORTED SCRAPER FUNCTION
async function scrapeMatch(inputUrl) {
  const infoData = extractMatchInfo(inputUrl);
  if (!infoData) {
    return { error: "Please provide a valid Cricbuzz match URL or Match ID" };
  }

  const { matchId, slug } = infoData;
  const urls = buildUrls(matchId, slug);

  const [infoHtml, liveHtml, scorecardHtml, squadsHtml, fullCommHtml] = await Promise.all([
    fetchPage(urls.info),
    fetchPage(urls.live),
    fetchPage(urls.scorecard),
    fetchPage(urls.squads),
    fetchPage(urls.fullCommentary),
  ]);

  const ptUrl = getPointsTableUrl(infoHtml || liveHtml);
  let ptHtml = null;
  if (ptUrl) ptHtml = await fetchPage(ptUrl);

  const info = parseInfo(infoHtml);
  const { live, commentary } = parseLiveAndCommentary(liveHtml, fullCommHtml);
  const scorecard = parseScorecard(scorecardHtml);

  // Apply monotonic progression integrity guard
  applyMonotonicIntegrity(matchId, scorecard);

  const { matchState, matchSummary } = buildStateAndSummary(
    info,
    live,
    scorecard,
    commentary
  );

  const data = {
    created_by: "Created By Viruna Randinu",
    match_state: matchState,
    match_summary: matchSummary,
    info,
    live,
    scorecard,
    squads: parseSquads(squadsHtml, infoHtml),
    full_commentary: commentary,
  };

  if (ptHtml) {
    data.points_table = parsePointsTable(ptHtml);
  }

  return data;
}

module.exports = { scrapeMatch, extractMatchInfo };
