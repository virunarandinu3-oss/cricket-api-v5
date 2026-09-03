import { NextResponse } from "next/server";
const { scrapeMatch } = require("../../../lib/scraper");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      {
        දෝෂය: "URL පරාමිතිය අවශ්‍යයි",
        භාවිතය: "/api/scrape?url=CRICBUZZ_MATCH_URL",
        උදාහරණය:
          "/api/scrape?url=https://www.cricbuzz.com/live-cricket-scores/170010/nam-vs-zim-5th-match-namibia-t20i-tri-series-2026",
      },
      { status: 400 }
    );
  }

  if (!url.includes("cricbuzz.com")) {
    return NextResponse.json(
      { දෝෂය: "වලංගු Cricbuzz URL එකක් දෙන්න" },
      { status: 400 }
    );
  }

  try {
    const data = await scrapeMatch(url);

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        දෝෂය: "Scraping අසාර්ථක විය",
        විස්තරය: error.message,
      },
      { status: 500 }
    );
  }
}
