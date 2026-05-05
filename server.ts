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

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

const cricketDataApi = axios.create({
  baseURL: `https://api.cricapi.com/v1`,
  timeout: 10000,
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
const FRESH_CACHE_TTL = 10 * 60 * 1000;
const PERSISTENT_CACHE_TTL = 24 * 60 * 60 * 1000;

let cricbuzzCircuitUntil: number = 0;
let fallbackCircuitUntil: number = 0;
const CIRCUIT_TIMEOUT = 10 * 60 * 1000;

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

  // Advanced GL Optimizer Route
  app.post("/api/generate-advanced-gl-teams", async (req, res) => {
    try {
      const { images, leagueType, teamCount, matchId } = req.body;
      if (!GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

      const imageParts = images.map((img: any) => ({
        inlineData: { data: img.data.split(',')[1], mimeType: img.mimeType }
      }));

      const prompt = `Act as an ADVANCED fantasy cricket optimizer for ${teamCount} teams. Analysis for ${leagueType}. Match: ${matchId || "Unknown"}`;
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
      const { images, tossInfo, playingXI } = req.body;
      const prompt = `Toss: ${JSON.stringify(tossInfo)}. XI: ${playingXI.join(",")}. Generate optimized teams.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      res.json(JSON.parse(response.text || '{}'));
    } catch (error) {
      res.status(500).json({ error: "Regeneration failed" });
    }
  });

  app.get("/api/matches/:matchId", async (req, res) => {
    try {
      const response = await cricketApi.get(`/match/${req.params.matchId}`);
      res.json(response.data?.results || {});
    } catch (error) {
      res.status(500).json({ error: "Match details failed" });
    }
  });

  app.post("/api/players/stats", async (req, res) => {
    const { playerNames } = req.body;
    res.json({ stats: (playerNames || []).map((name: string) => ({ name, recentForm: 80, role: "All-rounder" })) });
  });

  app.get("/api/matches/:matchId/live", async (req, res) => {
    try {
      const response = await cricketApi.get(`/live-score/${req.params.matchId}`);
      res.json(response.data?.results || {});
    } catch (error) {
      res.status(500).json({ error: "Live update failed" });
    }
  });

  app.get("/api/matches", async (req, res) => {
    try {
      const response = await cricketApi.get("/matches-upcoming");
      res.json(response.data || { results: [] });
    } catch (error) {
      res.status(500).json({ error: "Matches list failed" });
    }
  });

  app.get("/api/cricket-data/matches", async (req, res) => {
    if (!CRICKETDATA_API_KEY) {
      return res.status(200).json({ 
        error: "CRICKETDATA_API_KEY not found in environment. Please add it to Vercel/Setup.", 
        live: [], completed: [], upcoming: [] 
      });
    }

    try {
      const response = await cricketDataApi.get("/currentMatches", {
        params: { apikey: CRICKETDATA_API_KEY, offset: 0 }
      });
      
      const matches = Array.isArray(response.data?.data) ? response.data.data : [];
      const formattedMatches = matches.map((m: any) => {
        const score = Array.isArray(m.score) ? m.score : [];
        const scoreA = score[0];
        const scoreB = score[1];
        const teams = Array.isArray(m.teams) ? m.teams : ["Team A", "Team B"];
        
        return {
          id: m.id || Math.random().toString(),
          team_a: teams[0] || "Team A",
          team_b: teams[1] || "Team B",
          score_a: scoreA ? `${scoreA.r}/${scoreA.w} (${scoreA.o} ov)` : "Yet to bat",
          score_b: scoreB ? `${scoreB.r}/${scoreB.w} (${scoreB.o} ov)` : "Yet to bat",
          overs: scoreB ? scoreB.o?.toString() : (scoreA ? scoreA.o?.toString() : "0.0"),
          league: m.series_id ? (m.series_id.length > 30 ? "Tournament" : m.series_id) : (m.matchType ? m.matchType.toUpperCase() : "Match"),
          status: m.status || "Scheduled",
          matchStarted: m.matchStarted,
          matchEnded: m.matchEnded,
          venue: m.venue || "Cricket Stadium",
          date: m.date || "TBD",
          crr: "N/A",
          last_updated: "Real-time",
          flag_a: "🏏",
          flag_b: "📡"
        };
      });

      res.json({ 
        live: formattedMatches.filter((m: any) => m.matchStarted && !m.matchEnded),
        completed: formattedMatches.filter((m: any) => m.matchEnded),
        upcoming: formattedMatches.filter((m: any) => !m.matchStarted)
      });
    } catch (error: any) {
      console.error("CricketData API Error:", error.message);
      res.status(500).json({ error: "API connection failed: " + error.message });
    }
  });

  // Existing RapidAPI live-match if needed
  app.get("/api/live-match", async (req, res) => {
    // ... logic for keeping old feature if requested ...
    res.json({ live: [], upcoming: [], recent: [] });
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
