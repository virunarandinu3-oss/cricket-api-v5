# 🏏 ක්‍රික්බස් ස්ක්‍රේපර් (Cricbuzz Scraper)

Cricbuzz match URL එකක් දුන්නම **සියලුම tabs** (Info, Live, Scorecard, Squads, Points Table, Overs, Highlights, Full Commentary, News) **JSON** විදිහට **සිංහල** labels සමග ලබා දෙන scraper.

## 🚀 Vercel Deploy කරන ආකාරය

1. මෙම folder එක GitHub repo එකකට push කරන්න
2. [vercel.com](https://vercel.com) වෙත ගොස් repo එක import කරන්න
3. Deploy ක්ලික් කරන්න - ඉවරයි!

## 🔧 Local එකේ Run කරන ආකාරය

```bash
npm install
npm run dev
```

Browser එකේ `http://localhost:3000` open කරන්න.

## 📡 API භාවිතය

```
GET /api/scrape?url=CRICBUZZ_MATCH_URL
```

### උදාහරණය:
```
/api/scrape?url=https://www.cricbuzz.com/live-cricket-scores/170010/nam-vs-zim-5th-match-namibia-t20i-tri-series-2026
```

ඕනෑම tab URL එකක් දෙන්න - Info, Live, Scorecard, Squads, Overs, etc. Match ID එක extract කරලා **සියලුම** pages scrape කරනවා.

## 📦 JSON Output Structure (සිංහල)

```json
{
  "තරග_හැඳුනුම": "170010",
  "Scrape_කළ_වේලාව": "2026-09-03T...",
  "සබැඳි": { ... },
  "තොරතුරු": {
    "තරග_මාතෘකාව": "...",
    "තරගය": "NAM vs ZIM • 5th Match",
    "තරග_මාලාව": "Namibia T20I Tri-Series 2026",
    "දිනය": "...",
    "වේලාව": "2:00 PM LOCAL, 12:00 PM GMT, 5:30 PM IST",
    "ක්‍රීඩාංගනය": "...",
    "විනිසුරුවරු": "...",
    "තුන්වන_විනිසුරු": "...",
    "තරග_තීරකයා": "...",
    "කණ්ඩායම්_තොරතුරු": { ... }
  },
  "සජීවී_ලකුණු": { ... },
  "ලකුණු_පත්‍රය": { ... },
  "කණ්ඩායම්_ලැයිස්තුව": { ... },
  "ඕවර_අනුව": { ... },
  "සම්පූර්ණ_විවරණය": { ... },
  "විශේෂ_අවස්ථා": { ... },
  "පුවත්": { ... },
  "ලකුණු_සටහන": { ... }
}
```

## 🔑 සිංහල JSON Keys

| English | සිංහල Key |
|---------|-----------|
| Match ID | තරග_හැඳුනුම |
| Match | තරගය |
| Series | තරග_මාලාව |
| Date | දිනය |
| Time | වේලාව |
| Venue | ක්‍රීඩාංගනය |
| Teams | කණ්ඩායම් |
| Umpires | විනිසුරුවරු |
| Referee | තරග_තීරකයා |
| Toss | කාසි_වාරය |
| Live Score | සජීවී_ලකුණු |
| Scorecard | ලකුණු_පත්‍රය |
| Squads | කණ්ඩායම්_ලැයිස්තුව |
| Players | ක්‍රීඩකයින් |
| Player Name | නම |
| Captain | නායකයා |
| Wicket Keeper | කඩුලු_රකින්නා |
| Overs | ඕවර_අනුව |
| Commentary | සම්පූර්ණ_විවරණය |
| Highlights | විශේෂ_අවස්ථා |
| News | පුවත් |
| Points Table | ලකුණු_සටහන |
| Status | තත්ත්වය |
| Profile Link | ප්‍රොෆයිල_සබැඳිය |
| Links | සබැඳි |
