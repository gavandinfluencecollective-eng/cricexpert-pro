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
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "cricket-live-data.p.rapidapi.com";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

const cricketApi = axios.create({
  baseURL: `https://${RAPIDAPI_HOST}`,
  headers: {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": RAPIDAPI_HOST,
  },
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
