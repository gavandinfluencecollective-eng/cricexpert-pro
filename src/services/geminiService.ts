import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const hasValidGeminiKey = GEMINI_API_KEY && GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && GEMINI_API_KEY.length > 10;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || "dummy_key" });

export interface Player {
  name: string;
  role: 'Batsman' | 'Bowler' | 'All-rounder' | 'Wicket-keeper';
  stats: string;
  isCaptainCandidate: boolean;
  isViceCaptainCandidate: boolean;
}

export interface FantasyTeam {
  id: number;
  players: string[];
  captain: string;
  viceCaptain: string;
  backupPlayers: string[];
  rationale: string;
  scenario?: string;
  riskLevel?: 'Low' | 'Medium' | 'High' | 'Extreme';
  mode?: string;
  differentials?: string[];
  tossRationale?: string;
}

export interface AnalysisResult {
  groundReport: string;
  playerEvaluations: string;
  keyMatchups: string;
  matchScenarioProbs: {
    highScoring: string;
    lowScoring: string;
    oneSided: string;
    bowlingDominant: string;
    allRounderImpact: string;
  };
  differentialPicks: { name: string; reason: string }[];
  fadeStrategy: { name: string; reason: string }[];
  captaincyMatrix: {
    safe: string[];
    risky: string[];
    ultraDifferential: string[];
  };
  teamBuildingBlueprint: string;
  tossImpactAnalysis?: string;
  scenarioBreakdown?: string;
  teams: FantasyTeam[];
}

function robustJSONParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    // Try to find JSON block if there's extra text
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const jsonStr = text.substring(start, end + 1);
        return JSON.parse(jsonStr);
      } catch (innerError) {
        throw new Error(`Failed to parse extracted JSON: ${innerError}`);
      }
    }
    throw e;
  }
}

export function sanitizeResult(result: any): any {
  if (!result || typeof result !== 'object') return result;

  // Sanitize AnalysisResult specific fields
  if (result.teams && Array.isArray(result.teams)) {
    result.teams = result.teams.map((team: any) => {
      // players & backupPlayers must be arrays of strings
      ['players', 'backupPlayers'].forEach(field => {
        if (team[field] && !Array.isArray(team[field]) && typeof team[field] === 'object') {
          team[field] = Object.keys(team[field]);
        }
        if (Array.isArray(team[field])) {
          team[field] = team[field].map((p: any) => 
            typeof p === 'object' ? (p.name || p.playerName || Object.keys(p)[0] || JSON.stringify(p)) : String(p)
          );
        }
      });

      // String fields
      ['captain', 'viceCaptain', 'rationale', 'scenario', 'riskLevel', 'mode', 'tossRationale'].forEach(field => {
        if (team[field] && typeof team[field] === 'object') {
          team[field] = team[field].name || team[field].playerName || Object.keys(team[field])[0] || JSON.stringify(team[field]);
        }
      });

      // differentials must be array of strings
      if (team.differentials && !Array.isArray(team.differentials) && typeof team.differentials === 'object') {
        team.differentials = Object.keys(team.differentials);
      }
      if (Array.isArray(team.differentials)) {
        team.differentials = team.differentials.map((p: any) => 
          typeof p === 'object' ? (p.name || p.playerName || Object.keys(p)[0] || JSON.stringify(p)) : String(p)
        );
      }

      return team;
    });
  }

  // captaincyMatrix
  if (result.captaincyMatrix && typeof result.captaincyMatrix === 'object') {
    Object.keys(result.captaincyMatrix).forEach(key => {
      let val = result.captaincyMatrix[key];
      if (val && !Array.isArray(val) && typeof val === 'object') {
        result.captaincyMatrix[key] = Object.keys(val);
      } else if (Array.isArray(val)) {
        result.captaincyMatrix[key] = val.map((p: any) => 
          typeof p === 'object' ? (p.name || p.playerName || Object.keys(p)[0] || JSON.stringify(p)) : String(p)
        );
      }
    });
  }

  // differentialPicks & fadeStrategy
  ['differentialPicks', 'fadeStrategy'].forEach(field => {
    if (result[field] && Array.isArray(result[field])) {
      result[field] = result[field].map((item: any) => {
        if (typeof item === 'object') {
          return {
            name: typeof item.name === 'object' ? JSON.stringify(item.name) : String(item.name || Object.keys(item)[0] || ''),
            reason: typeof item.reason === 'object' ? JSON.stringify(item.reason) : String(item.reason || '')
          };
        }
        return { name: String(item), reason: '' };
      });
    } else if (result[field] && typeof result[field] === 'object' && field !== 'matchScenarioProbs') {
      result[field] = Object.entries(result[field]).map(([name, reason]) => ({
        name,
        reason: typeof reason === 'object' ? JSON.stringify(reason) : String(reason)
      }));
    }
  });

  // matchScenarioProbs
  if (result.matchScenarioProbs && typeof result.matchScenarioProbs === 'object') {
    Object.keys(result.matchScenarioProbs).forEach(key => {
      if (typeof result.matchScenarioProbs[key] === 'object') {
        result.matchScenarioProbs[key] = JSON.stringify(result.matchScenarioProbs[key]);
      } else {
        result.matchScenarioProbs[key] = String(result.matchScenarioProbs[key]);
      }
    });
  }

  // Global string fields
  ['groundReport', 'playerEvaluations', 'keyMatchups', 'teamBuildingBlueprint', 'tossImpactAnalysis', 'scenarioBreakdown'].forEach(field => {
    if (result[field] && typeof result[field] === 'object') {
      result[field] = JSON.stringify(result[field]);
    }
  });

  return result;
}

export async function analyzeCricketData(
  images: { data: string; mimeType: string }[],
  leagueType: 'Grand' | 'Small' | 'Medium' | 'Advanced Grand',
  teamCount: number,
  matchId?: string
): Promise<AnalysisResult> {
  let liveContext = "";
  let apiStatus = "Image Analysis Only";

  if (matchId) {
    try {
      // Step 2 & 3: Fetch match data
      const matchRes = await fetch(`/api/matches/${matchId}`);
      const matchData = await matchRes.json();
      
      if (!matchData.failsafe) {
        apiStatus = "Real-Time Data Active";
        liveContext = `
          --- REAL-TIME MATCH DATA (AUTHENTICATED) ---
          Match ID: ${matchId}
          Venue: ${matchData.venue}
          Toss: ${matchData.toss}
          Status: ${matchData.match_status}
          Confirmed Playing 11: ${JSON.stringify(matchData.playing11)}
          Pitch Report: ${matchData.pitch_report}
          
          --- LIVE UPDATES ---
          ${JSON.stringify(matchData.liveUpdates || "Awaiting game start")}
        `;

        // Step 4: Get player stats for confirmed 11
        if (matchData.playing11?.length > 0) {
          const players = [...(matchData.playing11.map((p: any) => p.name || p))];
          const statsRes = await fetch('/api/players/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerNames: players })
          });
          const statsData = await statsRes.json();
          liveContext += `\n--- DETAILED PLAYER FORM & STATS ---\n${JSON.stringify(statsData.stats)}`;
        }
      } else {
        apiStatus = "LOW CONFIDENCE (API Failsafe Active)";
        liveContext = "\n--- WARNING: API FETCH FAILED. USING IMAGE DATA FALLBACK ---\n";
      }
    } catch (error) {
      console.error("Live data integration error:", error);
      apiStatus = "LOW CONFIDENCE (System Error)";
      liveContext = "\n--- WARNING: SYSTEM ERROR DURING LIVE FETCH. USING IMAGE DATA FALLBACK ---\n";
    }
  }

  const imageParts = images.map(img => ({
    inlineData: {
      data: img.data.split(',')[1], // Remove prefix
      mimeType: img.mimeType,
    },
  }));

  const prompt = `
    Act as an elite fantasy cricket strategist and probabilistic modeling engine.
    Analyze the ${images.length} uploaded images containing confirmed Playing 11, pitch reports, venue stats, toss result, and player stats (form, role, selection %, matchups).

    ${liveContext}

    CORE OBJECTIVE:
    Generate ${teamCount} optimized fantasy teams for the "${leagueType}" mode.
    Data Confidence: ${apiStatus}

    PLAYER SCORING MODEL (Internal Logic):
    Score = (Recent Form × 0.25) + (Role Importance × 0.20) + (Pitch Suitability × 0.15) + (Matchup Advantage × 0.15) + (Team Dependency × 0.10) + (Selection % Inverse × 0.15)
    - Lower selection % = higher differential score.
    - Death bowlers & top-order batsmen get role boost.
    - All-rounders get highest base multiplier.

    TEAM GENERATION RULES:
    1. Exactly 11 players per team.
    2. Dream11 Constraints: Max 7 players from one team.
    3. Role Balance: WK: 1–2, BAT: 3–5, AR: 2–3, BOWL: 3–4.
    4. MUST include players from BOTH teams.
    5. Prioritize "Confirmed Playing 11" from real-time data if provided.

    MODE LOGIC:
    ${leagueType === 'Small' ? `
    ✅ SMALL LEAGUE (SAFE):
    - 80% safe players (high selection %).
    - 20% semi-differential.
    - Stable C/VC (top order or all-rounder).
    - Low risk, high consistency.
    ` : ''}
    ${leagueType === 'Medium' ? `
    ✅ MEDIUM LEAGUE (BALANCED):
    - 60% core players, 40% variation.
    - Mix of safe + attacking C/VC.
    - 1–2 differential players per team.
    ` : ''}
    ${leagueType === 'Grand' ? `
    ✅ GRAND LEAGUE (HIGH VARIANCE):
    - Max 6–7 common players.
    - 3–4 differential players (<30% selection).
    - Aggressive C/VC rotation.
    - Scenario-based: batting collapse, high scoring, bowler dominance.
    ` : ''}
    ${leagueType === 'Advanced Grand' ? `
    ✅ ADVANCED GRAND LEAGUE (EXTREME STRATEGY):
    - Only 4–5 common players.
    - 5–7 high-risk differential players (low ownership <20%).
    - Focus on matchup exploitation and extreme scenarios (Top players fail, Underdog dominates, Unexpected hero).
    - NEVER repeat C/VC across these teams.
    - Unusual combinations (6-5 or 5-6 unusual splits).
    - Risk Level: ALWAYS "Extreme".
    ` : ''}

    CAPTAIN / VC STRATEGY:
    - Prefer All-rounders, Opening batsmen, Death bowlers.
    - In Advanced GL: NEVER repeat C/VC.
    - In other modes: Do NOT repeat same C/VC more than 2 times.

    BACKUP PLAYER LOGIC:
    - Assign 2–4 backups per team (NOT in the 11).
    - B1 = safest confirmed player, B2 = similar role alternative, B3/B4 = differential backup.

    OUTPUT FORMAT (JSON):
    Return exactly this structure:
    {
      "groundReport": "Tactical summary (Mention data source: ${apiStatus})",
      "playerEvaluations": "Form analysis",
      "keyMatchups": "Matchup data",
      "matchScenarioProbs": { "highScoring": "%", "lowScoring": "%", "oneSided": "%", "bowlingDominant": "%", "allRounderImpact": "%" },
      "differentialPicks": [{ "name": "Name", "reason": "Why" }],
      "fadeStrategy": [{ "name": "Name", "reason": "Why" }],
      "captaincyMatrix": { "safe": [], "risky": [], "ultraDifferential": [] },
      "teamBuildingBlueprint": "Summary",
      "teams": [
        {
          "id": 1,
          "players": ["P1",..."P11"],
          "captain": "Name",
          "viceCaptain": "Name",
          "backupPlayers": ["B1", "B2",...],
          "mode": "${leagueType}",
          "riskLevel": "Low/Medium/High/Extreme",
          "differentials": ["List of low-ownership players in this team"],
          "scenario": "Scenario type (e.g., batting pitch, collapse, chase)",
          "rationale": "Strategy logic"
        }
      ]
    }
  `;

  const response = await ai.models.generateContent({
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

  const text = response.text || '{}';
  const result = robustJSONParse(text);

  return sanitizeResult(result) as AnalysisResult;
}

export async function suggestReplacement(
  images: { data: string; mimeType: string }[],
  analysisResult: AnalysisResult,
  teamIndex: number,
  playerToReplace: string
): Promise<{ recommendations: { name: string; reason: string }[] }> {
  const imageParts = images.map(img => ({
    inlineData: {
      data: img.data.split(',')[1],
      mimeType: img.mimeType,
    },
  }));

  const team = analysisResult.teams[teamIndex];
  const context = `
    You are "AI Fantasy Pandit".
    Current Squad: ${JSON.stringify(team.players)}
    Ground: ${analysisResult.groundReport}
    Player Stats: ${analysisResult.playerEvaluations}
    
    Task: Suggest 3 suitable replacements for "${playerToReplace}" in this specific squad. 
    The replacements must be players who were mentioned in the stats images but are NOT already in the current squad.
    If the player to replace is the captain or vice-captain, also mention that the user will need to pick a new one.

    Output format (JSON only):
    {
      "recommendations": [
        { "name": "Player Name", "reason": "Why this player is a good fit for this squad/ground" }
      ]
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    config: {
      responseMimeType: "application/json",
    },
    contents: [
      {
        parts: [
          ...imageParts,
          { text: context }
        ]
      }
    ],
  });

  try {
    const result = robustJSONParse(response.text || '{"recommendations": []}');
    if (result.recommendations && Array.isArray(result.recommendations)) {
      result.recommendations = result.recommendations.map((rec: any) => {
        if (typeof rec === 'object') {
          return {
            name: typeof rec.name === 'object' ? JSON.stringify(rec.name) : String(rec.name || rec.playerName || Object.keys(rec)[0] || ''),
            reason: typeof rec.reason === 'object' ? JSON.stringify(rec.reason) : String(rec.reason || '')
          };
        }
        return { name: String(rec), reason: '' };
      });
    }
    return result;
  } catch (e) {
    console.error("Failed to parse replacement suggestions", e);
    return { recommendations: [] };
  }
}

export async function chatWithPandit(
  images: { data: string; mimeType: string }[],
  analysisResult: AnalysisResult,
  question: string,
  chatHistory: { role: 'user' | 'model'; text: string }[]
): Promise<{ text: string; teamUpdates?: { teamIndex: number; newPlayers: string[]; captain?: string; viceCaptain?: string }[] }> {
  const imageParts = images.map(img => ({
    inlineData: {
      data: img.data.split(',')[1],
      mimeType: img.mimeType,
    },
  }));

  const context = `
    You are "AI Fantasy Pandit", a legendary cricket analyst. 
    You have analyzed the data and generated fantasy teams.
    Current Teams: ${JSON.stringify(analysisResult.teams)}
    
    Findings:
    - Ground: ${analysisResult.groundReport}
    - Players: ${analysisResult.playerEvaluations}
    - Matchups: ${analysisResult.keyMatchups}

    STRICT RULES FOR UPDATES:
    1. Every team MUST have exactly 11 players.
    2. DREAM11 VALIDITY: Every team MUST have at least 1 Wicket-keeper and at least 1 All-rounder.
    3. TEAM DIVERSITY: You MUST include players from BOTH competing teams. No team can have 11 players from one side; aim for realistic splits like 7-4 or 6-5.
    4. MANDATORY C/VC: If you update a team, you MUST explicitly provide the 'captain' and 'viceCaptain' fields, and they MUST be from the new players list.
    5. Be bold and expert in your advice, like a true "Pandit".

    If the user asks to modify a specific team (e.g., "add X to team 1", "replace Y with Z in team 2"), you MUST provide the updated list of players for that team index.
    
    Response Format (JSON only):
    {
      "text": "Your conversational response explaining the change or answering the question.",
      "teamUpdates": [
        {
          "teamIndex": 0, // 0-based index of the team to update
          "newPlayers": ["Player 1", "Player 2", ...], // Full list of 11 players
          "captain": "Optional new captain name",
          "viceCaptain": "Optional new vice-captain name"
        }
      ] // optional, only if a change is requested
    }
  `;

  const previousChat = chatHistory.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }]
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    config: {
      responseMimeType: "application/json",
    },
    contents: [
      ...previousChat,
      {
        parts: [
          ...imageParts,
          { text: `${context}\n\nUser Question: ${question}` }
        ]
      }
    ],
  });

  try {
    const result = robustJSONParse(response.text || '{}');
    if (result.text && typeof result.text === 'object') {
      result.text = JSON.stringify(result.text);
    }
    if (result.teamUpdates && Array.isArray(result.teamUpdates)) {
      result.teamUpdates = result.teamUpdates.map((update: any) => {
        if (update.newPlayers && !Array.isArray(update.newPlayers) && typeof update.newPlayers === 'object') {
          update.newPlayers = Object.keys(update.newPlayers);
        }
        if (Array.isArray(update.newPlayers)) {
          update.newPlayers = update.newPlayers.map((p: any) => 
            typeof p === 'object' ? (p.name || p.playerName || Object.keys(p)[0] || JSON.stringify(p)) : String(p)
          );
        }
        ['captain', 'viceCaptain'].forEach(field => {
          if (update[field] && typeof update[field] === 'object') {
            update[field] = update[field].name || update[field].playerName || Object.keys(update[field])[0] || JSON.stringify(update[field]);
          }
        });
        return update;
      });
    }
    return result;
  } catch (e) {
    return { text: response.text || "I'm sorry, I couldn't process that." };
  }
}
