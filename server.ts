import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = "cricbuzz-cricket.p.rapidapi.com";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CRICKETDATA_API_KEY = process.env.CRICKETDATA_API_KEY;

// API Key Validation
const hasValidGeminiKey = GEMINI_API_KEY && GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && GEMINI_API_KEY.length > 10;
if (!hasValidGeminiKey) {
  console.error("-------------------------------------------------------------------");
  console.error("WARNING: GEMINI_API_KEY IS MISSING OR INVALID.");
  console.error("PLEASE ADD YOUR API KEY TO THE SECRETS PANEL IN AI STUDIO.");
  console.error("-------------------------------------------------------------------");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "dummy_key" });

const cricbuzzApi = axios.create({
  baseURL: `https://cricbuzz-cricket.p.rapidapi.com`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "cricbuzz-cricket.p.rapidapi.com",
  },
});

const cricketApi = axios.create({
  baseURL: `https://cricket-live-data.p.rapidapi.com`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "cricket-live-data.p.rapidapi.com",
  },
});

const dev132Api = axios.create({
  baseURL: `https://dev132-cricket-live-scores-v1.p.rapidapi.com`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "dev132-cricket-live-scores-v1.p.rapidapi.com",
  },
});

const cricketLiveScore1Api = axios.create({
  baseURL: `https://cricket-live-score1.p.rapidapi.com`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "cricket-live-score1.p.rapidapi.com",
  },
});

const cricketScoreApi = axios.create({
  baseURL: `https://cricket-score.p.rapidapi.com`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "cricket-score.p.rapidapi.com",
  },
});

const liveCricketScoreApi = axios.create({
  baseURL: `https://live-cricket-score.p.rapidapi.com`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": "live-cricket-score.p.rapidapi.com",
  },
});

const cricketDataApi = axios.create({
  baseURL: `https://api.cricapi.com/v1`,
  timeout: 10000,
});

// Live Match Cache
let matchCache: { data: any; timestamp: number } | null = null;
const FRESH_CACHE_TTL = 3 * 60 * 1000; // 3 mins for matches
const PERSISTENT_CACHE_TTL = 24 * 60 * 60 * 1000;

// Circuit Breakers (timestamp based)
let circuitBreakers: Record<string, number> = {
  cricbuzz: 0,
  secondary: 0,
  tertiary: 0,
  quaternary: 0,
  quinary: 0,
  cricketdata: 0
};

const CIRCUIT_COOL_DOWN = 15 * 60 * 1000; // 15 mins

function isCircuitActive(key: string) {
  return Date.now() < (circuitBreakers[key] || 0);
}

function tripCircuit(key: string) {
  console.log(`[CIRCUIT] Tripping ${key} for ${CIRCUIT_COOL_DOWN/60000} mins`);
  circuitBreakers[key] = Date.now() + CIRCUIT_COOL_DOWN;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Debug middleware for API routes
  app.use("/api", (req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next();
  });

  app.get("/api/ping", (req, res) => {
    res.json({ status: "ok", message: "Server is alive and routes are registered" });
  });

  app.get("/api/matches/:matchId/news", async (req, res) => {
    try {
      const matchId = req.params.matchId;
      // Fetch news related to the series or match
      const newsRes = await cricbuzzApi.get(`/news/list`, { params: { matchId } }).catch(() => null);
      
      res.json({
        news: newsRes?.data?.newsList || [],
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({ error: "News fetch failed" });
    }
  });

  app.get("/api/matches/:matchId/insights", async (req, res) => {
    try {
      const matchId = req.params.matchId;
      // Fetch Head-to-Head and Venue details
      // Note: This assumes Cricbuzz Match ID for optimal stats
      const h2hRes = await cricbuzzApi.get(`/matches/get-head-to-head`, { params: { matchId } }).catch(() => null);
      const venueRes = await cricbuzzApi.get(`/venues/get-info`, { params: { matchId } }).catch(() => null);
      
      res.json({
        h2h: h2hRes?.data || {},
        venue: venueRes?.data || {},
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({ error: "Insights failed" });
    }
  });

  // Advanced GL Optimizer Route
  app.post("/api/generate-advanced-gl-teams", async (req, res) => {
    try {
      const { images, leagueType, teamCount, matchId } = req.body;
      if (!hasValidGeminiKey) return res.status(500).json({ 
        error: "GEMINI_API_KEY_INVALID", 
        message: "Your Gemini API key is missing or invalid. Please configure it in the AI Studio Secrets panel." 
      });

      // Fetch optional contextual data for accuracy
      let insights = null;
      if (matchId) {
        try {
          const insightRes = await cricbuzzApi.get(`/matches/get-head-to-head`, { params: { matchId } }).catch(() => null);
          insights = insightRes?.data;
        } catch (e) {
          console.warn("Context fetch failed, proceeding with images only");
        }
      }

      const imageParts = images.map((img: any) => ({
        inlineData: { data: img.data.split(',')[1], mimeType: img.mimeType }
      }));

      const contextPrompt = insights ? `\n\nCRITICAL CONTEXT (Match Insights):\n${JSON.stringify(insights)}` : "";
      const prompt = `Act as an ADVANCED fantasy cricket optimizer for ${teamCount} teams. Analysis for ${leagueType}. Match: ${matchId || "Unknown"}.${contextPrompt}\n\nINTEGRATE HISTORICAL PERFORMANCE: prioritizing players with strong records at this venue or against this specific opponent according to the provided context or your internal database.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [...imageParts, { text: prompt }] },
        config: { responseMimeType: "application/json" }
      });

      res.json(JSON.parse(response.text || '{}'));
    } catch (error: any) {
      console.error("Optimizer Error:", error);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  // Post-Toss Regeneration
  app.post("/api/regenerate-toss-teams", async (req, res) => {
    try {
      const { images, tossInfo: clientToss, playingXI: clientXI, leagueType, teamCount, matchId } = req.body;
      if (!hasValidGeminiKey) return res.status(500).json({ 
        error: "GEMINI_API_KEY_INVALID",
        message: "Gemini API key is invalid or missing in configuration."
      });

      let tossUpdate = clientToss;
      let finalXI = clientXI;

      // Try to fetch real-time data if matchId is present
      if (matchId && (!tossUpdate || !finalXI)) {
        try {
          const matchRes = await cricbuzzApi.get(`/matches/get-info`, { params: { matchId } }).catch(() => null);
          const info = matchRes?.data;
          if (info) {
            tossUpdate = info.status || info.tossResults || clientToss;
            // Attempt to extract playing XI from scores or status if available
            // Note: Cricbuzz usually has a separate endpoint for squads, but sometimes info has enough context
          }
        } catch (e) {
          console.warn("Real-time toss fetch failed, using defaults");
        }
      }

      const imageParts = (images || []).map((img: any) => ({
        inlineData: { data: img.data.split(',')[1], mimeType: img.mimeType }
      }));

      const prompt = `Toss Update: ${typeof tossUpdate === 'string' ? tossUpdate : JSON.stringify(tossUpdate)}. 
      Confirmed Playing XI (if known): ${finalXI?.join(", ") || "Analyze from images and prioritize likely playing XI"}. 
      Act as an EXPERT fantasy cricket optimizer. 
      Analyze the provided images (stats/form) and the NEW TOSS info above. 
      Generate ${teamCount || 1} OPTIMIZED teams for ${leagueType || 'Grand League'}.
      Match Context: ${matchId || "Current"}. 
      Strategy: Adapt to toss (e.g. if a team is batting second on a chasing ground, favor their top order and finishers).
      Provide response in JSON with 'teams' array, each having 'players' (name, role, isCaptain, isViceCaptain) and 'strategy' string.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [...imageParts, { text: prompt }] },
        config: { responseMimeType: "application/json" }
      });
      
      const result = JSON.parse(response.text || '{}');
      res.json({ ...result, _automatedContext: !!matchId });
    } catch (error: any) {
      console.error("Regeneration Error:", error);
      res.status(500).json({ error: "Regeneration failed: " + error.message });
    }
  });

  // After Toss Specialized Optimizer (High Performance)
  app.post("/api/after-toss-optimize", async (req, res) => {
    try {
      const { 
        images, 
        playingXIText, 
        impactPlayersText,
        leagueType, 
        matchId,
        teamCount = 40,
        settings = {
          includeImpact: true,
          boostDifferential: true,
          randomCaptain: true
        }
      } = req.body;

      if (!hasValidGeminiKey) return res.status(500).json({ 
        error: "GEMINI_API_KEY_INVALID",
        message: "Gemini API key is invalid."
      });

      const imageParts = (images || []).map((img: any) => ({
        inlineData: { data: img.data.split(',')[1], mimeType: img.mimeType }
      }));

      const prompt = `--- AFTER TOSS EMERGENCY MODE ---
      Confirmed Playing XI Information:
      ${playingXIText || "Analyze from images"}

      Impact Players / Substitutes:
      ${impactPlayersText || "None specified"}

      League Type: ${leagueType}
      Target Teams: ${teamCount}
      
      Advanced Strategy:
      - Include Impact Players: ${settings.includeImpact} (If true, include in 30-40% of teams)
      - Boost Differentials: ${settings.boostDifferential} (15% selection boost for low-ownership/surprise players)
      - Random Captain Variation: ${settings.randomCaptain} (High entropy in C/VC rotation)

      TASK:
      1. Identify exactly who is playing (Playing XI) for BOTH teams.
      2. Analyze provided stats images to correlate performance with the confirmed 11.
      3. CRITICAL: Remove any player NOT in the Playing XI from consideration.
      4. Generate exactly ${teamCount} fantasy teams.
      
      Structural Requirements:
      - Each team must have 1-4 WK, 3-6 BAT, 1-4 AR, 3-6 BOWL.
      - Total 11 players.
      - 1 Captain (2x points), 1 Vice-Captain (1.5x points).

      Output Format (JSON strictly):
      {
        "groundReport": "Analysis of pitch after toss",
        "tossAdvantage": "Which team benefits?",
        "differentialPicks": [{ "name": "Name", "reason": "Why differential" }],
        "teams": [
          {
            "id": 1..${teamCount},
            "players": ["P1",..."P11"],
            "captain": "Name",
            "viceCaptain": "Name",
            "isImpactUsed": boolean,
            "tossRationale": "Logic for this specific combo",
            "teamBalance": "e.g. 1-4-2-4"
          }
        ]
      }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: { parts: [...imageParts, { text: prompt }] },
        config: { 
          responseMimeType: "application/json",
        }
      });

      res.json(JSON.parse(response.text || '{}'));
    } catch (error: any) {
      console.error("After Toss Error:", error);
      res.status(500).json({ error: "Post-Toss Optimization failed: " + error.message });
    }
  });

  // Cricbuzz Integrated Live Data for IPL
  app.get("/api/live-match", async (req, res) => {
    const now = Date.now();
    
    // 1. Return Fresh Cache
    if (matchCache && (now - matchCache.timestamp < FRESH_CACHE_TTL)) {
      return res.json(matchCache.data);
    }

    let allMatches: any[] = [];
    let source = "Cricbuzz (Live)";
    let apiStatus: any = { 
      cricbuzz: isCircuitActive('cricbuzz') ? "Circuit Active" : "OK",
      secondary: isCircuitActive('secondary') ? "Circuit Active" : "OK",
      tertiary: isCircuitActive('tertiary') ? "Circuit Active" : "OK",
      quaternary: isCircuitActive('quaternary') ? "Circuit Active" : "OK",
      quinary: isCircuitActive('quinary') ? "Circuit Active" : "OK",
      cricketdata: isCircuitActive('cricketdata') ? "Circuit Active" : "OK"
    };

    const hasRapidKey = RAPIDAPI_KEY && RAPIDAPI_KEY !== "MY_RAPIDAPI_KEY" && RAPIDAPI_KEY !== "";

    // --- FALLBACK 1: CRICBUZZ ---
    if (!isCircuitActive('cricbuzz') && hasRapidKey) {
      try {
        // Try v1 endpoint first, then fallback to base /matches/list
        const response = await cricbuzzApi.get("/matches/v1/list", { params: { matchType: "live" }, timeout: 6000 })
          .catch(() => cricbuzzApi.get("/matches/list", { params: { matchType: "live" }, timeout: 6000 }));
          
        const matchGroups = response.data?.typeMatches || [];
        matchGroups.forEach((group: any) => {
          group.seriesMatches?.forEach((series: any) => {
            series.seriesAdWrapper?.matches?.forEach((m: any) => {
              const matchInfo = m.matchInfo;
              const matchScore = m.matchScore;
              const s1 = matchScore?.team1Score?.inngs1;
              const s2 = matchScore?.team2Score?.inngs1;
              allMatches.push({
                id: matchInfo.matchId?.toString(),
                team_a: matchInfo.team1?.teamName || "T1",
                team_b: matchInfo.team2?.teamName || "T2",
                score: s1 ? `${s1.runs}/${s1.wickets} vs ${s2?.runs || 0}/${s2?.wickets || 0}` : (matchInfo.status || "Live"),
                status: matchInfo.status || "Live",
                league: series.seriesAdWrapper.seriesName || "Match",
                venue: matchInfo.venueInfo?.ground || "Stadium",
                isIPL: (series.seriesAdWrapper.seriesName || "").toLowerCase().includes("ipl"),
                flag_a: "🏏", flag_b: "📡"
              });
            });
          });
        });
      } catch (err: any) {
        const isQuotaErr = err.response?.status === 429 || err.response?.status === 403;
        console.warn(`Cricbuzz API failed (${err.response?.status || 'Error'}). ${isQuotaErr ? 'Tripping circuit.' : ''}`);
        if (isQuotaErr) tripCircuit('cricbuzz');
        apiStatus.cricbuzz = `Fail (${err.response?.status || 'Network'})`;
      }
    }

    // --- FALLBACK 2: CRICKET-LIVE-DATA ---
    if (allMatches.length === 0 && !isCircuitActive('secondary') && hasRapidKey) {
      try {
        source = "Cricket-Live-Data";
        const fbRes = await cricketApi.get("/fixtures-live", { timeout: 6000 });
        const results = fbRes.data?.results || [];
        results.forEach((m: any) => {
          allMatches.push({
            id: m.id?.toString() || Math.random().toString(),
            team_a: m.home?.name || "Team A",
            team_b: m.away?.name || "Team B",
            score: m.live_score || "TBD",
            status: m.status || "Live",
            league: m.series?.name || "Match",
            isIPL: (m.series?.name || "").toLowerCase().includes("ipl"),
            flag_a: "🏏", flag_b: "📡"
          });
        });
      } catch (err: any) {
        if (err.response?.status === 429 || err.response?.status === 403) tripCircuit('secondary');
        apiStatus.secondary = "Fail";
      }
    }

    // --- FALLBACK 3: DEV132 ---
    if (allMatches.length === 0 && !isCircuitActive('tertiary') && hasRapidKey) {
      try {
        source = "Dev132 Cricket";
        const tRes = await dev132Api.get("/match-list.php", { timeout: 6500 }).catch(() => dev132Api.get("/matches.php"));
        const matchesArr = tRes.data?.matchList?.matches || tRes.data?.results || [];
        matchesArr.forEach((m: any) => {
          allMatches.push({
            id: m.matchId?.toString() || m.id?.toString() || Math.random().toString(),
            team_a: m.team_1 || m.homeTeam?.name || m.team_a || "Team A",
            team_b: m.team_2 || m.awayTeam?.name || m.team_b || "Team B",
            score: m.live_score || m.score || "Live",
            status: m.status || "Live",
            league: m.series_name || "Match",
            flag_a: "🏏", flag_b: "📡"
          });
        });
      } catch (err: any) {
        if (err.response?.status === 429 || err.response?.status === 403) tripCircuit('tertiary');
        apiStatus.tertiary = "Fail";
      }
    }

    // --- FALLBACK 4-5: CRICKET-SCORE & LIVE-CRICKET-SCORE ---
    if (allMatches.length === 0 && hasRapidKey) {
       try {
         source = "RapidAPI Multi-Pool";
         const qRes = await cricketLiveScore1Api.get("/live_scores", { timeout: 6000 }).catch(() => cricketScoreApi.get("/live-scores"));
         const qData = qRes.data?.matches || qRes.data?.results || [];
         qData.forEach((m: any) => {
           allMatches.push({
             id: m.id || m.match_id || Math.random().toString(),
             team_a: m.team_a || m.home?.name || "T1",
             team_b: m.team_b || m.away?.name || "T2",
             score: m.score || m.live_score || "Live",
             status: m.status || "Live",
             league: m.event_name || m.series?.name || "Match",
             flag_a: "🏏", flag_b: "📡"
           });
         });
       } catch (e) {
         console.warn("Multi-pool fail");
       }
    }

    // --- FALLBACK 6: CRICKETDATA.ORG ---
    if (allMatches.length === 0 && !isCircuitActive('cricketdata')) {
      try {
        source = "CricketData (CricAPI)";
        const cdRes = await cricketDataApi.get("/currentMatches", { params: { apikey: CRICKETDATA_API_KEY || "dummy" } });
        const matchesArr = cdRes.data?.data || [];
        matchesArr.filter((m: any) => m.ms === "live").forEach((m: any) => {
          allMatches.push({
            id: m.id,
            team_a: m.t1 || m.teams?.[0] || "Team 1",
            team_b: m.t2 || m.teams?.[1] || "Team 2",
            score: m.status || "Live",
            status: m.status || "Live",
            league: m.name || "Tournament",
            flag_a: "🇮🇳", flag_b: "📡"
          });
        });
      } catch (err) {
        apiStatus.cricketdata = "Fail";
      }
    }

    // --- FINAL FALLBACK: SATELLITE SIMULATION (Mock) ---
    if (allMatches.length === 0) {
      source = "Satellite Simulation Mode";
      allMatches = [
        { id: "S1", team_a: "India", team_b: "Australia", score: "India: 242/6 (42.1 ov)", status: "Live - 4th ODI", league: "IND vs AUS Series", flag_a: "🇮🇳", flag_b: "🇦🇺" },
        { id: "S2", team_a: "IPL - MI", team_b: "IPL - RCB", score: "MI: 192/4 | RCB: 12/0 (1.1 ov)", status: "RCB chasing 193", league: "IPL 2026", isIPL: true, flag_a: "🟦", flag_b: "🟥" },
        { id: "S3", team_a: "England", team_b: "New Zealand", score: "NZ won by 2 wickets", status: "Recent", league: "T20 International", flag_a: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", flag_b: "🇳🇿" }
      ];
    }

    const live = allMatches.filter(m => !m.status?.toLowerCase().includes("won") && !m.status?.toLowerCase().includes("result"));
    const recent = allMatches.filter(m => m.status?.toLowerCase().includes("won") || m.status?.toLowerCase().includes("result"));

    const finalizedData = { 
      live, 
      upcoming: [], 
      recent, 
      _source: source,
      _apiStatus: apiStatus,
      timestamp: Date.now() 
    };

    matchCache = { data: finalizedData, timestamp: Date.now() };
    res.json(finalizedData);
  });

  // Catch-all for failed API routes
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.originalUrl} not found` });
  });

  // Vite/Static middleware LAST
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
