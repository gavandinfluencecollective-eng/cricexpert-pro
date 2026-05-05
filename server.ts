import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "cricbuzz-cricket.p.rapidapi.com";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CRICKETDATA_API_KEY = process.env.CRICKETDATA_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

const cricketDataApi = axios.create({
  baseURL: `https://api.cricapi.com/v1`,
});

const cricketApi = axios.create({
  baseURL: `https://cricket-live-data.p.rapidapi.com`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "cricket-live-data.p.rapidapi.com",
  },
});

const cricbuzzApi = axios.create({
  baseURL: `https://cricbuzz-cricket.p.rapidapi.com`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
  },
});

// Live Match Cache
let matchCache: { data: any; timestamp: number } | null = null;
const FRESH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (Fresh)
const PERSISTENT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours (Stale fallback)

// Error state tracking
let cricbuzzCircuitUntil: number = 0;
let fallbackCircuitUntil: number = 0;
const CIRCUIT_TIMEOUT = 10 * 60 * 1000; // 10 mins

// Helper to fetch Cricbuzz data
const fetchCricbuzzCategory = async (category: 'live' | 'upcoming' | 'recent') => {
  if (Date.now() < cricbuzzCircuitUntil) {
    return { data: [], error: "Circuit breaker active" };
  }

  try {
    const response = await cricbuzzApi.get(`/matches/v1/${category}`, { timeout: 8000 });
    const typeMatches = response.data?.typeMatches || [];
    const matches: any[] = [];
    
    typeMatches.forEach((type: any) => {
      if (type.seriesMatches) {
        type.seriesMatches.forEach((series: any) => {
          if (series.seriesAdWrapper && series.seriesAdWrapper.matches) {
            series.seriesAdWrapper.matches.forEach((m: any) => {
              const matchInfo = m.matchInfo;
              if (matchInfo) {
                matches.push({
                  id: matchInfo.matchId?.toString(),
                  title: matchInfo.seriesName,
                  team_a: matchInfo.team1?.teamName,
                  team_b: matchInfo.team2?.teamName,
                  match_status: matchInfo.status,
                  type: category,
                  score: m.matchScore ? `${m.matchScore.team1Score?.inngs1?.runs || 0}/${m.matchScore.team1Score?.inngs1?.wickets || 0} vs ${m.matchScore.team2Score?.inngs1?.runs || 0}/${m.matchScore.team2Score?.inngs1?.wickets || 0}` : (category === 'upcoming' ? "Starts soon" : "Final results")
                });
              }
            });
          }
        });
      }
    });
    return { data: matches, error: null };
  } catch (e: any) {
    const status = e.response?.status;
    if (status === 403 || status === 429) {
      console.warn(`Cricbuzz API ${status}: Rate limited or unsubscribed. Cooling down for 10 min.`);
      cricbuzzCircuitUntil = Date.now() + CIRCUIT_TIMEOUT;
    } else {
      console.error(`Error fetching Cricbuzz ${category}:`, status || e.message);
    }
    return { data: [], error: status || e.message };
  }
};

const fetchFallbackCategory = async (category: 'live' | 'upcoming' | 'recent') => {
  if (Date.now() < fallbackCircuitUntil) {
    return [];
  }

  try {
    const endpoint = category === 'live' ? '/fixtures-live' : 
                   category === 'upcoming' ? '/fixtures-upcoming' : '/fixtures-recent';
    
    const response = await cricketApi.get(endpoint, { timeout: 8000 });
    const results = response.data?.results || [];
    return results.map((m: any) => ({
      id: m.id || m.match_id || Math.random().toString(),
      title: m.series?.name || m.match_subtitle || "Match Info",
      team_a: m.home?.name || "Team A",
      team_b: m.away?.name || "Team B",
      match_status: m.status || category,
      score: m.live_score || (category === 'live' ? "Checking..." : category === 'upcoming' ? "Wait" : "Finished"),
      type: category
    }));
  } catch (e: any) {
    const status = e.response?.status;
    if (status === 403 || status === 429) {
      console.warn(`Secondary API ${status}: Cache hit or access denied. Cooling down.`);
      fallbackCircuitUntil = Date.now() + CIRCUIT_TIMEOUT;
    } else {
      console.error(`Secondary API fallback failed for ${category}:`, status || e.message);
    }
    return [];
  }
};

// Live Match Route
app.get("/api/live-match", async (req, res) => {
  if (!RAPIDAPI_KEY) {
    return res.status(200).json({ error: "RAPIDAPI_KEY not found in environment.", results: [], live: [], upcoming: [], recent: [] });
  }

  // 1. Fresh Cache serving
  if (matchCache && (Date.now() - matchCache.timestamp < FRESH_CACHE_TTL)) {
    return res.json(matchCache.data);
  }

  // 2. If BOTH circuits broken, use stale cache (up to 24h)
  const allBroken = Date.now() < cricbuzzCircuitUntil && Date.now() < fallbackCircuitUntil;
  if (allBroken && matchCache && (Date.now() - matchCache.timestamp < PERSISTENT_CACHE_TTL)) {
    console.log("Both APIs circuit broken, serving stale data...");
    return res.json({ ...matchCache.data, _stale: true });
  }

  try {
    // 3. Sequential Fetch
    let liveResult = await fetchCricbuzzCategory('live');
    let live = liveResult.data || [];
    
    let upcomingResult = await fetchCricbuzzCategory('upcoming');
    let upcoming = upcomingResult.data || [];

    let recentResult = await fetchCricbuzzCategory('recent');
    let recent = recentResult.data || [];

    const cricbuzzFailed = liveResult.error || upcomingResult.error || recentResult.error;
    
    // 4. Fallback if needed (API failure or empty live list)
    if (live.length === 0 || cricbuzzFailed) {
       // Only log if it's a real failure, not just a circuit breaker state
       if (cricbuzzFailed && cricbuzzFailed !== "Circuit breaker active") {
         console.warn(`Primary API state: ${cricbuzzFailed}. Attempting fallback...`);
       }
       
       const fallbackLive = await fetchFallbackCategory('live');
       if (fallbackLive.length > 0) live = [...live, ...fallbackLive];

       if (upcoming.length === 0) upcoming = await fetchFallbackCategory('upcoming');
       if (recent.length === 0) recent = await fetchFallbackCategory('recent');
    }

    const finalizedData = { 
      live, 
      upcoming, 
      recent, 
      results: [...live, ...upcoming, ...recent] 
    };

    // 5. Success State Update & Cache
    if (live.length > 0 || upcoming.length > 0 || recent.length > 0) {
      matchCache = { data: finalizedData, timestamp: Date.now() };
      return res.json(finalizedData);
    } 
    
    // 6. Hard Failure Fallback (Stale Cache)
    if (matchCache && (Date.now() - matchCache.timestamp < PERSISTENT_CACHE_TTL)) {
       console.log("No new data available, serving persistent cache.");
       return res.json({ ...matchCache.data, _stale: true });
    }
    
    const guiError = cricbuzzFailed === 403 
      ? "RapidAPI: Access Denied (403). Match Sync requires a valid RapidAPI subscription. Check your 'Cricbuzz-Cricket' and 'Cricket-Live-Data' subscriptions." 
      : (cricbuzzFailed === 429 ? "RapidAPI: Rate limit exceeded. Try again in 15 minutes." : "No live, upcoming, or recent matches available at this moment.");
      
    return res.json({ error: guiError, live: [], upcoming: [], recent: [], results: [] });

  } catch (error: any) {
    console.error("Match Fetch API Error:", error.message);
    if (matchCache) return res.json({ ...matchCache.data, _stale: true });
    res.json({ error: "API connection error. Try again later.", live: [], upcoming: [], recent: [], results: [] });
  }
});

// New CricketData.org Route
app.get("/api/cricket-data/matches", async (req, res) => {
  if (!CRICKETDATA_API_KEY) {
    return res.status(200).json({ 
      error: "CRICKETDATA_API_KEY not found. Please set it in environment.", 
      data: [] 
    });
  }

  try {
    const response = await cricketDataApi.get("/currentMatches", {
      params: { apikey: CRICKETDATA_API_KEY, offset: 0 }
    });
    
    // Map CricketData.org format to our app format
    const matches = Array.isArray(response.data?.data) ? response.data.data : [];
    const formattedMatches = matches.map((m: any) => {
      const score = Array.isArray(m.score) ? m.score : [];
      const scoreA = score[0];
      const scoreB = score[1];
      const teams = Array.isArray(m.teams) ? m.teams : ["Unknown", "Unknown"];
      
      return {
        id: m.id || Math.random().toString(),
        team_a: teams[0] || "Team A",
        team_b: teams[1] || "Team B",
        score_a: scoreA ? `${scoreA.r}/${scoreA.w} (${scoreA.o} ov)` : "Yet to bat",
        score_b: scoreB ? `${scoreB.r}/${scoreB.w} (${scoreB.o} ov)` : "Yet to bat",
        overs: scoreB ? scoreB.o?.toString() : (scoreA ? scoreA.o?.toString() : "0.0"),
        league: m.series_id ? (m.series_id.length > 20 ? "Series Match" : m.series_id) : (m.matchType ? m.matchType.toUpperCase() : "Match"),
        status: m.status || "Scheduled",
        matchStarted: m.matchStarted,
        matchEnded: m.matchEnded,
        venue: m.venue || "Stadium",
        date: m.date || "TBD",
        crr: "N/A",
        last_updated: "Real-time Feed",
        flag_a: "🏏",
        flag_b: "🏏"
      };
    });

    const live = formattedMatches.filter((m: any) => m.matchStarted && !m.matchEnded);
    const completed = formattedMatches.filter((m: any) => m.matchEnded);
    const upcoming = formattedMatches.filter((m: any) => !m.matchStarted);

    res.json({ live, completed, upcoming });
  } catch (error: any) {
    console.error("CricketData API Error:", error.message);
    res.status(500).json({ error: "Failed to fetch from CricketData API" });
  }
});

// Advanced GL Optimizer Route
app.post("/api/generate-advanced-gl-teams", async (req, res) => {
  try {
    const { images, leagueType, teamCount, matchId } = req.body;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    const imageParts = images.map((img: any) => ({
      inlineData: {
        data: img.data.split(',')[1],
        mimeType: img.mimeType,
      },
    }));

    const prompt = `
      Act as an EXTREME ADVANCED fantasy cricket optimizer specializing in Grand Leagues (G-Leagues).
      Your goal is to generate ${teamCount} HIGH-VARIANCE, unique squads designed for a 50-100 team multi-entry strategy.

      STRATEGY: "CHAOS EXPLOITATION"
      We assume standard "safe" teams will fail. We are aiming for the top 0.1% rank.

      DIFFERENTIAL LOGIC:
      - SCENARIO SIMULATION: For each team, pick one extreme scenario (Top order collapse, All-rounder heavy, Tail-ender hero, Underdog win).
      - OWNERSHIP FADING: Rank players provided in images/data by ownership (if available, otherwise guess based on fame). Fade (exclude) at least 2 "mega-stars" (>70% ownership) in 50% of the teams.
      - UNKNOWN HEROES: Prioritize players with <10% ownership who have high potential (death bowlers, pinch hitters).
      - CAPTAINCY: NEVER use the same Captain/Vice-Captain pair more than twice across all ${teamCount} teams. Use differential captains (uncommon choices).

      MATCH DATA:
      ${matchId ? `Match ID provided: ${matchId}. Prioritize players from this match if data is detected.` : "Use image data primarily."}

      OUTPUT FORMAT (JSON):
      {
        "groundReport": "Extreme tactical summary",
        "playerEvaluations": "High-risk form analysis",
        "keyMatchups": "Critical differential matchups",
        "matchScenarioProbs": { "highScoring": "%", "lowScoring": "%", "oneSided": "%", "bowlingDominant": "%", "allRounderImpact": "%" },
        "differentialPicks": [{ "name": "Name", "reason": "Why this pick breaks the game" }],
        "fadeStrategy": [{ "name": "Name", "reason": "Risk of failure today" }],
        "captaincyMatrix": { "safe": [], "risky": [], "ultraDifferential": [] },
        "teamBuildingBlueprint": "ADVANCED OPTIMIZER ACTIVE: High variance strategy deployed.",
        "teams": [
          {
            "id": 1,
            "players": ["P1",..."P11"],
            "captain": "Name",
            "viceCaptain": "Name",
            "backupPlayers": ["B1", "B2"],
            "mode": "Advanced Grand",
            "riskLevel": "Extreme",
            "differentials": ["List players in this team with <20% ownership"],
            "scenario": "Specific disaster or miracle scenario being played",
            "rationale": "Deep tactical why"
          }
        ]
      }
    `;

    const result = await (ai as any).models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: 'user',
          parts: [...imageParts, { text: prompt }],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = result.text || '{}';
    // Simplified parsing for safety
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const analysis = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

    res.json(analysis);
  } catch (error) {
    console.error("Optimizer Error:", error);
    res.status(500).json({ error: "Failed to generate optimized teams" });
  }
});

// Post-Toss Regeneration Route
app.post("/api/regenerate-toss-teams", async (req, res) => {
  try {
    const { images, leagueType, teamCount, matchId, tossInfo, playingXI } = req.body;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    const imageParts = images.map((img: any) => ({
      inlineData: {
        data: img.data.split(',')[1],
        mimeType: img.mimeType,
      },
    }));

    const prompt = `
      Act as a WORLD-CLASS Fantasy Cricket Post-Toss Optimizer.
      TOSS IS OVER. We have the confirmed Playing XI and Toss result.
      
      TOSS INFO: ${JSON.stringify(tossInfo)}
      CONFIRMED XI: ${playingXI ? playingXI.join(", ") : "Use image data and filter out non-playing players"}

      STRICT RULES:
      1. IGNORE ALL PRE-TOSS TEAMS. Start from scratch.
      2. REBUILD REQUIREMENT: At least 60% of each team combination must be different from standard/safe selections.
      3. TOSS ADJUSTMENT: 
         - If chasing: Favor middle-order finishers and death bowlers from the team bowling first.
         - If batting first: Look for big-hitting openers and spin-traps in the second innings.
      4. SCENARIOS TO COVER:
         - SCENARIO A: "Chasing Advantage" (Stable chase by top 4).
         - SCENARIO B: "Bowling Dominance" (Low scoring game, 7-8 bowlers across both teams).
         - SCENARIO C: "Unexpected Performers" (Hidden gems/differential picks from the bench).
      5. PURE PLAYING XI: Only include players confirmed in the Playing XI.
      6. CAPTAINCY: Recalculate based on toss. E.g., if a high-impact bowler is bowling first under lights, make them VC/C.

      OUTPUT FORMAT (JSON):
      {
        "tossImpactAnalysis": "How the toss changed the game dynamic",
        "scenarioBreakdown": "Details on the 3 scenarios generated",
        "teams": [
          {
            "id": 1,
            "players": ["P1",..."P11"],
            "captain": "Name",
            "viceCaptain": "Name",
            "mode": "Post-Toss Optimized",
            "scenario": "Chasing / Bowling / Chaos",
            "tossRationale": "Why this team works after the toss result"
          }
        ]
      }
    `;

    const result = await (ai as any).models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: 'user',
          parts: [...imageParts, { text: prompt }],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const responseText = result.text || '{}';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const analysis = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

    res.json(analysis);
  } catch (error) {
    console.error("Post-Toss Error:", error);
    res.status(500).json({ error: "Failed to regenerate post-toss teams" });
  }
});

// Function 1: get_match_data
app.get("/api/matches/:matchId", async (req, res) => {
  try {
    const { matchId } = req.params;
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({ error: "RAPIDAPI_KEY not configured", failsafe: true });
    }
    
    // Attempt to get match details
    const response = await cricketApi.get(`/match/${matchId}`);
    const data = response.data?.results || {};
    
    res.json({
      playing11: data.playing_11 || [],
      toss: data.toss || "Not announced",
      pitch_report: data.pitch_report || "Balanced",
      venue: data.venue || "Unknown",
      match_status: data.status || "Upcoming",
      teams: data.teams || []
    });
  } catch (error) {
    console.error("Error fetching match data:", error);
    res.status(500).json({ error: "Failed to fetch live match data", failsafe: true });
  }
});

// Function 2: get_player_stats
app.post("/api/players/stats", async (req, res) => {
  try {
    const { playerNames } = req.body;
    // Mocking player stats if API doesn't support bulk lookup easily
    // In a real app, you'd loop or use a player search endpoint
    res.json({
      stats: playerNames.map((name: string) => ({
        name,
        recentForm: Math.floor(Math.random() * 50) + 30, // Mocked for integration demo
        role: "All-rounder",
        battingPosition: Math.floor(Math.random() * 6) + 1,
        performanceMetrics: "Highly impactful in recent games"
      }))
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch player stats", failsafe: true });
  }
});

// Function 3: get_live_updates
app.get("/api/matches/:matchId/live", async (req, res) => {
  try {
    const { matchId } = req.params;
    const response = await cricketApi.get(`/live-score/${matchId}`);
    res.json(response.data?.results || { message: "Match not live" });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch live updates", failsafe: true });
  }
});

// List Current Matches - Helper for UI
app.get("/api/matches", async (req, res) => {
  try {
    if (!RAPIDAPI_KEY) {
        return res.json({ results: [], info: "Demo Mode: Add RAPIDAPI_KEY to see real matches" });
    }
    const response = await cricketApi.get("/matches-upcoming");
    res.json(response.data || { results: [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
