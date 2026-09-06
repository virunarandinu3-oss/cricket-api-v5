const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
    news: `${base}/cricket-match-news/${matchId}${s}`,
  };
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// ========== HELPER: Extract player name from URL slug ==========
function nameFromUrl(href) {
  if (!href) return null;
  const parts = href.split("/");
  const slug = parts[parts.length - 1] || parts[parts.length - 2];
  if (!slug) return null;
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ========== PARSE INFO ==========
function parseInfo(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const result = {};

  // Title
  const h1 = $("h1 span").first().text().trim();
  if (h1) result.match_title = h1;

  // Schema.org data
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

  // Facts grid
  $(".facts-row-grid").each((_, el) => {
    const label = $(el).find(".font-bold").first().text().trim();
    const allText = $(el).children().last().text().trim();
    if (!label || !allText || label === allText) return;

    const keyMap = {
      Match: "match", Series: "series", Date: "date", Time: "time",
      Venue: "venue", Umpires: "umpires", "3rd Umpire": "third_umpire",
      Referee: "referee", Toss: "toss", Stadium: "stadium", City: "city",
    };

    // Skip squad rows (handled separately below)
    if (label.toLowerCase().includes("squad")) return;

    const key = keyMap[label] || label.toLowerCase().replace(/\s+/g, "_");
    result[key] = allText;
  });

  // Squad info from info page
  const squads = {};
  $(".facts-row-grid").each((_, el) => {
    const labelText = $(el).find(".font-bold").first().text().trim();
    if (!labelText.toLowerCase().includes("squad")) return;
    const teamName = labelText.replace(/\s*squad\s*/gi, "").trim();
    const players = [];
    const supportStaff = [];
    let isSupport = false;

    $(el).find("a[href*='/profiles/']").each((__, link) => {
      const href = $(link).attr("href") || "";
      // Get the name from the link's title or from the visible span text
      let name = $(link).attr("title") || "";
      if (name) name = name.replace(/^View Profile Of\s*/i, "").trim();
      if (!name || name === "View profile") {
        // Try the visible text that's the player name (not "View profile" etc.)
        const spans = $(link).find("span.hover\\:underline, span.whitespace-nowrap");
        if (spans.length) name = spans.first().text().replace(/,\s*$/, "").trim();
      }
      if (!name || name === "View profile" || name === "View match performance") {
        // Try text content excluding nested menu items  
        const directText = $(link).clone().children("ul,div[role='menu']").remove().end().text().trim();
        const cleaned = directText.replace(/View match performance/g, "").replace(/View profile/g, "").replace(/,\s*$/, "").trim();
        if (cleaned && cleaned.length > 1) name = cleaned;
      }
      if (!name || name === "View profile" || name.length < 2) {
        name = nameFromUrl(href);
      }
      if (!name) return;

      const parentSection = $(link).closest(".flex-col").find(".font-bold").text().trim();
      if (parentSection === "Support Staff") isSupport = true;

      const entry = { name, profile: `https://www.cricbuzz.com${href}` };
      if (name.includes("(c)")) entry.role = "captain";
      if (name.includes("(wk)")) entry.role = "wicket_keeper";
      if (isSupport) { supportStaff.push(entry); } else { players.push(entry); }
    });

    // Deduplicate
    const seen = new Set();
    const dedup = (arr) => arr.filter((p) => {
      const key = p.profile;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    squads[teamName] = { players: dedup(players) };
    if (supportStaff.length > 0) squads[teamName].support_staff = dedup(supportStaff);
  });

  if (Object.keys(squads).length > 0) result.squads = squads;
  return result;
}

// ========== PARSE LIVE ==========
function parseLive(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const result = {};

  // Status
  const status = $(".text-cbPreview").first().text().trim();
  if (status) result.status = status;

  // Start times
  const times = [];
  $(".font-extrabold.text-xl").each((_, el) => {
    const time = $(el).text().trim();
    const label = $(el).next("span").text().trim();
    if (time) times.push(label ? `${time} ${label}` : time);
  });
  if (times.length > 0) {
    result.start_times = { ist: times[0] || "", gmt: times[1] || "", local: times[2] || "" };
  }

  // Commentary
  const commentary = [];
  $(".flex.mx-4, .flex.wb\\:mx-4").each((_, el) => {
    const overNum = $(el).find(".font-bold.text-center").first().text().trim();
    const commText = $(el).children("div").last().text().trim();
    if (commText && commText.length > 3) {
      const entry = {};
      if (overNum) entry.over = overNum;
      entry.text = commText;
      commentary.push(entry);
    }
  });
  if (commentary.length > 0) result.commentary = commentary;
  return result;
}

// ========== PARSE SCORECARD ==========
function parseScorecard(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const result = {};

  // Check not started
  if ($("div:contains('scorecard will appear once the match starts')").length > 0 &&
      $(".scorecard-bat-grid").length === 0) {
    result.status = "Match not started yet";
    result.start_time = $(".text-cbPreview").first().text().trim();
    return result;
  }

  // Match result status
  const statusEl = $(".text-cbPreview, .cb-text-preview").first();
  if (statusEl.length) result.status = statusEl.text().trim();

  const innings = [];
  let currentInnings = null;

  // Find innings headers (e.g., "Oman Innings", "Kuwait Innings")
  $(".w-full.py-2.px-3.bg-cbGrpHdrBkg, [class*='bg-cbGrpHdrBkg']").each((_, headerEl) => {
    const headerText = $(headerEl).text().trim().toUpperCase();
    if (headerText.includes("INNINGS") || headerText.includes("INNING")) {
      if (currentInnings) innings.push(currentInnings);
      currentInnings = { innings_title: $(headerEl).find("span").first().text().trim() || headerText, batters: [], bowlers: [], fall_of_wickets: [], extras: "", total: "" };
    }
  });

  // Parse batting rows
  $(".scorecard-bat-grid, [class*='scorecard-bat-grid']").each((_, row) => {
    const cells = $(row).children("div");
    if (cells.length < 5) return;

    // First cell has the player info
    const firstCell = cells.eq(0);
    const playerLink = firstCell.find("a[href*='/profiles/']").first();
    const playerSpan = firstCell.find("span.hover\\:underline").first();
    let playerName = playerSpan.text().trim();
    if (!playerName) {
      const title = playerLink.attr("title") || "";
      playerName = title.replace(/^View Profile Of\s*/i, "").trim();
    }
    if (!playerName) playerName = nameFromUrl(playerLink.attr("href"));
    if (!playerName || playerName.length < 2) return;

    // Dismissal text
    const dismissalEl = firstCell.find(".text-cbTxtSec").first();
    const dismissal = dismissalEl.text().trim();

    // Score columns: R, B, 4s, 6s, SR
    const runs = cells.eq(1).text().trim();
    const balls = cells.eq(2).text().trim();
    const fours = cells.eq(3).text().trim();
    const sixes = cells.eq(4).text().trim();
    const sr = cells.length > 5 ? cells.eq(5).text().trim() : "";

    // Skip header rows
    if (runs === "R" || playerName === "Batter" || playerName === "Bowler") return;

    const batter = { name: playerName, runs, balls, fours, sixes, strike_rate: sr };
    if (dismissal) batter.dismissal = dismissal;

    if (currentInnings) currentInnings.batters.push(batter);
  });

  // Parse bowling rows
  $("[class*='scorecard-bowl-grid']").each((_, row) => {
    const cells = $(row).children("div");
    if (cells.length < 5) return;

    const firstCell = cells.eq(0);
    const playerSpan = firstCell.find("span.hover\\:underline").first();
    let playerName = playerSpan.text().trim();
    if (!playerName) playerName = nameFromUrl(firstCell.find("a[href*='/profiles/']").first().attr("href"));
    if (!playerName || playerName === "Bowler") return;

    const overs = cells.eq(1).text().trim();
    const maidens = cells.eq(2).text().trim();
    const runs = cells.eq(3).text().trim();
    const wickets = cells.eq(4).text().trim();
    const econ = cells.length > 5 ? cells.eq(5).text().trim() : "";

    if (overs === "O") return;

    const bowler = { name: playerName, overs, maidens, runs, wickets, economy: econ };
    if (currentInnings) currentInnings.bowlers.push(bowler);
  });

  // Extras and Total
  $("[class*='extras'], [class*='total']").each((_, el) => {
    const text = $(el).text().trim();
    if (text.toLowerCase().includes("extra") && currentInnings) currentInnings.extras = text;
    if (text.toLowerCase().includes("total") && currentInnings) currentInnings.total = text;
  });

  // Fall of Wickets
  $("[class*='fow-grid'], [class*='fall-of-wicket']").each((_, el) => {
    const playerSpan = $(el).find("span.hover\\:underline").first();
    let name = playerSpan.text().trim();
    if (!name) name = nameFromUrl($(el).find("a[href*='/profiles/']").first().attr("href"));
    const allText = $(el).text().trim();
    const scoreMatch = allText.match(/(\d+)-(\d+)/);
    const overMatch = allText.match(/(\d+\.?\d*)\s*$/);
    if (name && scoreMatch) {
      const entry = { name, score: scoreMatch[0] };
      if (overMatch) entry.over = overMatch[1];
      if (currentInnings) currentInnings.fall_of_wickets.push(entry);
    }
  });

  if (currentInnings) innings.push(currentInnings);

  // If we couldn't parse structured innings, fallback to simpler parsing
  if (innings.length === 0 || (innings.every(inn => inn.batters.length === 0))) {
    // Simpler approach: look for scorecard data in grid elements
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
        if (!name || name === "Batter") return;
        
        const dismissal = firstDiv.find(".text-cbTxtSec, [class*='text-cbTxtSec']").text().trim();
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

    const bowlingData = [];
    $("div[class*='scorecard-bowl-grid']").each((_, row) => {
      const divs = $(row).children("div");
      if (divs.length >= 5) {
        let name = divs.eq(0).find("span.hover\\:underline").text().trim();
        if (!name) name = nameFromUrl(divs.eq(0).find("a[href*='/profiles/']").first().attr("href"));
        if (!name || name === "Bowler") return;
        const vals = [];
        for (let i = 1; i < divs.length; i++) vals.push(divs.eq(i).text().trim());
        bowlingData.push({ name, overs: vals[0], maidens: vals[1], runs: vals[2], wickets: vals[3], economy: vals[4] || "" });
      }
    });

    if (battingData.length > 0) result.batting = battingData;
    if (bowlingData.length > 0) result.bowling = bowlingData;

    // Fall of wickets text
    const fowTexts = [];
    $("div").each((_, el) => {
      const text = $(el).text().trim();
      if (text.startsWith("Fall of Wickets") && text.length < 500) {
        fowTexts.push(text);
      }
    });
    if (fowTexts.length > 0) result.fall_of_wickets = fowTexts;
  } else {
    result.innings = innings;
  }

  return result;
}

// ========== PARSE SQUADS ==========
function parseSquads(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const result = {};
  const teams = {};

  // Squads page uses h1 "playing XI" and player cards with profile links
  // Structure: <a href="/profiles/ID/slug"> with <span>Player Name</span> and <div class="text-cbTxtSec">Role</div>
  
  // Find team headers - look for team name headers
  const teamHeaders = [];
  $("h1, h2, h3, [class*='font-bold']").each((_, el) => {
    const text = $(el).text().trim();
    if (text === "Kuwait" || text === "Oman" || text.match(/^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/)) {
      // Could be a team name
    }
  });

  // Better approach: find all profile links in the squads page content area
  const mainContent = $("main, .min-h-container").first();
  const allPlayers = [];

  mainContent.find("a[href*='/profiles/']").each((_, link) => {
    const href = $(link).attr("href") || "";
    if (!href.includes("/profiles/")) return;

    // Get player name from span inside the link
    let name = $(link).find("span").filter((__, sp) => {
      const t = $(sp).text().trim();
      return t.length > 1 && t !== "View match performance" && t !== "View profile" && !t.includes("svg");
    }).first().text().trim();

    if (!name) name = nameFromUrl(href);
    if (!name || name.length < 2) return;

    // Get role
    const role = $(link).find(".text-cbTxtSec, [class*='text-cbTxtSec']").first().text().trim();

    const profileUrl = `https://www.cricbuzz.com${href}`;

    // Check if it's a captain/keeper mark
    const isCaptain = $(link).find("[class*='captain'], svg").length > 0 ||
                      $(link).parent().find("[title*='captain'], [title*='Captain']").length > 0;

    allPlayers.push({ name, role: role || undefined, profile: profileUrl });
  });

  // Deduplicate
  const seen = new Set();
  const uniquePlayers = allPlayers.filter((p) => {
    if (seen.has(p.profile)) return false;
    seen.add(p.profile);
    return true;
  });

  if (uniquePlayers.length > 0) {
    // Try to split into two teams - usually first half is team1, second is team2
    // Look for the team names from the page
    const teamNameEls = $("h1:contains('playing XI'), [class*='uppercase']").filter((_, el) => {
      const t = $(el).text().trim();
      return t.includes("playing XI") || t.includes("PLAYING XI") || t.includes("Squad");
    });

    // Get team names from schema
    let team1 = "", team2 = "";
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const schema = JSON.parse($(el).html());
        if (schema.competitor) {
          team1 = schema.competitor[0]?.name || "";
          team2 = schema.competitor[1]?.name || "";
        }
      } catch {}
    });

    if (team1 && team2) {
      // Split roughly in half
      const mid = Math.ceil(uniquePlayers.length / 2);
      teams[team1] = { players: uniquePlayers.slice(0, mid) };
      teams[team2] = { players: uniquePlayers.slice(mid) };
    } else {
      teams["all_players"] = { players: uniquePlayers };
    }
    result.squads = teams;
  } else {
    result.status = "No squad data found";
  }
  return result;
}

// ========== PARSE OVERS ==========
function parseOvers(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const overs = [];

  $(".flex.mx-4, .flex.wb\\:mx-4").each((_, el) => {
    const overNum = $(el).find(".font-bold.text-center").first().text().trim();
    const details = $(el).children("div").last().text().trim();
    if (details && details.length > 2) {
      const entry = {};
      if (overNum) entry.over = overNum;
      entry.text = details;
      overs.push(entry);
    }
  });

  return overs.length > 0 ? { overs } : { status: "No overs data yet" };
}

// ========== PARSE FULL COMMENTARY ==========
function parseFullCommentary(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const commentary = [];

  $(".flex.mx-4, .flex.wb\\:mx-4").each((_, el) => {
    const overBall = $(el).find(".font-bold.text-center").first().text().trim();
    const commText = $(el).children("div").last().text().trim();
    if (commText && commText.length > 3) {
      const entry = {};
      if (overBall) entry.over = overBall;
      const bold = $(el).find("b").first().text().trim();
      if (bold) entry.highlight = bold;
      entry.text = commText;
      commentary.push(entry);
    }
  });

  return commentary.length > 0 ? { commentary } : { status: "No commentary data yet" };
}

// ========== PARSE HIGHLIGHTS ==========
function parseHighlights(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const highlights = [];

  // Video highlights
  $("a[href*='/cricket-videos/']").each((_, el) => {
    const title = $(el).attr("title") || $(el).text().trim();
    const href = $(el).attr("href") || "";
    if (title && href && title.length > 3 && !title.includes("All Videos") && !title.includes("Categories")) {
      highlights.push({ title, url: `https://www.cricbuzz.com${href}` });
    }
  });

  // Match event highlights
  $(".flex.mx-4, .flex.wb\\:mx-4").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 5) {
      const bold = $(el).find("b").first().text().trim();
      const entry = { text };
      if (bold) entry.type = bold;
      highlights.push(entry);
    }
  });

  // Deduplicate
  const seen = new Set();
  const unique = highlights.filter((h) => {
    const key = h.url || h.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.length > 0 ? { highlights: unique } : { status: "No highlights yet" };
}

// ========== PARSE NEWS ==========
function parseNews(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const articles = [];
  const seen = new Set();

  $("a[href*='/cricket-news/']").each((_, el) => {
    const title = $(el).attr("title") || $(el).find("h2, h3, .font-bold").text().trim() || $(el).text().trim();
    const href = $(el).attr("href") || "";

    if (title && href && title.length > 5 && !title.includes("All Stories") &&
        !title.includes("Latest News") && !title.includes("Premium") && !title.includes("Topics")) {
      const url = href.startsWith("http") ? href : `https://www.cricbuzz.com${href}`;
      if (seen.has(url)) return;
      seen.add(url);
      articles.push({ title, url });
    }
  });

  return articles.length > 0 ? { news: articles } : { status: "No news yet" };
}

// ========== PARSE POINTS TABLE ==========
function parsePointsTable(html) {
  if (!html) return { error: "Could not fetch page" };
  const $ = cheerio.load(html);
  const tables = [];

  $("table").each((_, table) => {
    const headers = [];
    $(table).find("th").each((__, th) => headers.push($(th).text().trim()));
    const rows = [];
    $(table).find("tbody tr").each((__, tr) => {
      const row = {};
      $(tr).find("td").each((___, td, idx) => {
        row[headers[idx] || `col_${idx}`] = $(td).text().trim();
      });
      if (Object.keys(row).length > 0) rows.push(row);
    });
    if (rows.length > 0) tables.push({ headers, rows });
  });

  return tables.length > 0 ? { points_table: tables } : { status: "No points table yet" };
}

// ========== GET POINTS TABLE URL ==========
function getPointsTableUrl(html) {
  if (!html) return null;
  const $ = cheerio.load(html);
  let url = null;
  $("a[href*='points-table']").each((_, el) => {
    const href = $(el).attr("href");
    if (href) { url = href.startsWith("http") ? href : `https://www.cricbuzz.com${href}`; return false; }
  });
  return url;
}

// ========== MAIN SCRAPER ==========
async function scrapeMatch(inputUrl) {
  const info = extractMatchInfo(inputUrl);
  if (!info) return { error: "Please provide a valid Cricbuzz match URL" };

  const { matchId, slug } = info;
  const urls = buildUrls(matchId, slug);

  const [infoHtml, liveHtml, scorecardHtml, squadsHtml, oversHtml, commHtml, highlightsHtml, newsHtml] =
    await Promise.all([
      fetchPage(urls.info), fetchPage(urls.live), fetchPage(urls.scorecard),
      fetchPage(urls.squads), fetchPage(urls.overs), fetchPage(urls.fullCommentary),
      fetchPage(urls.highlights), fetchPage(urls.news),
    ]);

  const ptUrl = getPointsTableUrl(infoHtml || liveHtml);
  let ptHtml = null;
  if (ptUrl) ptHtml = await fetchPage(ptUrl);

  const data = {
    match_id: matchId,
    scraped_at: new Date().toISOString(),
    info: parseInfo(infoHtml),
    live: parseLive(liveHtml),
    scorecard: parseScorecard(scorecardHtml),
    squads: parseSquads(squadsHtml),
    overs: parseOvers(oversHtml),
    full_commentary: parseFullCommentary(commHtml),
    highlights: parseHighlights(highlightsHtml),
    news: parseNews(newsHtml),
  };

  if (ptHtml) data.points_table = parsePointsTable(ptHtml);
  return data;
}

module.exports = { scrapeMatch };
