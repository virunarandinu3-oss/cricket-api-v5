import { NextResponse } from "next/server";
const { scrapeMatch } = require("../../../lib/scraper");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new Response(
      JSON.stringify(
        {
          error: "URL parameter is required",
          usage: "/api/scrape?url=CRICBUZZ_MATCH_URL",
          example:
            "/api/scrape?url=https://www.cricbuzz.com/live-cricket-scores/154584/bbt-vs-tkr-27th-match-caribbean-premier-league-2026",
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

  if (!url.includes("cricbuzz.com")) {
    return new Response(
      JSON.stringify({ error: "Please provide a valid Cricbuzz match URL" }, null, 2),
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
    const data = await scrapeMatch(url);

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
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
