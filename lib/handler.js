const { scrapeMatch } = require("./scraper");

function extractTargetUrl(request, params) {
  const reqUrl = new URL(request.url);
  const qUrl = reqUrl.searchParams.get("url");
  if (qUrl) return qUrl.trim();

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
          service: "Cricbuzz Live Cricket Scraper API v6 (Universal)",
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

  if (!targetUrl.includes("cricbuzz.com") && !/(\d{5,})/.test(targetUrl)) {
    return new Response(
      JSON.stringify(
        {
          error: "Please provide a valid Cricbuzz match URL or Match ID",
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
    const reqUrl = new URL(request.url);
    const forceFresh = reqUrl.searchParams.has("fresh") || reqUrl.searchParams.has("nocache") || reqUrl.searchParams.has("_cb");
    const data = await scrapeMatch(targetUrl, forceFresh);

    let cacheHeader = "public, s-maxage=2, stale-while-revalidate=4, max-age=0, must-revalidate";
    if (data.match_state?.status === "UPCOMING") {
      const diff = data.match_state?.diff_ms || 0;
      if (diff > 15 * 60 * 1000) {
        cacheHeader = "public, s-maxage=60, stale-while-revalidate=120";
      } else {
        cacheHeader = "public, s-maxage=5, stale-while-revalidate=10";
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

module.exports = { handleApiRequest, handleOptions };
