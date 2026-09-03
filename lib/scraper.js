const cheerio = require("cheerio");

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

// ===== URL HELPERS =====
function extractMatchInfo(inputUrl) {
  const patterns = [
    /cricbuzz\.com\/[^/]+\/(\d+)\/(.+)/,
    /cricbuzz\.com\/cricket-series\/(\d+)\/(.+)/,
  ];
  for (const p of patterns) {
    const m = inputUrl.match(p);
    if (m) return { matchId: m[1], slug: m[2] };
  }
  const idMatch = inputUrl.match(/\/(\d{5,})\//);
  if (idMatch) return { matchId: idMatch[1], slug: "" };
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
  } catch {
    return null;
  }
}

// ===== PARSERS =====

function parseInfo(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  // Match title from h1
  const h1 = $("h1 span.wb\\:block, h1 span").first().text().trim();
  if (h1) result["තරග_මාතෘකාව"] = h1;

  // Series info from schema
  const schemas = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { schemas.push(JSON.parse($(el).html())); } catch {}
  });
  const sportsEvent = schemas.find((s) => s["@type"] === "SportsEvent");
  if (sportsEvent) {
    result["ආරම්භක_වේලාව"] = sportsEvent.startDate || "";
    result["අවසාන_වේලාව"] = sportsEvent.endDate || "";
    if (sportsEvent.location) {
      result["ක්‍රීඩාංගනය"] = sportsEvent.location.name || "";
      if (sportsEvent.location.address) {
        result["නගරය"] = (sportsEvent.location.address.addressLocality || "").trim();
        result["රටේ_නම"] = sportsEvent.location.address.addressCountry || "";
      }
    }
    if (sportsEvent.competitor) {
      result["කණ්ඩායම්"] = sportsEvent.competitor.map((c) => c.name);
    }
    if (sportsEvent.superEvent) {
      result["තරග_මාලාව"] = sportsEvent.superEvent.name || "";
    }
  }

  // Facts grid rows
  $(".facts-row-grid").each((_, el) => {
    const label = $(el).find(".font-bold").first().text().trim();
    const value = $(el).children().last().text().trim();
    if (!label || !value || label === value) return;

    const keyMap = {
      Match: "තරගය",
      Series: "තරග_මාලාව",
      Date: "දිනය",
      Time: "වේලාව",
      Venue: "ක්‍රීඩාංගනය",
      Umpires: "විනිසුරුවරු",
      "3rd Umpire": "තුන්වන_විනිසුරු",
      Referee: "තරග_තීරකයා",
      Toss: "කාසි_වාරය",
    };
    const key = keyMap[label] || label;
    result[key] = value;
  });

  // Squad info
  const squads = {};
  $(".facts-row-grid").each((_, el) => {
    const labelEl = $(el).find(".font-bold").first();
    const labelText = labelEl.text().trim();
    if (labelText.includes("squad")) {
      const teamName = labelText.replace(" squad", "").replace("squad", "").trim();
      const players = [];
      const supportStaff = [];
      let currentSection = "players";

      $(el).find(".flex-col").each((__, col) => {
        const sectionTitle = $(col).find(".font-bold").text().trim();
        if (sectionTitle === "Support Staff") currentSection = "support";

        $(col).find("a[href*='/profiles/']").each((___, link) => {
          const name = $(link).text().replace(/,\s*$/, "").trim();
          const href = $(link).attr("href") || "";
          const profileUrl = href ? `https://www.cricbuzz.com${href}` : "";
          const entry = { නම: name };
          if (profileUrl) entry["ප්‍රොෆයිල_සබැඳිය"] = profileUrl;
          if (name.includes("(c)")) entry["කාර්යභාරය"] = "නායකයා";
          if (name.includes("(wk)")) entry["කාර්යභාරය"] = "කඩුලු_රකින්නා";
          if (currentSection === "support") {
            supportStaff.push(entry);
          } else {
            players.push(entry);
          }
        });
      });

      squads[teamName] = {
        ක්‍රීඩකයින්: players,
      };
      if (supportStaff.length > 0) {
        squads[teamName]["සහාය_කාර්ය_මණ්ඩලය"] = supportStaff;
      }
    }
  });
  if (Object.keys(squads).length > 0) {
    result["කණ්ඩායම්_තොරතුරු"] = squads;
  }

  return result;
}

function parseLive(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  // Match status
  const statusEl = $(".text-cbPreview, .cb-text-preview").first();
  if (statusEl.length) {
    result["තත්ත්වය"] = statusEl.text().trim();
  }

  // Start time info
  const startTimeSection = $(".font-extrabold.text-xl");
  const times = [];
  startTimeSection.each((_, el) => {
    const time = $(el).text().trim();
    const label = $(el).next("span").text().trim();
    if (time) times.push(label ? `${time} ${label}` : time);
  });
  if (times.length > 0) {
    result["ආරම්භක_වේලාවන්"] = {
      "ඉන්දීය_සම්මත_වේලාව": times[0] || "",
      "GMT_වේලාව": times[1] || "",
      "ප්‍රාදේශීය_වේලාව": times[2] || "",
    };
  }

  // Score from miniscore
  $(".cb-min-bat-rw, [class*='miniscore']").each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      if (!result["ලකුණු_සාරාංශය"]) result["ලකුණු_සාරාංශය"] = [];
      result["ලකුණු_සාරාංශය"].push(text);
    }
  });

  // Commentary entries
  const commentary = [];
  $(".flex.mx-4, .flex.wb\\:mx-4").each((_, el) => {
    const overNum = $(el).find(".font-bold.text-center").first().text().trim();
    const commText = $(el).find("div").last().text().trim();
    if (commText && commText.length > 5) {
      const entry = {};
      if (overNum) entry["ඕවර_අංකය"] = overNum;
      entry["විවරණය"] = commText;
      commentary.push(entry);
    }
  });
  if (commentary.length > 0) {
    result["විවරණ_ලැයිස්තුව"] = commentary;
  }

  // Recent balls/overs data
  $(".cb-min-rcnt, [class*='recent']").each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      if (!result["මෑත_පන්දු"]) result["මෑත_පන්දු"] = [];
      result["මෑත_පන්දු"].push(text);
    }
  });

  return result;
}

function parseScorecard(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  // Check if match started
  const notStarted = $("div").filter((_, el) =>
    $(el).text().includes("scorecard will appear once the match starts")
  );
  if (notStarted.length > 0) {
    result["තත්ත්වය"] = "තරගය තවම ආරම්භ වී නැත";
    result["ආරම්භක_වේලාව"] = $(".text-cbPreview").first().text().trim();
    return result;
  }

  // Innings scorecard
  const innings = [];
  $("[class*='scorecard']").each((_, section) => {
    const title = $(section).find("h2, .font-bold").first().text().trim();
    if (!title) return;

    const batting = [];
    const bowling = [];

    // Batting rows
    $(section).find("tr, [class*='bat-row']").each((__, row) => {
      const cols = $(row).find("td, div").map((___, c) => $(c).text().trim()).get();
      if (cols.length >= 5) {
        batting.push({
          ක්‍රීඩකයා: cols[0],
          ලකුණු: cols[1] || cols[2],
          පන්දු: cols[2] || cols[3],
        });
      }
    });

    innings.push({
      ඉනිම: title,
      පිතිකරණය: batting.length > 0 ? batting : "තොරතුරු නොමැත",
    });
  });

  if (innings.length > 0) {
    result["ඉනිම්_ලකුණු_පත්‍ර"] = innings;
  }

  // Fall of wickets
  $("[class*='fall-of-wickets'], [class*='fow']").each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      if (!result["කඩුලු_බිඳ_වැටීම"]) result["කඩුලු_බිඳ_වැටීම"] = [];
      result["කඩුලු_බිඳ_වැටීම"].push(text);
    }
  });

  return result;
}

function parseSquads(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  // Parse squad sections
  const squads = {};

  $(".facts-row-grid").each((_, el) => {
    const labelEl = $(el).find(".font-bold").first();
    const labelText = labelEl.text().trim();
    if (labelText.includes("squad") || labelText.includes("Squad")) {
      const teamName = labelText.replace(/\s*squad\s*/gi, "").trim();
      const players = [];
      const supportStaff = [];

      $(el).find("a[href*='/profiles/']").each((__, link) => {
        const name = $(link).text().replace(/,\s*$/, "").trim();
        const href = $(link).attr("href") || "";
        const profileUrl = href ? `https://www.cricbuzz.com${href}` : "";
        const parentText = $(link).closest(".flex-col").find(".font-bold").first().text().trim();

        const entry = { නම: name };
        if (profileUrl) entry["ප්‍රොෆයිල_සබැඳිය"] = profileUrl;
        if (name.includes("(c)")) entry["කාර්යභාරය"] = "නායකයා";
        if (name.includes("(wk)")) entry["කාර්යභාරය"] = "කඩුලු_රකින්නා";

        if (parentText === "Support Staff") {
          supportStaff.push(entry);
        } else {
          players.push(entry);
        }
      });

      squads[teamName] = { ක්‍රීඩකයින්: players };
      if (supportStaff.length > 0) {
        squads[teamName]["සහාය_කාර්ය_මණ්ඩලය"] = supportStaff;
      }
    }
  });

  // Also try alternate squad layout
  $("[class*='squad']").each((_, section) => {
    const teamHeader = $(section).find("h2, h3, .font-bold").first().text().trim();
    if (!teamHeader || squads[teamHeader]) return;

    const players = [];
    $(section).find("a[href*='/profiles/']").each((__, link) => {
      const name = $(link).text().replace(/,\s*$/, "").trim();
      const href = $(link).attr("href") || "";
      if (name) {
        const entry = { නම: name };
        if (href) entry["ප්‍රොෆයිල_සබැඳිය"] = `https://www.cricbuzz.com${href}`;
        players.push(entry);
      }
    });

    if (players.length > 0) {
      squads[teamHeader] = { ක්‍රීඩකයින්: players };
    }
  });

  if (Object.keys(squads).length > 0) {
    result["කණ්ඩායම්_ලැයිස්තුව"] = squads;
  } else {
    result["තත්ත්වය"] = "කණ්ඩායම් තොරතුරු තවම නැත";
  }

  return result;
}

function parseOvers(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  const overs = [];
  $(".flex.mx-4, .flex.wb\\:mx-4").each((_, el) => {
    const overNum = $(el).find(".font-bold.text-center").first().text().trim();
    const details = $(el).find("div").last().text().trim();
    if (details && details.length > 2) {
      const entry = {};
      if (overNum) entry["ඕවර_අංකය"] = overNum;
      entry["විස්තරය"] = details;
      overs.push(entry);
    }
  });

  // Also try over-by-over specific elements
  $("[class*='over-by-over'], [class*='obo']").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 3) {
      overs.push({ විස්තරය: text });
    }
  });

  if (overs.length > 0) {
    result["ඕවර_අනුව_තොරතුරු"] = overs;
  } else {
    result["තත්ත්වය"] = "ඕවර තොරතුරු තවම නැත";
  }

  return result;
}

function parseFullCommentary(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  const commentary = [];
  $(".flex.mx-4, .flex.wb\\:mx-4").each((_, el) => {
    const overBall = $(el).find(".font-bold.text-center").first().text().trim();
    const commText = $(el).children("div").last().text().trim();
    if (commText && commText.length > 3) {
      const entry = {};
      if (overBall) entry["ඕවර_පන්දුව"] = overBall;

      // Check for bold text (wicket, boundary, etc.)
      const boldText = $(el).find("b").first().text().trim();
      if (boldText) entry["විශේෂ_සටහන"] = boldText;

      entry["විවරණය"] = commText;
      commentary.push(entry);
    }
  });

  if (commentary.length > 0) {
    result["සම්පූර්ණ_විවරණය"] = commentary;
  } else {
    result["තත්ත්වය"] = "විවරණ තොරතුරු තවම නැත";
  }

  return result;
}

function parseHighlights(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  const highlights = [];

  // Video highlights
  $("a[href*='/cricket-videos/']").each((_, el) => {
    const title = $(el).attr("title") || $(el).text().trim();
    const href = $(el).attr("href") || "";
    if (title && href && !title.includes("All Videos")) {
      highlights.push({
        මාතෘකාව: title,
        සබැඳිය: `https://www.cricbuzz.com${href}`,
      });
    }
  });

  // Text highlights
  $(".flex.mx-4, .flex.wb\\:mx-4").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) {
      const boldPart = $(el).find("b").first().text().trim();
      const entry = { විස්තරය: text };
      if (boldPart) entry["මාතෘකාව"] = boldPart;
      highlights.push(entry);
    }
  });

  if (highlights.length > 0) {
    result["විශේෂ_අවස්ථා"] = highlights;
  } else {
    result["තත්ත්වය"] = "විශේෂ අවස්ථා තවම නැත";
  }

  return result;
}

function parseNews(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  const articles = [];

  // News article links
  $("a[href*='/cricket-news/']").each((_, el) => {
    const title = $(el).attr("title") || $(el).find("h2, h3, .font-bold").text().trim() || $(el).text().trim();
    const href = $(el).attr("href") || "";
    const desc = $(el).find("p, .text-sm").text().trim();

    if (title && href && title.length > 5 && !title.includes("All Stories") && !title.includes("Latest News")) {
      const entry = {
        මාතෘකාව: title,
        සබැඳිය: href.startsWith("http") ? href : `https://www.cricbuzz.com${href}`,
      };
      if (desc && desc !== title) entry["විස්තරය"] = desc;
      // Avoid duplicates
      if (!articles.find((a) => a.සබැඳිය === entry.සබැඳිය)) {
        articles.push(entry);
      }
    }
  });

  if (articles.length > 0) {
    result["පුවත්_ලැයිස්තුව"] = articles;
  } else {
    result["තත්ත්වය"] = "පුවත් තවම නැත";
  }

  return result;
}

function parsePointsTable(html) {
  if (!html) return { දෝෂය: "පිටුව ලබා ගැනීමට නොහැකි විය" };
  const $ = cheerio.load(html);
  const result = {};

  const tables = [];
  $("table").each((_, table) => {
    const headers = [];
    $(table).find("th").each((__, th) => {
      const headerMap = {
        Team: "කණ්ඩායම",
        M: "තරග",
        W: "ජයග්‍රහණ",
        L: "පරාජය",
        T: "ටයි",
        NR: "ප්‍රතිඵල_නැත",
        Pts: "ලකුණු",
        NRR: "ශුද්ධ_ලකුණු_අනුපාතය",
      };
      const text = $(th).text().trim();
      headers.push(headerMap[text] || text);
    });

    const rows = [];
    $(table).find("tbody tr").each((__, tr) => {
      const row = {};
      $(tr).find("td").each((___, td, idx) => {
        const key = headers[idx] || `col_${idx}`;
        row[key] = $(td).text().trim();
      });
      if (Object.keys(row).length > 0) rows.push(row);
    });

    if (rows.length > 0) {
      tables.push({ ලකුණු: rows });
    }
  });

  if (tables.length > 0) {
    result["ලකුණු_සටහන"] = tables;
  } else {
    result["තත්ත්වය"] = "ලකුණු සටහන තවම නැත";
  }

  return result;
}

// ===== EXTRACT POINTS TABLE URL FROM PAGE =====
function extractPointsTableUrl(html) {
  if (!html) return null;
  const $ = cheerio.load(html);
  let ptUrl = null;
  $("a[href*='points-table']").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.includes("/points-table")) {
      ptUrl = href.startsWith("http") ? href : `https://www.cricbuzz.com${href}`;
      return false;
    }
  });
  return ptUrl;
}

// ===== MAIN SCRAPER =====
async function scrapeMatch(inputUrl) {
  const matchInfo = extractMatchInfo(inputUrl);
  if (!matchInfo) {
    return { දෝෂය: "වලංගු Cricbuzz match URL එකක් දෙන්න" };
  }

  const { matchId, slug } = matchInfo;
  const urls = buildUrls(matchId, slug);

  // Fetch all pages concurrently
  const [infoHtml, liveHtml, scorecardHtml, squadsHtml, oversHtml, commHtml, highlightsHtml, newsHtml] =
    await Promise.all([
      fetchPage(urls.info),
      fetchPage(urls.live),
      fetchPage(urls.scorecard),
      fetchPage(urls.squads),
      fetchPage(urls.overs),
      fetchPage(urls.fullCommentary),
      fetchPage(urls.highlights),
      fetchPage(urls.news),
    ]);

  // Try to get points table URL from info page
  const ptUrl = extractPointsTableUrl(infoHtml || liveHtml);
  let pointsTableHtml = null;
  if (ptUrl) {
    pointsTableHtml = await fetchPage(ptUrl);
  }

  // Parse all
  const data = {
    තරග_හැඳුනුම: matchId,
    Scrape_කළ_වේලාව: new Date().toISOString(),
    සබැඳි: {
      තොරතුරු: urls.info,
      සජීවී: urls.live,
      ලකුණු_පත්‍රය: urls.scorecard,
      කණ්ඩායම්: urls.squads,
      ඕවර: urls.overs,
      සම්පූර්ණ_විවරණය: urls.fullCommentary,
      විශේෂ_අවස්ථා: urls.highlights,
      පුවත්: urls.news,
    },
    තොරතුරු: parseInfo(infoHtml),
    සජීවී_ලකුණු: parseLive(liveHtml),
    ලකුණු_පත්‍රය: parseScorecard(scorecardHtml),
    කණ්ඩායම්_ලැයිස්තුව: parseSquads(squadsHtml),
    ඕවර_අනුව: parseOvers(oversHtml),
    සම්පූර්ණ_විවරණය: parseFullCommentary(commHtml),
    විශේෂ_අවස්ථා: parseHighlights(highlightsHtml),
    පුවත්: parseNews(newsHtml),
  };

  if (pointsTableHtml) {
    data["ලකුණු_සටහන"] = parsePointsTable(pointsTableHtml);
  }

  return data;
}

module.exports = { scrapeMatch };
