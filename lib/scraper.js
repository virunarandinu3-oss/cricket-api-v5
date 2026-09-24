const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Connection: "keep-alive",
};

// ============================================================================
// 1. IN-MEMORY SMART TIERED CACHE (DRASTICALLY LOWERS VERCEL FLUID CPU USAGE)
// ============================================================================
// Result cache: stores entire scraped JSON payload with TTL
const RESULT_CACHE = new Map();

// Static metadata cache: stores squads, match facts, and points table for 15 minutes
const STATIC_CACHE = new Map();
const STATIC_TTL = 15 * 60 * 1000; // 15 minutes

// Clean up stale cache periodically
function pruneCaches() {
  const now = Date.now();
  for (const [id, entry] of RESULT_CACHE.entries()) {
    if (now - entry.timestamp > entry.ttl) RESULT_CACHE.delete(id);
  }
  for (const [id, entry] of STATIC_CACHE.entries()) {
    if (now - entry.timestamp > STATIC_TTL) STATIC_CACHE.delete(id);
  }
}

// ============================================================================
// 2. UNIVERSAL TEAM FLAG MAPPER (COVERS ALL 250+ COUNTRIES & ASSOCIATES)
// ============================================================================
const COUNTRY_FLAG_MAP = {
  "india": "in",
  "ind": "in",
  "indw": "in",
  "sri lanka": "lk",
  "sl": "lk",
  "slw": "lk",
  "australia": "au",
  "aus": "au",
  "ausw": "au",
  "england": "gb-eng",
  "eng": "gb-eng",
  "engw": "gb-eng",
  "south africa": "za",
  "sa": "za",
  "saw": "za",
  "new zealand": "nz",
  "nz": "nz",
  "nzw": "nz",
  "pakistan": "pk",
  "pak": "pk",
  "pakw": "pk",
  "bangladesh": "bd",
  "ban": "bd",
  "banw": "bd",
  "afghanistan": "af",
  "afg": "af",
  "afgw": "af",
  "west indies": "wi",
  "wi": "wi",
  "wiw": "wi",
  "zimbabwe": "zw",
  "zim": "zw",
  "ireland": "ie",
  "ire": "ie",
  "irew": "ie",
  "netherlands": "nl",
  "ned": "nl",
  "scotland": "gb-sct",
  "sco": "gb-sct",
  "nepal": "np",
  "nep": "np",
  "united states": "us",
  "usa": "us",
  "canada": "ca",
  "can": "ca",
  "oman": "om",
  "united arab emirates": "ae",
  "uae": "ae",
  "namibia": "na",
  "nam": "na",
  "japan": "jp",
  "jpn": "jp",
  "jpnw": "jp",
  "hong kong": "hk",
  "papua new guinea": "pg",
  "png": "pg",
  "kenya": "ke",
  "uganda": "ug",
  "italy": "it",
  "germany": "de",
  "singapore": "sg",
  "malaysia": "my",
  "thailand": "th",
  "thaw": "th",
  "indonesia": "id",
  "kuwait": "kw",
  "bahrain": "bh",
  "qatar": "qa",
  "saudi arabia": "sa",
  "bermuda": "bm",
  "jersey": "je",
  "guernsey": "gg",
  "rwanda": "rw",
  "nigeria": "ng",
  "tanzania": "tz",
  "fiji": "fj",
  "vanuatu": "vu",
  "spain": "es",
  "france": "fr",
  "denmark": "dk",
  "norway": "no",
  "sweden": "se",
  "finland": "fi",
  "bermuda": "bm",
  "cayman islands": "ky",
  "bahamas": "bs",
  "belize": "bz",
  "argentina": "ar",
  "brazil": "br",
  "chile": "cl",
  "mexico": "mx",
  "peru": "pe",
  "costa rica": "cr",
  "panama": "pa",
  "austria": "at",
  "belgium": "be",
  "cyprus": "cy",
  "czech republic": "cz",
  "estonia": "ee",
  "greece": "gr",
  "hungary": "hu",
  "isle of man": "im",
  "israel": "il",
  "luxembourg": "lu",
  "malta": "mt",
  "portugal": "pt",
  "romania": "ro",
  "serbia": "rs",
  "slovenia": "si",
  "switzerland": "ch",
  "turkey": "tr",
  "bulgaria": "bg",
  "croatia": "hr",
  "gibraltar": "gi",
  "bhutan": "bt",
  "maldives": "mv",
  "myanmar": "mm",
  "philippines": "ph",
  "south korea": "kr",
  "botswana": "bw",
  "cameroon": "cm",
  "ghana": "gh",
  "lesotho": "ls",
  "malawi": "mw",
  "mali": "ml",
  "mozambique": "mz",
  "seychelles": "sc",
  "sierra leone": "sl",
  "eswatini": "sz",
  "swaziland": "sz",
  "cook islands": "ck",
  "samoa": "ws"
};

// Top Cricket Franchise League Logos (Transparent High-Res CDN Badges)
const FRANCHISE_FLAG_MAP = {
  // IPL
  "csk": "https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Chennai_Super_Kings_Logo.svg/300px-Chennai_Super_Kings_Logo.svg.png",
  "chennai super kings": "https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Chennai_Super_Kings_Logo.svg/300px-Chennai_Super_Kings_Logo.svg.png",
  "mi": "https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Mumbai_Indians_Logo.svg/300px-Mumbai_Indians_Logo.svg.png",
  "mumbai indians": "https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Mumbai_Indians_Logo.svg/300px-Mumbai_Indians_Logo.svg.png",
  "rcb": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Royal_Challengers_Bengaluru_Logo.svg/300px-Royal_Challengers_Bengaluru_Logo.svg.png",
  "royal challengers bangalore": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Royal_Challengers_Bengaluru_Logo.svg/300px-Royal_Challengers_Bengaluru_Logo.svg.png",
  "royal challengers bengaluru": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Royal_Challengers_Bengaluru_Logo.svg/300px-Royal_Challengers_Bengaluru_Logo.svg.png",
  "kkr": "https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Kolkata_Knight_Riders_Logo.svg/300px-Kolkata_Knight_Riders_Logo.svg.png",
  "kolkata knight riders": "https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Kolkata_Knight_Riders_Logo.svg/300px-Kolkata_Knight_Riders_Logo.svg.png",
  "dc": "https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/Delhi_Capitals.svg/300px-Delhi_Capitals.svg.png",
  "delhi capitals": "https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/Delhi_Capitals.svg/300px-Delhi_Capitals.svg.png",
  "rr": "https://upload.wikimedia.org/wikipedia/en/thumb/5/5c/Rajasthan_Royals_Logo.svg/300px-Rajasthan_Royals_Logo.svg.png",
  "rajasthan royals": "https://upload.wikimedia.org/wikipedia/en/thumb/5/5c/Rajasthan_Royals_Logo.svg/300px-Rajasthan_Royals_Logo.svg.png",
  "srh": "https://upload.wikimedia.org/wikipedia/en/thumb/8/81/Sunrisers_Hyderabad.svg/300px-Sunrisers_Hyderabad.svg.png",
  "sunrisers hyderabad": "https://upload.wikimedia.org/wikipedia/en/thumb/8/81/Sunrisers_Hyderabad.svg/300px-Sunrisers_Hyderabad.svg.png",
  "gt": "https://upload.wikimedia.org/wikipedia/en/thumb/0/09/Gujarat_Titans_Logo.svg/300px-Gujarat_Titans_Logo.svg.png",
  "gujarat titans": "https://upload.wikimedia.org/wikipedia/en/thumb/0/09/Gujarat_Titans_Logo.svg/300px-Gujarat_Titans_Logo.svg.png",
  "lsg": "https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/Lucknow_Super_Giants_IPL_Logo.svg/300px-Lucknow_Super_Giants_IPL_Logo.svg.png",
  "lucknow super giants": "https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/Lucknow_Super_Giants_IPL_Logo.svg/300px-Lucknow_Super_Giants_IPL_Logo.svg.png",
  "pbks": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Punjab_Kings_Logo.svg/300px-Punjab_Kings_Logo.svg.png",
  "punjab kings": "https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Punjab_Kings_Logo.svg/300px-Punjab_Kings_Logo.svg.png"
};

function getTeamFlagUrl(teamName) {
  if (!teamName) return "";
  const cleaned = String(teamName).toLowerCase()
    .replace(/\s*women\b/g, '')
    .replace(/\s*men\b/g, '')
    .replace(/\s*w\b/g, '')
    .replace(/\s*u19\b/g, '')
    .trim();
  
  // 1. Exact country match
  if (COUNTRY_FLAG_MAP[cleaned]) {
    const code = COUNTRY_FLAG_MAP[cleaned];
    if (code === 'wi') {
      return "https://upload.wikimedia.org/wikipedia/en/thumb/9/9b/West_Indies_Cricket_Board_Flag.svg/320px-West_Indies_Cricket_Board_Flag.svg.png";
    }
    return `https://flagcdn.com/w160/${code}.png`;
  }

  // 2. Exact franchise match
  if (FRANCHISE_FLAG_MAP[cleaned]) return FRANCHISE_FLAG_MAP[cleaned];

  // 3. Country substring match (e.g. "sri lanka cricket" -> "sri lanka")
  for (const [key, code] of Object.entries(COUNTRY_FLAG_MAP)) {
    if (key.length > 2 && cleaned.includes(key)) {
      if (code === 'wi') {
        return "https://upload.wikimedia.org/wikipedia/en/thumb/9/9b/West_Indies_Cricket_Board_Flag.svg/320px-West_Indies_Cricket_Board_Flag.svg.png";
      }
      return `https://flagcdn.com/w160/${code}.png`;
    }
  }

  // 4. Franchise substring match
  for (const [key, url] of Object.entries(FRANCHISE_FLAG_MAP)) {
    if (key.length > 2 && cleaned.includes(key)) return url;
  }

  return "";
}

// ============================================================================
// 3. MATCH FORMAT DETECTOR (TEST, ODI, T20, T10, THE HUNDRED)
// ============================================================================
function detectMatchFormat(info, scorecard) {
  const matchStr = `${info.match || ''} ${info.series || ''} ${info.match_title || ''}`.toLowerCase();
  
  // 1. Test / First-Class Match
  if (/\btest\b|\bfirst[\s-]class\b|\bday\s+[1-5]\b/i.test(matchStr)) {
    return {
      format: 'TEST',
      label: 'Test Match',
      is_test: true,
      is_limited_overs: false,
      max_overs: null,
      max_balls: null,
      default_balls: null
    };
  }

  // 2. ODI / 50-Over Match
  if (/\bodi\b|\bone[\s-]day\b|\b50[\s-]over\b/i.test(matchStr)) {
    return {
      format: 'ODI',
      label: 'One Day International',
      is_test: false,
      is_limited_overs: true,
      max_overs: 50,
      max_balls: 300,
      default_balls: 300
    };
  }

  // 3. T10 Match
  if (/\bt10\b|\b10[\s-]over\b/i.test(matchStr)) {
    return {
      format: 'T10',
      label: 'T10',
      is_test: false,
      is_limited_overs: true,
      max_overs: 10,
      max_balls: 60,
      default_balls: 60
    };
  }

  // 4. The Hundred / 100-Ball Match
  if (/\bhundred\b|\b100[\s-]ball\b/i.test(matchStr)) {
    return {
      format: 'HUNDRED',
      label: 'The Hundred',
      is_test: false,
      is_limited_overs: true,
      max_overs: 20,
      max_balls: 100,
      default_balls: 100
    };
  }

  // Check overs in scorecard for matches without explicit format tag
  for (const inn of (scorecard?.innings || [])) {
    const ov = parseFloat(inn.overs) || 0;
    if (ov > 20) {
      return {
        format: 'ODI',
        label: 'One Day International',
        is_test: false,
        is_limited_overs: true,
        max_overs: 50,
        max_balls: 300,
        default_balls: 300
      };
    }
  }

  // Default: T20 / T20I / Franchise Leagues
  return {
    format: 'T20',
    label: 'T20',
    is_test: false,
    is_limited_overs: true,
    max_overs: 20,
    max_balls: 120,
    default_balls: 120
  };
}

// ============================================================================
// 4. URL & MATCH INFO EXTRACTION
// ============================================================================
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

// ============================================================================
// 5. CACHE-BUSTING RESILIENT FETCH (FAST 8s TIMEOUT)
// ============================================================================
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
      signal: AbortSignal.timeout(8000),
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

// ============================================================================
// 6. IN-MEMORY MONOTONIC PROGRESSION ENGINE
// ============================================================================
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
        if (inn.batting && inn.batting.length) prev.batting = inn.batting;
        if (inn.bowling && inn.bowling.length) prev.bowling = inn.bowling;
        if (inn.fall_of_wickets && inn.fall_of_wickets.length) prev.fall_of_wickets = inn.fall_of_wickets;
      }
    }
  });
}

// ============================================================================
// 7. PARSE MATCH FACTS & INFO
// ============================================================================
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

// ============================================================================
// 8. PARSE LIVE & COMMENTARY
// ============================================================================
function parseLiveAndCommentary(liveHtml, fullCommHtml) {
  const result = {
    live: {},
    commentary: [],
  };

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

// ============================================================================
// 9. SCORECARD PARSERS
// ============================================================================
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
      if (!name || name === "Bowler" || name === "Batter") return;

      const vals = [];
      for (let i = 1; i < divs.length; i++) vals.push(divs.eq(i).text().trim());

      const entry = { name };
      if (vals[0]) entry.overs = vals[0];
      if (vals[1]) entry.maidens = vals[1];
      if (vals[2]) entry.runs = vals[2];
      if (vals[3]) entry.wickets = vals[3];
      if (vals[4]) entry.no_balls = vals[4];
      if (vals[5]) entry.wides = vals[5];
      if (vals[6]) entry.economy = vals[6];
      bowlingData.push(entry);
    }
  });
  return bowlingData;
}

function parseScorecard(html) {
  if (!html) return { match: "", innings: [] };
  const $ = cheerio.load(html);
  const match = $("h1 span").first().text().trim() || $("h1").text().trim();
  const innings = [];

  // 1. Cricbuzz Modern Next.js DOM: [id*="-innings-"]
  const modernHeaders = $("div[id*='-innings-']").filter((_, el) => {
    const id = $(el).attr("id") || "";
    return !id.startsWith("scard-");
  });

  if (modernHeaders.length > 0) {
    modernHeaders.each((_, hEl) => {
      const h = $(hEl);
      const id = h.attr("id");
      const scardId = "scard-" + id;
      const panel = $(`#${scardId}`).length ? $(`#${scardId}`) : h.next();

      const shortName = h.find(".tb\\:hidden, div:first-child").first().text().trim();
      let teamName = h.find(".hidden.tb\\:block, [class*='tb:block']").first().text().trim();
      if (!teamName) {
        teamName = h.children().eq(1).text().trim() || shortName;
      }

      const scoreDiv = h.find(".flex.gap-4, div:last-child").last().text().trim();
      const scoreMatch = scoreDiv.match(/(\d+(?:-\d+)?)\s*(?:\(([\d\.]+)\s*(?:Overs?|Ov)?\))?/i);

      let score = "";
      let overs = "";
      if (scoreMatch) {
        score = scoreMatch[1];
        overs = scoreMatch[2] ? `${scoreMatch[2]} Ov` : "";
      } else {
        const fullHText = h.text();
        const fm = fullHText.match(/(\d+(?:-\d+)?)\s*(?:\(([\d\.]+)\s*(?:Overs?|Ov)?\))?/i);
        if (fm) {
          score = fm[1];
          overs = fm[2] ? `${fm[2]} Ov` : "";
        }
      }

      const batting = parseBattingFromContainer($, panel);
      const bowling = parseBowlingFromContainer($, panel);
      const total = `${teamName} ${score} (${overs})`.trim();

      if (teamName && (batting.length > 0 || score)) {
        innings.push({
          team_name: teamName,
          team_short: shortName,
          score: score || "0-0",
          overs: overs || "0.0 Ov",
          total,
          batting,
          bowling,
        });
      }
    });
  }

  // 2. Cricbuzz Legacy DOM: div[id*='innings_']
  if (innings.length === 0) {
    const mainPanels = $("div[id*='innings_']");
    if (mainPanels.length > 0) {
      mainPanels.each((_, panel) => {
        const p = $(panel);
        const headerText = p.prev("div").text().trim() || p.find("span.font-bold").first().text().trim();
        const teamMatch = headerText.match(/^([A-Za-z0-9\s]+?)\s+(?:Innings|1st Innings|2nd Innings)/i);
        const teamName = teamMatch ? teamMatch[1].trim() : headerText.split(" Innings")[0].trim();
        const scoreMatch = headerText.match(/(\d+(?:-\d+)?)\s*(?:\(([\d\.]+)\s*(?:Overs?|Ov)?\))?/i);

        let score = "";
        let overs = "";
        if (scoreMatch) {
          score = scoreMatch[1];
          overs = scoreMatch[2] ? `${scoreMatch[2]} Ov` : "";
        }

        const batting = parseBattingFromContainer($, p);
        const bowling = parseBowlingFromContainer($, p);

        if (teamName && (batting.length > 0 || score)) {
          innings.push({
            team_name: teamName,
            team_short: "",
            score: score || "0-0",
            overs: overs || "0.0 Ov",
            total: headerText,
            batting,
            bowling,
          });
        }
      });
    }
  }

  // 3. Fallback for non-standard markup
  if (innings.length === 0) {
    $(".cb-col.cb-col-100.cb-ltst-wgt-hdr").each((_, sec) => {
      const header = $(sec).find(".cb-scrd-hdr-rw").first().text().trim();
      if (header.includes("Innings")) {
        const teamMatch = header.match(/^([A-Za-z0-9\s]+?)\s+Innings/i);
        const teamName = teamMatch ? teamMatch[1].trim() : "Team";
        const scoreM = header.match(/(\d+-\d+)\s*\(([\d\.]+)\s*Overs?\)/i);
        innings.push({
          team_name: teamName,
          team_short: "",
          score: scoreM ? scoreM[1] : "",
          overs: scoreM ? `${scoreM[2]} Ov` : "",
          total: header,
          batting: [],
          bowling: [],
        });
      }
    });
  }

  return { match, innings };
}

function parseSquads(squadsHtml, infoHtml) {
  const result = {};
  const html = squadsHtml || infoHtml;
  if (!html) return result;
  const $ = cheerio.load(html);

  $("h3").each((_, h3) => {
    const teamTitle = $(h3).text().trim();
    if (!teamTitle || teamTitle.length < 3) return;

    const xi = [];
    const container = $(h3).next("div");
    container.find("a[href*='/profiles/']").each((_, a) => {
      const name = $(a).text().trim();
      const role = $(a).next("span").text().trim() || "Player";
      if (name && !xi.some((p) => p.name === name)) {
        xi.push({ name, role });
      }
    });

    if (xi.length > 0) {
      result[teamTitle] = {
        playing_xi: xi,
      };
    }
  });

  return result;
}

function parsePointsTable(html) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const rows = [];
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 7) {
      rows.push({
        position: tds.eq(0).text().trim(),
        team: tds.eq(1).text().trim(),
        played: tds.eq(2).text().trim(),
        won: tds.eq(3).text().trim(),
        lost: tds.eq(4).text().trim(),
        tied: tds.eq(5).text().trim(),
        nrr: tds.eq(6).text().trim(),
        points: tds.eq(7) ? tds.eq(7).text().trim() : "",
      });
    }
  });
  return rows;
}

function getPointsTableUrl(html) {
  if (!html) return null;
  const $ = cheerio.load(html);
  const ptLink = $("a[href*='points-table']").first().attr("href");
  if (!ptLink) return null;
  return ptLink.startsWith("http") ? ptLink : `https://www.cricbuzz.com${ptLink}`;
}

// ============================================================================
// 10. MULTI-INNINGS & FORMAT-AWARE STATE BUILDER (TEST, ODI, T20)
// ============================================================================
function buildStateAndSummary(info, live, scorecard, commentary) {
  const innings = scorecard?.innings || [];
  const liveStatus = (live?.status || "").trim();
  const formatInfo = detectMatchFormat(info, scorecard);

  // Status Detection
  const isCompletedText = (status) =>
    /\b(won by|opt to bowl|opt to bat|abandoned|no result|draw|drawn|tied|match tied|innings and)\b/i.test(status);

  const isLiveText = (status) =>
    /\b(need \d+ runs|trail by|lead by|day \d+|stumps|tea|lunch|drinks|innings break|play in progress)\b/i.test(status);

  let isUpcoming = false;
  let isLive = false;
  let isCompleted = false;
  let resultText = "";
  let statusText = liveStatus;

  if (isCompletedText(liveStatus)) {
    isCompleted = true;
    resultText = liveStatus;
  } else if (isLiveText(liveStatus) || innings.some((inn) => inn.batting && inn.batting.length > 0)) {
    isLive = true;
  } else if (info.matchStartTimestamp && info.matchStartTimestamp > Date.now()) {
    isUpcoming = true;
  } else if (innings.length === 0) {
    isUpcoming = true;
  } else {
    isLive = true;
  }

  // Build matchState
  const now = Date.now();
  const matchStartTimestamp = info.matchStartTimestamp || null;
  let diffMs = matchStartTimestamp ? matchStartTimestamp - now : 0;
  let countdown = null;

  if (isUpcoming && matchStartTimestamp && diffMs > 0) {
    const totalSecs = Math.max(0, Math.floor(diffMs / 1000));
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    const pad = (n) => String(n).padStart(2, "0");

    countdown = {
      hours: pad(hours),
      minutes: pad(minutes),
      seconds: pad(seconds),
      total_seconds: totalSecs,
      formatted: `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
      text: `${hours}h ${minutes}m ${seconds}s`,
    };
    statusText = `Match starts in ${countdown.text}`;
  }

  const statusLabel = isUpcoming
    ? "Upcoming"
    : isCompleted
    ? "Match Ended"
    : "ON Progress";

  const statusKey = isUpcoming
    ? "UPCOMING"
    : isCompleted
    ? "COMPLETED"
    : "IN_PROGRESS";

  const matchState = {
    status: statusKey,
    state_label: statusLabel,
    status_text: statusText,
    is_upcoming: isUpcoming,
    is_live: isLive,
    is_completed: isCompleted,
    match_format: formatInfo.format,
    format_label: formatInfo.label,
    start_time: info.start_time || null,
    matchStartTimestamp,
    current_timestamp: now,
    diff_ms: diffMs,
    countdown,
  };

  if (isCompleted && resultText) {
    matchState.result = resultText;
    const winMatch = resultText.match(/^([A-Za-z\s]+?)\s+(?:won|win)/i);
    if (winMatch) matchState.winner = winMatch[1].trim();
  }

  // ============================================================================
  // TEAM SCORES & UNIVERSAL FLAGS (TEST, ODI, T20)
  // ============================================================================
  const teamNames = info.teams || [];
  const stripInningsSuffix = (name) => String(name || '').replace(/\s*(?:1st|2nd|3rd|4th)?\s*Innings\b/gi, '').trim();
  const cleanTeam = (s) => String(s || '').toLowerCase()
    .replace(/\s*(1st|2nd|3rd|4th)?\s*innings\b/gi, '')
    .replace(/\s*(women|men|u19|team)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  let team1DefaultName = "";
  let team2DefaultName = "";

  if (innings.length > 0) {
    team1DefaultName = stripInningsSuffix(innings[0].team_name);
    const remaining = teamNames.find(t => cleanTeam(t) !== cleanTeam(team1DefaultName));
    team2DefaultName = stripInningsSuffix(remaining || innings[1]?.team_name || teamNames[1] || "Team 2");
  } else if (teamNames.length >= 2) {
    team1DefaultName = stripInningsSuffix(teamNames[0]);
    team2DefaultName = stripInningsSuffix(teamNames[1]);
  } else {
    team1DefaultName = "Team 1";
    team2DefaultName = "Team 2";
  }

  const getTeamInnings = (tName) => {
    const k = cleanTeam(tName);
    return innings.filter(inn => {
      const ik = cleanTeam(inn.team_name);
      return ik && (ik.includes(k) || k.includes(ik));
    });
  };

  const t1Innings = getTeamInnings(team1DefaultName);
  const t2Innings = getTeamInnings(team2DefaultName);

  // Distribute innings for Test matches (up to 4 innings) vs Limited Overs
  let team1Score = isUpcoming ? "Yet to bat" : "0-0";
  let team1Overs = "0.0 Ov";
  let team2Score = isUpcoming ? "Yet to bat" : "0-0";
  let team2Overs = "0.0 Ov";

  if (formatInfo.is_test) {
    if (t1Innings.length > 0) {
      team1Score = t1Innings.map(i => i.score).join(" & ");
      team1Overs = t1Innings[t1Innings.length - 1].overs || "";
    }
    if (t2Innings.length > 0) {
      team2Score = t2Innings.map(i => i.score).join(" & ");
      team2Overs = t2Innings[t2Innings.length - 1].overs || "";
    }
  } else {
    // Limited Overs (T20, ODI, T10, The Hundred)
    if (t1Innings.length > 0) {
      team1Score = t1Innings[0].score || "0-0";
      team1Overs = t1Innings[0].overs || "0.0 Ov";
    } else if (innings.length >= 1) {
      team1Score = innings[0].score || "0-0";
      team1Overs = innings[0].overs || "0.0 Ov";
    }

    if (t2Innings.length > 0) {
      team2Score = t2Innings[0].score || "0-0";
      team2Overs = t2Innings[0].overs || "0.0 Ov";
    } else if (innings.length >= 2) {
      team2Score = innings[1].score || "0-0";
      team2Overs = innings[1].overs || "0.0 Ov";
    }
  }

  // Pre-Toss State: If upcoming and no toss announced, neither is batting nor bowling!
  const tossStr = (info.toss || "").toLowerCase();
  const hasToss = Boolean(tossStr && tossStr.length > 5);
  let team1IsBatting = false;
  let team2IsBatting = false;
  let currentBattingTeam = "";
  let currentBowlingTeam = "";

  if (isLive) {
    const activeInnIdx = innings.length - 1;
    const activeInn = innings[activeInnIdx] || {};
    const activeName = cleanTeam(activeInn.team_name);

    if (activeName.includes(cleanTeam(team1DefaultName)) || cleanTeam(team1DefaultName).includes(activeName)) {
      team1IsBatting = true;
      currentBattingTeam = team1DefaultName;
      currentBowlingTeam = team2DefaultName;
    } else {
      team2IsBatting = true;
      currentBattingTeam = team2DefaultName;
      currentBowlingTeam = team1DefaultName;
    }
  }

  // Calculate Badges
  let team1Badge = "YET TO BAT";
  let team2Badge = "YET TO BAT";

  if (isCompleted) {
    team1Badge = "1ST INN";
    team2Badge = "2ND INN";
  } else if (isLive) {
    if (team1IsBatting) {
      team1Badge = "★ BATTING";
      team2Badge = "BOWLING";
    } else {
      team1Badge = "BOWLING";
      team2Badge = (innings.length >= 2 && !formatInfo.is_test) ? "★ CHASING" : "★ BATTING";
    }
  } else if (isUpcoming) {
    if (hasToss) {
      const optBat = tossStr.includes("bat");
      const optBowl = tossStr.includes("bowl");
      const t1Won = tossStr.includes(cleanTeam(team1DefaultName));
      if (t1Won) {
        team1Badge = optBat ? "BAT FIRST" : "BOWL FIRST";
        team2Badge = optBat ? "BOWL FIRST" : "BAT FIRST";
      } else {
        team2Badge = optBat ? "BAT FIRST" : "BOWL FIRST";
        team1Badge = optBat ? "BOWL FIRST" : "BAT FIRST";
      }
    } else {
      team1Badge = "YET TO BAT";
      team2Badge = "YET TO BAT";
    }
  }

  let team1Obj = {
    name: team1DefaultName,
    short: t1Innings[0]?.team_short || innings[0]?.team_short || "",
    flag_url: getTeamFlagUrl(team1DefaultName),
    score: team1Score,
    runs: parseRunsAndWkts(team1Score).runs,
    wickets: parseRunsAndWkts(team1Score).wkts,
    overs: team1Overs,
    total: t1Innings[0]?.total || innings[0]?.total || "",
    is_batting: isLive && team1IsBatting,
    is_bowling: isLive && team2IsBatting,
    is_completed: isCompleted || (innings.length > 1 && !formatInfo.is_test),
    badge: team1Badge,
  };

  let team2Obj = {
    name: team2DefaultName,
    short: t2Innings[0]?.team_short || innings[1]?.team_short || "",
    flag_url: getTeamFlagUrl(team2DefaultName),
    score: team2Score,
    runs: parseRunsAndWkts(team2Score).runs,
    wickets: parseRunsAndWkts(team2Score).wkts,
    overs: team2Overs,
    total: t2Innings[0]?.total || innings[1]?.total || "",
    is_batting: isLive && team2IsBatting,
    is_bowling: isLive && team1IsBatting,
    is_completed: isCompleted,
    badge: team2Badge,
  };

  // Equation and Target calculation
  let target = null;
  let runsNeeded = null;
  let ballsRemaining = null;
  let reqRunRate = null;
  let currRunRate = null;
  let equation = "";

  if (formatInfo.is_test) {
    const t1Runs = team1Obj.runs;
    const t2Runs = team2Obj.runs;
    if (innings.length === 4 && isLive) {
      target = (t1Runs + 1);
      runsNeeded = Math.max(0, target - t2Runs);
      equation = `${team2Obj.name} need ${runsNeeded} runs to win`;
    } else if (isLive && t1Runs > 0 && t2Runs > 0) {
      const diff = t1Runs - t2Runs;
      equation = diff >= 0 ? `${team1Obj.name} lead by ${diff} runs` : `${team2Obj.name} lead by ${Math.abs(diff)} runs`;
    }
  } else {
    // Limited Overs (ODI / T20 / T10 / Hundred)
    if (innings.length >= 2) {
      const t1Runs = parseRunsAndWkts(innings[0].score).runs;
      target = t1Runs > 0 ? t1Runs + 1 : null;
      if (target && isLive) {
        runsNeeded = Math.max(0, target - team2Obj.runs);
        const ballsBowled = oversStringToBalls(team2Obj.overs);
        const maxBalls = formatInfo.max_balls || 120;
        ballsRemaining = Math.max(0, maxBalls - ballsBowled);
        if (ballsRemaining > 0) {
          reqRunRate = ((runsNeeded / ballsRemaining) * 6).toFixed(2);
        }
        equation = `${team2Obj.name} need ${runsNeeded} runs in ${ballsRemaining} balls`;
      }
    }
  }

  // Active Innings Run Rate
  const curInn = innings[innings.length - 1];
  if (curInn && curInn.total) {
    const crrM = curInn.total.match(/RR:\s*([\d\.]+)/i);
    if (crrM) currRunRate = crrM[1];
  }

  const matchSummary = {
    status: statusKey,
    status_text: statusText,
    match_format: formatInfo.format,
    format_label: formatInfo.label,
    is_test: formatInfo.is_test,
    max_overs: formatInfo.max_overs,
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

  live.status = equation || resultText || live.status || statusText;
  live.team1_score = `${team1Obj.name} ${team1Obj.score} (${team1Obj.overs})`;
  live.team2_score = `${team2Obj.name} ${team2Obj.score} (${team2Obj.overs})`;
  live.current_score = innings.length >= 2 ? live.team2_score : live.team1_score;
  live.batting_team = currentBattingTeam;
  live.bowling_team = currentBowlingTeam;
  if (target) live.target = target;
  if (equation) live.equation = equation;

  return { matchState, matchSummary };
}

// ============================================================================
// 11. MAIN EXPORTED SCRAPER FUNCTION (WITH IN-MEMORY CACHE & SELECTIVE FETCH)
// ============================================================================
async function scrapeMatch(inputUrl) {
  pruneCaches();

  const infoData = extractMatchInfo(inputUrl);
  if (!infoData) {
    return { error: "Please provide a valid Cricbuzz match URL or Match ID" };
  }

  const { matchId, slug } = infoData;

  // 1. FAST IN-MEMORY CACHE CHECK
  const now = Date.now();
  const cachedResult = RESULT_CACHE.get(matchId);
  if (cachedResult && (now - cachedResult.timestamp < cachedResult.ttl)) {
    return cachedResult.data;
  }

  const urls = buildUrls(matchId, slug);

  // 2. CHECK STATIC METADATA CACHE (SQUADS, INFO, POINTS TABLE)
  let staticData = STATIC_CACHE.get(matchId);
  let info, squads, ptHtml;

  if (staticData && (now - staticData.timestamp < STATIC_TTL)) {
    info = staticData.info;
    squads = staticData.squads;
    ptHtml = staticData.ptHtml;

    // Fast selective fetch: only fetch live and scorecard (and commentary)
    const [liveHtml, scorecardHtml, fullCommHtml] = await Promise.all([
      fetchPage(urls.live),
      fetchPage(urls.scorecard),
      fetchPage(urls.fullCommentary),
    ]);

    const { live, commentary } = parseLiveAndCommentary(liveHtml, fullCommHtml);
    const scorecard = parseScorecard(scorecardHtml);
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
      squads,
      full_commentary: commentary,
    };
    if (ptHtml) data.points_table = parsePointsTable(ptHtml);

    // Cache result with dynamic TTL
    let ttl = 2500; // Live match: 2.5s
    if (matchState.status === "COMPLETED") ttl = 3600 * 1000;
    else if (matchState.status === "UPCOMING") {
      ttl = (matchState.diff_ms && matchState.diff_ms <= 15 * 60 * 1000) ? 15000 : 180000;
    }
    RESULT_CACHE.set(matchId, { data, timestamp: now, ttl });

    return data;
  }

  // 3. FULL FETCH (First time or static cache expired)
  const [infoHtml, liveHtml, scorecardHtml, squadsHtml, fullCommHtml] = await Promise.all([
    fetchPage(urls.info),
    fetchPage(urls.live),
    fetchPage(urls.scorecard),
    fetchPage(urls.squads),
    fetchPage(urls.fullCommentary),
  ]);

  const ptUrl = getPointsTableUrl(infoHtml || liveHtml);
  if (ptUrl) ptHtml = await fetchPage(ptUrl);

  info = parseInfo(infoHtml);
  squads = parseSquads(squadsHtml, infoHtml);
  STATIC_CACHE.set(matchId, { info, squads, ptHtml, timestamp: now });

  const { live, commentary } = parseLiveAndCommentary(liveHtml, fullCommHtml);
  const scorecard = parseScorecard(scorecardHtml);
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
    squads,
    full_commentary: commentary,
  };

  if (ptHtml) {
    data.points_table = parsePointsTable(ptHtml);
  }

  // Store in result cache
  let ttl = 2500;
  if (matchState.status === "COMPLETED") ttl = 3600 * 1000;
  else if (matchState.status === "UPCOMING") {
    ttl = (matchState.diff_ms && matchState.diff_ms <= 15 * 60 * 1000) ? 15000 : 180000;
  }
  RESULT_CACHE.set(matchId, { data, timestamp: now, ttl });

  return data;
}

module.exports = { scrapeMatch, extractMatchInfo, getTeamFlagUrl, detectMatchFormat };
