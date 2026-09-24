const { scrapeMatch } = require("./scraper");

function extractTargetUrl(request, params) {
  // 1. Query parameter: ?url=...
  const reqUrl = new URL(request.url);
  const qUrl = reqUrl.searchParams.get("url");
  if (qUrl) return qUrl.trim();

  // 2. Direct path extraction: e.g. /https://www.cricbuzz.com/... or /169891
  const rawUrl = request.url;
  const originMatch = rawUrl.match(/^https?:\/\/[^\/]+\/(.+)$/);
  if (originMatch && originMatch[1]) {
    let pathPart = originMatch[1];
    const qIndex = pathPart.indexOf("?");
    if (qIndex !== -1) pathPart = pathPart.slice(0, qIndex);

    // Skip special Next.js internal routes or api/scrape
    if (pathPart === "api/scrape" || pathPart.startsWith("_next")) return null;

    // Normalizing protocol if double-slash got collapsed to single slash
    if (/^https?:\/+/i.test(pathPart)) {
      return pathPart.replace(/^(https?):\/+/i, "$1://");
    }
    // Starts with cricbuzz.com
    if (/^(www\.)?cricbuzz\.com/i.test(pathPart)) {
      return "https://" + pathPart;
    }
    // Cricbuzz url inside path
    const cbIndex = pathPart.indexOf("cricbuzz.com");
    if (cbIndex !== -1) {
      return "https://" + pathPart.slice(cbIndex);
    }
    // live-cricket-scores or other cricbuzz subpaths
    if (pathPart.includes("live-cricket-scores/") || pathPart.includes("live-cricket-scorecard/")) {
      return "https://www.cricbuzz.com/" + pathPart.replace(/^\/+/, "");
    }
    // Match ID with optional slug: /169891 or /169891/indw-vs-slw
    const matchIdMatch = pathPart.match(/^(\d{5,})(?:\/([a-zA-Z0-9\-]+))?/);
    if (matchIdMatch) {
      return `https://www.cricbuzz.com/live-cricket-scores/${matchIdMatch[1]}${
        matchIdMatch[2] ? "/" + matchIdMatch[2] : ""
      }`;
    }
    // Any 5+ digits in path
    const anyId = pathPart.match(/(\d{5,})/);
    if (anyId) {
      return `https://www.cricbuzz.com/live-cricket-scores/${anyId[1]}`;
    }
  }

  // 3. From route params
  if (params && params.matchUrl) {
    const segments = Array.isArray(params.matchUrl) ? params.matchUrl : [params.matchUrl];
    const joined = segments.join("/");
    if (/^https?:\/+/i.test(joined)) {
      return joined.replace(/^(https?):\/+/i, "$1://");
    }
    if (/^(www\.)?cricbuzz\.com/i.test(joined)) {
      return "https://" + joined;
    }
    const idMatch = joined.match(/(\d{5,})/);
    if (idMatch) {
      return `https://www.cricbuzz.com/live-cricket-scores/${idMatch[1]}`;
    }
  }

  return null;
}

async function handleApiRequest(request, params) {
  const targetUrl = extractTargetUrl(request, params);

  // Return usage guide if no URL or ID provided
  if (!targetUrl) {
    return new Response(
      JSON.stringify(
        {
          created_by: "Created By Viruna Randinu",
          status: "online",
          service: "Cricbuzz Live Cricket Scraper API v6 (Universal)",
          usage: {
            method_1_direct_slash:
              "https://cricket-api-v5.vercel.app/https://www.cricbuzz.com/live-cricket-scores/170963/indw-vs-slw-final-womens-asian-games-2026",
            method_2_match_id: "https://cricket-api-v5.vercel.app/170963",
            method_3_query_param:
              "https://cricket-api-v5.vercel.app/?url=https://www.cricbuzz.com/live-cricket-scores/170963/indw-vs-slw-final-womens-asian-games-2026",
          },
          features: [
            "Universal: Works for ALL formats (Test, ODI, T20, The Hundred, T10)",
            "Dual-Team Multi-Innings Scoreboard: Returns scores for BOTH teams simultaneously",
            "Universal Flags: Includes official flag_url for all countries & associates",
            "Smart Tiered In-Memory Caching: Sub-millisecond response for repeat requests & low CPU",
            "Auto Match State: UPCOMING (with pre-toss logic & countdown), IN_PROGRESS, COMPLETED",
            "Monotonic Progression Engine: Eliminates edge CDN score regressions",
          ],
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Validate that a match URL or ID is present
  if (!targetUrl.includes("cricbuzz.com") && !/(\d{5,})/.test(targetUrl)) {
    return new Response(
      JSON.stringify(
        {
          error: "Please provide a valid Cricbuzz match URL or Match ID",
          example:
            "/https://www.cricbuzz.com/live-cricket-scores/170963/indw-vs-slw-final-womens-asian-games-2026",
        },
        null,
        2
      ),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  try {
    const data = await scrapeMatch(targetUrl);

    // Dynamic Edge Cache Control to slash Fluid Active CPU
    let cacheHeader = "public, s-maxage=2, stale-while-revalidate=4";
    if (data.match_state?.status === "COMPLETED") {
      cacheHeader = "public, s-maxage=3600, stale-while-revalidate=86400";
    } else if (data.match_state?.status === "UPCOMING") {
      const diff = data.match_state?.diff_ms || 0;
      if (diff > 15 * 60 * 1000) {
        cacheHeader = "public, s-maxage=180, stale-while-revalidate=300";
      } else {
        cacheHeader = "public, s-maxage=12, stale-while-revalidate=30";
      }
    }

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": cacheHeader,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          error: "Scraping failed",
          message: error.message,
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

module.exports = { handleApiRequest, handleOptions, extractTargetUrl };
