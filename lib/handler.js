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

    if (pathPart === "api/scrape" || pathPart.startsWith("_next")) return null;

    if (/^https?:\/+/i.test(pathPart)) {
      return pathPart.replace(/^(https?):\/+/i, "$1://");
    }
    if (/^(www\.)?cricbuzz\.com/i.test(pathPart)) {
      return "https://" + pathPart;
    }
    const cbIndex = pathPart.indexOf("cricbuzz.com");
    if (cbIndex !== -1) {
      return "https://" + pathPart.slice(cbIndex);
    }
    if (pathPart.includes("live-cricket-scores/") || pathPart.includes("live-cricket-scorecard/")) {
      return "https://www.cricbuzz.com/" + pathPart.replace(/^\/+/, "");
    }
    const matchIdMatch = pathPart.match(/^(\d{5,})(?:\/([a-zA-Z0-9\-]+))?/);
    if (matchIdMatch) {
      return `https://www.cricbuzz.com/live-cricket-scores/${matchIdMatch[1]}${
        matchIdMatch[2] ? "/" + matchIdMatch[2] : ""
      }`;
    }
    const anyId = pathPart.match(/(\d{5,})/);
    if (anyId) {
      return `https://www.cricbuzz.com/live-cricket-scores/${anyId[1]}`;
    }
  }

  // 3. Route params
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

  if (!targetUrl) {
    return new Response(
      JSON.stringify(
        {
          created_by: "Created By Viruna Randinu",
          status: "online",
          service: "Cricbuzz Live Cricket Scraper API v5",
          usage: {
            method_1_direct_slash:
              "https://cricket-api-v5.vercel.app/https://www.cricbuzz.com/live-cricket-scores/169891/indw-vs-slw-final-womens-asia-cup-2026",
            method_2_match_id: "https://cricket-api-v5.vercel.app/169891",
            method_3_query_param:
              "https://cricket-api-v5.vercel.app/?url=https://www.cricbuzz.com/live-cricket-scores/169891/indw-vs-slw-final-womens-asia-cup-2026",
          },
          features: [
            "Universal: Works for ANY match (SL vs NED, IPL, Asian Games, County, etc.)",
            "Auto Match State: UPCOMING (with real-time countdown), IN_PROGRESS (ON Progress), COMPLETED (Match Ended)",
            "Millisecond Epoch timestamp: matchStartTimestamp (ready for setInterval or Countdown components)",
            "Multi-Innings Scores: Includes BOTH the active batting team and finished team scores",
            "Monotonic Integrity Engine: Eliminates 8-1 to 3-0 backwards score jumps caused by edge CDN blips",
          ],
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  if (!targetUrl.includes("cricbuzz.com") && !/(\d{5,})/.test(targetUrl)) {
    return new Response(
      JSON.stringify(
        {
          error: "Please provide a valid Cricbuzz match URL or Match ID",
          example:
            "/https://www.cricbuzz.com/live-cricket-scores/169891/indw-vs-slw-final-womens-asia-cup-2026",
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
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        Pragma: "no-cache",
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
