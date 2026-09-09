const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Connection: "keep-alive",
};

function extractMatchInfo(inputUrl) {
  const m = inputUrl.match(/\/(\d{5,})\//);
  if (m) {
    const slug = inputUrl.split(m[1] + "/")[1] || "";
    return { matchId: m[1], slug };
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

async function fetchPage(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
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

// ========== PARSE INFO (NO SQUADS TO PREVENT DUPLICATION) ==========
function parseInfo(html) {
  if (!html) return { error: "Could not fetch page" };
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

    // Exclude squad listings from info so squads only appear once
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

  return result;
}

// ========== PARSE LIVE & COMMENTARY ==========
function parseLiveAndCommentary(liveHtml, fullCommHtml) {
  const result = {
    live: {},
    commentary: [],
  };

  const html = liveHtml || fullCommHtml;
  if (!html) return result;
  const $ = cheerio.load(html);

  const status = $(".text-cbPreview").first().text().trim();
  if (status) result.live.status = status;

  // Start times
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

  // Parse all commentary items (over by over, ball by ball)
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

  // Live gets only the most recent live update / latest ball
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

// ========== PARSE SCORECARD ==========
function parseScorecard(html) {
  if (!html) return { status: "Could not fetch scorecard" };
  const $ = cheerio.load(html);
  const result = {};

  if (
    $("div:contains('scorecard will appear once the match starts')").length > 0 &&
    $(".scorecard-bat-grid").length === 0
  ) {
    result.status = "Match not started yet";
    return result;
  }

  const statusEl = $(".text-cbPreview, .cb-text-preview").first();
  if (statusEl.length) result.status = statusEl.text().trim();

  // Batting
  const battingData = [];
  $("div[class*='scorecard-bat-grid']").each((_, row) => {
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

  // Bowling
  const bowlingData = [];
  $("div[class*='scorecard-bowl-grid']").each((_, row) => {
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

  if (battingData.length > 0) result.batting = battingData;
  if (bowlingData.length > 0) result.bowling = bowlingData;

  // Fall of Wickets (Clean Structured Output)
  const fows = [];
  $(".scorecard-fow-grid, [class*='scorecard-fow-grid']").each((_, row) => {
    const cols = $(row).children();
    if (cols.length >= 3) {
      const col0 = cols.eq(0).text().trim();
      const score = cols.eq(1).text().trim();
      const over = cols.eq(2).text().trim();

      if (score && /\d+-\d+/.test(score)) {
        const player = col0.replace(/View match performance.*$/i, "").replace(/View profile.*$/i, "").trim();
        fows.push({
          score,
          player,
          over,
        });
      }
    }
  });
  if (fows.length > 0) result.fall_of_wickets = fows;

  return result;
}

// ========== PARSE SQUADS (NO DUPLICATES, NO PROFILE LINKS, MANDATORY ROLE) ==========
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
        // Col 0: Team 1
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

        // Col 1: Team 2
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

// ========== PARSE POINTS TABLE (PARSES CRICBUZZ CSS GRID TABLE) ==========
function parsePointsTable(html) {
  if (!html) return { status: "Could not fetch points table" };
  const $ = cheerio.load(html);
  const standings = [];

  $(".point-table-grid").each((i, row) => {
    if (i === 0) return; // Header row
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

// ========== MAIN SCRAPER ==========
async function scrapeMatch(inputUrl) {
  const info = extractMatchInfo(inputUrl);
  if (!info) return { error: "Please provide a valid Cricbuzz match URL" };

  const { matchId, slug } = info;
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

  const { live, commentary } = parseLiveAndCommentary(liveHtml, fullCommHtml);

  const data = {
    created_by: "Created By Viruna Randinu",
    info: parseInfo(infoHtml),
    live,
    scorecard: parseScorecard(scorecardHtml),
    squads: parseSquads(squadsHtml, infoHtml),
    full_commentary: commentary,
  };

  if (ptHtml) {
    data.points_table = parsePointsTable(ptHtml);
  }

  return data;
}

module.exports = { scrapeMatch };
