/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Users, 
  Upload, 
  X, 
  Loader2, 
  ChevronRight, 
  BarChart3, 
  AlertCircle,
  Zap,
  ShieldCheck,
  Target,
  Share2,
  CheckCheck,
  History,
  Trash2,
  Calendar,
  MessageSquare,
  Send,
  RefreshCcw,
  Plus,
  Menu,
  Settings,
  User,
  Power,
  Activity
} from 'lucide-react';
import { analyzeCricketData, chatWithPandit, suggestReplacement, AnalysisResult, FantasyTeam, sanitizeResult } from './services/geminiService';
import { cn } from './lib/utils';
import LiveScoresDashboard from './components/LiveScoresDashboard';

interface HistoryItem {
  id: string;
  timestamp: number;
  leagueType: 'Grand' | 'Small' | 'Medium' | 'Advanced Grand';
  teamCount: number;
  result: AnalysisResult;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export default function App() {
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [leagueType, setLeagueType] = useState<'Grand' | 'Small' | 'Medium' | 'Advanced Grand'>('Small');
  const [teamCount, setTeamCount] = useState(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [shareAllCopied, setShareAllCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [matchId, setMatchId] = useState<string | undefined>();
  const [matchData, setMatchData] = useState<{ live: any[]; upcoming: any[]; recent: any[] }>({ live: [], upcoming: [], recent: [] });
  const [matchInsights, setMatchInsights] = useState<any>(null);
  const [matchNews, setMatchNews] = useState<any[]>([]);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);
  const [isNewsLoading, setIsNewsLoading] = useState(false);
  const [isMatchesLoading, setIsMatchesLoading] = useState(false);
  const [optimizerEnabled, setOptimizerEnabled] = useState(() => {
    const saved = localStorage.getItem('cricexpert_optimizer_enabled');
    return saved === 'true';
  });
  const [showDrawer, setShowDrawer] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [appView, setAppView] = useState<'optimizer' | 'live-scores'>('optimizer');
  const [afterTossMode, setAfterTossMode] = useState(false);
  const [playingXIText, setPlayingXIText] = useState('');
  const [impactPlayersText, setImpactPlayersText] = useState('');
  const [isAfterTossLoading, setIsAfterTossLoading] = useState(false);
  const [advancedTossSettings, setAdvancedTossSettings] = useState({
    includeImpact: true,
    boostDifferential: true,
    randomCaptain: true,
    teamCount: 40
  });

  useEffect(() => {
    localStorage.setItem('cricexpert_optimizer_enabled', String(optimizerEnabled));
  }, [optimizerEnabled]);

  const handleAfterTossOptimize = async () => {
    if (images.length === 0 && !playingXIText.trim()) {
      setError("Please provide Playing XI text or upload images.");
      return;
    }
    setIsAfterTossLoading(true);
    setError(null);
    try {
      const base64Images = await Promise.all(
        images.map(async img => ({
          data: await fileToBase64(img.file),
          mimeType: img.file.type
        }))
      );

      const res = await fetch('/api/after-toss-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playingXIText,
          impactPlayersText,
          images: base64Images,
          matchId,
          leagueType,
          teamCount: advancedTossSettings.teamCount,
          settings: advancedTossSettings
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Optimization failed");

      if (data.teams) {
        setResult(data);
        saveToHistory(data);
        setAppView('optimizer'); // Switch view if needed
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("GEMINI_API_KEY_INVALID") || err.message?.includes("API key not valid")) {
        setError("CRITICAL: Your Gemini API key is invalid or missing. Please go to AI Studio Settings -> Secrets and add GEMINI_API_KEY.");
      } else {
        setError(err.message || "Failed to execute After Toss Mode.");
      }
    } finally {
      setIsAfterTossLoading(false);
    }
  };

  const handleRegenerateAfterToss = async () => {
    if (images.length === 0) return;
    setIsRegenerating(true);
    setError(null);

    try {
      const base64Images = await Promise.all(
        images.map(img => new Promise<{data: string, mimeType: string}>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({ data: reader.result as string, mimeType: img.file.type });
          reader.readAsDataURL(img.file);
        }))
      );

      const res = await fetch('/api/regenerate-toss-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: base64Images.map(img => ({ data: img.data, mimeType: img.mimeType })),
          leagueType,
          teamCount,
          matchId,
          tossInfo: null, // Let server fetch if matchId exists
          playingXI: null // Let server fetch if matchId exists
        })
      });

      const analysis = await res.json();
      if (!res.ok) throw new Error(analysis.error || "Regeneration failed");

      if (analysis.teams) {
        setResult(analysis);
        // Save to history
        const newHistoryItem: HistoryItem = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          leagueType: leagueType,
          teamCount: teamCount,
          result: analysis
        };
        setHistory(prev => [newHistoryItem, ...prev].slice(0, 5));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to regenerate post-toss teams. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    const savedHistory = localStorage.getItem('cricexpert_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  const saveToHistory = (newResult: AnalysisResult) => {
    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      leagueType,
      teamCount,
      result: newResult
    };
    const updatedHistory = [newItem, ...history].slice(0, 50); // Keep last 50 items
    setHistory(updatedHistory);
    localStorage.setItem('cricexpert_history', JSON.stringify(updatedHistory));
  };

  const deleteHistoryItem = (id: string) => {
    const updatedHistory = history.filter(item => item.id !== id);
    setHistory(updatedHistory);
    localStorage.setItem('cricexpert_history', JSON.stringify(updatedHistory));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('cricexpert_history');
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.slice(0, 20 - images.length).map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setImages(prev => [...prev, ...newImages]);
  }, [images]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] as string[] },
    maxFiles: 20,
    multiple: true
  } as any);

  const removeImage = (index: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleAnalyze = async () => {
    if (images.length === 0) {
      setError("Please upload at least one image with stats or playing 11.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setActiveGroupIndex(0); // Reset group index on new analysis
    setChatMessages([]); // Reset chat for new report
    try {
      const base64Images = await Promise.all(
        images.map(async img => ({
          data: await fileToBase64(img.file),
          mimeType: img.file.type
        }))
      );

      let analysis: AnalysisResult;
      
      // Use advanced optimizer if enabled and league is Advanced Grand
      if (optimizerEnabled && leagueType === 'Advanced Grand') {
        try {
          const res = await fetch('/api/generate-advanced-gl-teams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              images: base64Images.map(img => ({ data: img.data, mimeType: img.mimeType })),
              leagueType,
              teamCount,
              matchId,
              optimizerEnabled: true
            })
          });
          
          if (!res.ok) throw new Error("Optimizer failed");
          analysis = await res.json();
        } catch (optimizeErr) {
          console.warn("Advanced optimizer failed, falling back to standard logic", optimizeErr);
          // Auto fallback with notification would be nice, but for now we just run standard logic
          analysis = await analyzeCricketData(base64Images, leagueType, teamCount, matchId);
          // Show fallback message
          setError("Switched to Standard Mode (AI Optimizer was unavailable)");
          setTimeout(() => setError(null), 5000);
        }
      } else {
        analysis = await analyzeCricketData(base64Images, leagueType, teamCount, matchId);
      }
      
      // Safety check for initial teams
      if (analysis.teams) {
        analysis.teams = analysis.teams.map(team => {
          let players = team.players || [];
          let captain = team.captain;
          let viceCaptain = team.viceCaptain;

          if (players.length > 0) {
            if (!players.includes(captain)) captain = players[0];
            if (!players.includes(viceCaptain)) {
              viceCaptain = players[1] === captain ? players[2] || players[1] : players[1];
            }
          }
          
          return { ...team, captain, viceCaptain };
        });
      }

      setResult(analysis);
      saveToHistory(analysis);

      // Save to Cloud if available
      try {
        const { saveAnalysis } = await import('./services/dbService');
        await saveAnalysis('anon-user', leagueType, teamCount, matchId, analysis);
      } catch (dbErr) {
        console.warn("Cloud save skipped - Database not ready");
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("GEMINI_API_KEY_INVALID") || err.message?.includes("API key not valid")) {
        setError("CRITICAL: Gemini API key error. Check your Secrets panel.");
      } else {
        setError(err.message || "Failed to analyze data. Please try again with clear images.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleShareAll = () => {
    if (!result) return;
    
    let allTeamsText = `🏆 CricExpert Pro - Full Optimization Report 🏆\nLeague: ${leagueType}\nTotal Teams: ${result.teams.length}\n\n`;
    
    result.teams.forEach((team, idx) => {
      allTeamsText += `--- SQUAD ${idx + 1} (${team.mode || leagueType} - ${team.riskLevel}) ---\n`;
      allTeamsText += `Scenario: ${team.scenario || 'N/A'}\n`;
      allTeamsText += `Players: ${team.players.join(', ')}\n`;
      allTeamsText += `Differentials: ${team.differentials?.join(', ') || 'None'}\n`;
      allTeamsText += `Backups: ${team.backupPlayers?.join(', ') || 'None'}\n`;
      allTeamsText += `Captain: ${team.captain}\n`;
      allTeamsText += `Vice-Captain: ${team.viceCaptain}\n`;
      allTeamsText += `Strategy: ${team.rationale}\n\n`;
    });
    
    navigator.clipboard.writeText(allTeamsText);
    setShareAllCopied(true);
    setTimeout(() => setShareAllCopied(false), 2000);
  };

  const teamGroups = result ? Array.from({ length: Math.ceil(result.teams.length / 10) }, (_, i) =>
    result.teams.slice(i * 10, i * 10 + 10)
  ) : [];

  const handleAskPandit = async () => {
    if (!currentQuestion.trim() || !result || isChatLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: currentQuestion };
    setChatMessages(prev => [...prev, userMessage]);
    setCurrentQuestion('');
    setIsChatLoading(true);

    try {
      const base64Images = await Promise.all(
        images.map(async img => ({
          data: await fileToBase64(img.file),
          mimeType: img.file.type
        }))
      );

      const response = await chatWithPandit(base64Images, result, userMessage.text, chatMessages);
      
      if (response.teamUpdates && response.teamUpdates.length > 0) {
        const updatedTeams = [...result.teams];
        response.teamUpdates.forEach(update => {
          if (updatedTeams[update.teamIndex]) {
            const newPlayers = update.newPlayers;
            let captain = update.captain || updatedTeams[update.teamIndex].captain;
            let viceCaptain = update.viceCaptain || updatedTeams[update.teamIndex].viceCaptain;

            // Safety check: Ensure C and VC are in the newPlayers list
            if (!newPlayers.includes(captain)) {
              captain = newPlayers[0]; // Fallback to first player
            }
            if (!newPlayers.includes(viceCaptain)) {
              // Ensure VC is different from Captain
              viceCaptain = newPlayers[1] === captain ? newPlayers[2] || newPlayers[1] : newPlayers[1];
            }

            updatedTeams[update.teamIndex] = {
              ...updatedTeams[update.teamIndex],
              players: newPlayers,
              captain: captain,
              viceCaptain: viceCaptain
            };
          }
        });
        setResult({ ...result, teams: updatedTeams });
      }

      const modelMessage: ChatMessage = { role: 'model', text: response.text };
      setChatMessages(prev => [...prev, modelMessage]);
    } catch (err: any) {
      console.error(err);
      const errorMessage: ChatMessage = { role: 'model', text: "I'm having trouble connecting to my cricket wisdom. Please try again." };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleSwapPlayer = (teamIndex: number, playerToReplace: string, newPlayer: string) => {
    if (!result) return;
    const updatedTeams = [...result.teams];
    const team = updatedTeams[teamIndex];
    if (team) {
      const updatedPlayers = team.players.map(p => p === playerToReplace ? newPlayer : p);
      let newCaptain = team.captain === playerToReplace ? newPlayer : team.captain;
      let newViceCaptain = team.viceCaptain === playerToReplace ? newPlayer : team.viceCaptain;
      
      updatedTeams[teamIndex] = {
        ...team,
        players: updatedPlayers,
        captain: newCaptain,
        viceCaptain: newViceCaptain
      };
      setResult({ ...result, teams: updatedTeams });
    }
  };

  const fetchMatches = async () => {
    setIsMatchesLoading(true);
    setMatchError(null);
    try {
      const res = await fetch('/api/live-match');
      const data = await res.json();
      
      if (data?.error) {
        setMatchError(data.error);
        if (!matchData?.live?.length && !matchData?.upcoming?.length && !matchData?.recent?.length) {
          setMatchData({ live: [], upcoming: [], recent: [] });
        }
      } else if (data) {
        setMatchData({
          live: data?.live || [],
          upcoming: data?.upcoming || [],
          recent: data?.recent || []
        });

        const firstLive = (data?.live || [])[0];
        const firstUpcoming = (data?.upcoming || [])[0];
        const firstRecent = (data?.recent || [])[0];

        if (!matchId) {
          if (firstLive?.id) handleMatchSelect(firstLive.id);
          else if (firstUpcoming?.id) handleMatchSelect(firstUpcoming.id);
          else if (firstRecent?.id) handleMatchSelect(firstRecent.id);
        }
      }
    } catch (e) {
      console.error("Match fetch error", e);
      setMatchError("Network error syncing matches.");
    } finally {
      setIsMatchesLoading(false);
    }
  };

  const handleMatchSelect = async (id: string) => {
    setMatchId(id);
    setIsInsightsLoading(true);
    setIsNewsLoading(true);
    setMatchNews([]);
    
    // Parallel fetch for speed
    try {
      const [insightRes, newsRes] = await Promise.all([
        fetch(`/api/matches/${id}/insights`),
        fetch(`/api/matches/${id}/news`)
      ]);
      
      const insightData = await insightRes.json();
      const newsData = await newsRes.json();
      
      if (insightData && !insightData.error) {
        setMatchInsights(insightData);
      }
      
      if (newsData && !newsData.error) {
        setMatchNews(newsData.news || []);
      }
    } catch (e) {
      console.warn("Insights/News fetch failed", e);
    } finally {
      setIsInsightsLoading(false);
      setIsNewsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500 selection:text-black">
      {/* Drawer Overlay */}
      <AnimatePresence>
        {showDrawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDrawer(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-80 bg-[#0f0f0f] border-r border-white/10 z-[101] shadow-2xl p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-black" />
                  </div>
                  <h1 className="font-bold text-xl tracking-tight uppercase">CricExpert</h1>
                </div>
                <button onClick={() => setShowDrawer(false)} className="p-2 hover:bg-white/5 rounded-full">
                  <X className="w-6 h-6 text-white/50" />
                </button>
              </div>

              <div className="flex-1 space-y-8">
                <nav className="space-y-4">
                  <button 
                    onClick={() => { setAppView('optimizer'); setShowDrawer(false); }}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
                      appView === 'optimizer' ? "bg-emerald-500 border-emerald-400 text-black" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    )}
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform", appView === 'optimizer' ? "bg-black/10" : "bg-emerald-500/10")}>
                      <Zap className={cn("w-5 h-5", appView === 'optimizer' ? "text-black" : "text-emerald-500")} />
                    </div>
                    <div>
                      <p className={cn("text-sm font-bold", appView === 'optimizer' ? "text-black" : "text-white")}>AI Optimizer</p>
                      <p className={cn("text-[10px] uppercase tracking-widest", appView === 'optimizer' ? "text-black/40" : "text-white/30")}>Fantasy Strategy</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setAppView('live-scores'); setShowDrawer(false); }}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
                      appView === 'live-scores' ? "bg-brand border-brand/40 text-black" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
                    )}
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform", appView === 'live-scores' ? "bg-black/10" : "bg-brand/10")}>
                      <Activity className={cn("w-5 h-5", appView === 'live-scores' ? "text-black" : "text-brand")} />
                    </div>
                    <div>
                      <p className={cn("text-sm font-bold", appView === 'live-scores' ? "text-black" : "text-white")}>Live Scores</p>
                      <p className={cn("text-[10px] uppercase tracking-widest", appView === 'live-scores' ? "text-black/40" : "text-white/30")}>Network Center</p>
                    </div>
                  </button>

                  <div className="h-px bg-white/5 my-6" />

                  <button className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors text-left group">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <User className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Profile</p>
                      <p className="text-[10px] text-white/30 uppercase tracking-widest">Account Details</p>
                    </div>
                  </button>
                  <button className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors text-left group">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Settings className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Settings</p>
                      <p className="text-[10px] text-white/30 uppercase tracking-widest">App Configuration</p>
                    </div>
                  </button>
                </nav>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] px-2">Advanced Features</h3>
                  
                  {result && (
                    <div className="p-4 rounded-3xl bg-amber-500/5 border border-amber-500/10 space-y-4 mb-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-xs font-bold text-white flex items-center gap-2">
                             After Toss Mode
                          </label>
                          <p className="text-[9px] text-white/30 uppercase tracking-widest">Real-Time Extraction</p>
                        </div>
                        <button 
                          onClick={() => setAfterTossMode(!afterTossMode)}
                          className={cn(
                            "relative w-12 h-6 rounded-full transition-colors",
                            afterTossMode ? "bg-amber-500" : "bg-white/10"
                          )}
                        >
                          <motion.div 
                            animate={{ x: afterTossMode ? 24 : 4 }}
                            className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-lg"
                          />
                        </button>
                      </div>
                      <p className="text-[10px] text-amber-500/60 leading-relaxed font-bold bg-amber-500/10 p-3 rounded-xl border border-amber-500/10 italic">
                        "Enable strictly after the toss. Paste playing XI or upload team sheets to instantly generate 40 optimized teams."
                      </p>
                    </div>
                  )}

                  <div className="p-4 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-xs font-bold text-white flex items-center gap-2">
                          Auto GL Optimizer 
                        </label>
                        <p className="text-[9px] text-white/30 uppercase tracking-widest">Advanced GL Only</p>
                      </div>
                      <button 
                        onClick={() => setOptimizerEnabled(!optimizerEnabled)}
                        className={cn(
                          "relative w-12 h-6 rounded-full transition-colors",
                          optimizerEnabled ? "bg-emerald-500" : "bg-white/10"
                        )}
                      >
                        <motion.div 
                          animate={{ x: optimizerEnabled ? 24 : 4 }}
                          className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow-lg"
                        />
                      </button>
                    </div>
                    <p className="text-[10px] text-emerald-500/60 leading-relaxed font-medium bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/10 italic">
                      "Advanced GL Optimizer increases chances in Grand League by simulating extreme match outcomes using historical H2H and Venue statistics."
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10 text-center">
                <p className="text-[10px] text-white/20 uppercase tracking-[0.3em] font-black">CricExpert Pro v2.0</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Visual background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-emerald-500 rounded-full blur-[150px]" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[150px]" />
      </div>

      {/* Live Ticker for Professional Feel */}
      <div className="bg-emerald-500/10 border-b border-emerald-500/20 py-2 overflow-hidden h-10 flex items-center relative z-20">
        <div className="flex whitespace-nowrap animate-marquee items-center gap-8 px-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">System Live</span>
          </div>
          {matchData?.live?.length > 0 ? (
            matchData.live.map((m: any) => (
              <span key={m.id} className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
                {m.team_a} vs {m.team_b}: <span className="text-white">{m.score || "Live Feed Active"}</span>
              </span>
            ))
          ) : (
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              Live Match Sync Active • Waiting for Next Fixture • Ready for Manual Analysis
            </span>
          )}
          {/* Duplicate for seamless loop if needed, for now just simple */}
        </div>
      </div>

      <header className="relative z-10 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowDrawer(true)}
              className="p-2 -ml-2 hover:bg-white/5 rounded-full transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div 
              onClick={() => setAppView('optimizer')}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center group-hover:scale-110 transition-transform">
                <Trophy className="w-5 h-5 text-black" />
              </div>
              <h1 className="font-bold text-xl tracking-tight uppercase">CricExpert <span className="text-emerald-500 underline decoration-2 underline-offset-4">Pro</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 mr-4">
              <button 
                onClick={() => setAppView('optimizer')}
                className={cn(
                  "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                  appView === 'optimizer' ? "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20" : "text-white/30 hover:text-white"
                )}
              >
                AI Optimizer
              </button>
              <button 
                onClick={() => setAppView('live-scores')}
                className={cn(
                  "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                  appView === 'live-scores' ? "text-brand bg-brand/10 border border-brand/20" : "text-white/30 hover:text-white"
                )}
              >
                Live Scores
              </button>
            </div>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                showHistory 
                  ? "bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20" 
                  : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20"
              )}
            >
              <History className="w-4 h-4" />
              History {history.length > 0 && `(${history.length})`}
            </button>
            <div className="hidden sm:flex items-center gap-4 text-xs font-medium text-white/30 uppercase tracking-[0.2em]">
              <span>Live Analysis</span>
              <div className="w-1 h-1 bg-white/20 rounded-full" />
              <span>AI Powered</span>
              <div className="w-1 h-1 bg-white/20 rounded-full" />
              <span>Expert Mode</span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 py-8 md:py-16">
        {appView === 'live-scores' ? (
          <LiveScoresDashboard />
        ) : (
          <AnimatePresence mode="wait">
            {afterTossMode && result && (
              <motion.div 
                key="after-toss"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="p-8 rounded-[3.5rem] bg-[#0a0a0a] border-4 border-cyan-500/30 shadow-[0_0_100px_rgba(6,182,212,0.15)] space-y-8 relative overflow-hidden mb-12"
              >
                {/* Neon Accents */}
                <div className="absolute -top-24 -left-24 w-64 h-64 bg-cyan-500/10 blur-[100px] rounded-full" />
                <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full" />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-emerald-500 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.4)]">
                      <Zap className="w-8 h-8 text-black" />
                    </div>
                    <div>
                      <h3 className="text-3xl font-black uppercase italic tracking-tighter text-white">After Toss Team Builder</h3>
                      <p className="text-[11px] font-black text-cyan-400 uppercase tracking-[0.3em]">Precision GL Optimization</p>
                    </div>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/5">
                    {(['Small', 'Medium', 'Grand', 'Advanced Grand'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setLeagueType(type)}
                        className={cn(
                          "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          leagueType === type 
                            ? "bg-cyan-500 text-black shadow-lg shadow-cyan-500/20" 
                            : "text-white/40 hover:text-white/60"
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                  {/* Inputs Column */}
                  <div className="space-y-6">
                    {/* Visual Image Upload for After Toss */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <label className="text-[11px] font-black text-cyan-400/60 uppercase tracking-[0.3em] flex items-center gap-2">
                           Multi-Modal Analysis (Images)
                        </label>
                        {images.length > 0 && (
                          <button 
                            onClick={() => setImages([])}
                            className="text-[9px] font-black text-red-400/60 uppercase hover:text-red-400 transition-colors"
                          >
                            Clear All
                          </button>
                        )}
                      </div>
                      <div 
                        {...getRootProps()} 
                        className={cn(
                          "border-2 border-dashed rounded-[2.5rem] p-10 transition-all flex flex-col items-center justify-center gap-4 cursor-pointer group/upload",
                          isDragActive ? "border-cyan-500 bg-cyan-500/5" : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
                        )}
                      >
                        <input {...getInputProps()} />
                        <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center group-hover/upload:scale-110 transition-transform">
                          <Upload className="w-6 h-6 text-cyan-400" />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="font-bold text-sm">Upload Team Sheet</p>
                          <p className="text-[10px] text-white/20 font-black tracking-widest uppercase italic">AI will extract squads automatically</p>
                        </div>
                      </div>
                      
                      {images.length > 0 && (
                        <div className="grid grid-cols-5 gap-3">
                          {images.map((img, idx) => (
                            <motion.div 
                              key={img.preview}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="relative aspect-square rounded-2xl overflow-hidden border border-white/5 group shadow-lg"
                            >
                              <img src={img.preview} alt="" className="w-full h-full object-cover" />
                              <button 
                                onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                              >
                                <X className="w-4 h-4 text-red-500" />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-cyan-400/60 uppercase tracking-[0.3em] px-1 flex items-center gap-2">
                         Playing XI Confirmed (Text)
                         <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                      </label>
                      <textarea
                        placeholder="Paste confirmed Playing XI (Team 1 & Team 2)..."
                        value={playingXIText}
                        onChange={(e) => setPlayingXIText(e.target.value)}
                        className="w-full h-44 bg-black/60 border-2 border-white/5 rounded-3xl p-6 text-sm font-medium focus:outline-none focus:border-cyan-500/40 transition-all resize-none placeholder:text-white/10 text-cyan-50/90"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-white/30 uppercase tracking-[0.3em] px-1">
                         Impact Players (Optional)
                      </label>
                      <textarea
                        placeholder="Paste 2–4 possible Impact Players..."
                        value={impactPlayersText}
                        onChange={(e) => setImpactPlayersText(e.target.value)}
                        className="w-full h-28 bg-black/40 border-2 border-white/5 rounded-3xl p-6 text-sm font-medium focus:outline-none focus:border-white/10 transition-all resize-none placeholder:text-white/10"
                      />
                    </div>
                  </div>

                  {/* Settings Column */}
                  <div className="space-y-8 bg-white/[0.02] p-8 rounded-[2.5rem] border border-white/5">
                    <div className="space-y-6">
                      <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <Settings className="w-3.5 h-3.5" /> Advanced GL Settings
                      </h4>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">Number of Teams</span>
                          <span className="text-xl font-black italic text-cyan-400">{advancedTossSettings.teamCount}</span>
                        </div>
                        <input 
                          type="range"
                          min="10"
                          max="100"
                          step="5"
                          value={advancedTossSettings.teamCount}
                          onChange={(e) => setAdvancedTossSettings({...advancedTossSettings, teamCount: parseInt(e.target.value)})}
                          className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500"
                        />
                        <div className="flex justify-between text-[9px] font-bold text-white/20 uppercase tracking-widest px-1">
                          <span>10</span>
                          <span>100</span>
                        </div>
                      </div>

                      <div className="space-y-4 pt-4">
                        {[
                          { key: 'includeImpact', label: 'Include Impact Players', desc: 'Used in 30-40% of squads' },
                          { key: 'boostDifferential', label: 'Boost Differentials', desc: '15% selection probability hike' },
                          { key: 'randomCaptain', label: 'Random Captain Variation', desc: 'High entropy in C/VC rotation' }
                        ].map((opt) => (
                          <div key={opt.key} className="flex items-center justify-between group cursor-pointer" onClick={() => setAdvancedTossSettings({...advancedTossSettings, [opt.key]: !advancedTossSettings[opt.key as keyof typeof advancedTossSettings]})}>
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-white/80 group-hover:text-white transition-colors">{opt.label}</p>
                              <p className="text-[9px] text-white/20 uppercase font-black tracking-widest">{opt.desc}</p>
                            </div>
                            <div className={cn(
                              "w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center",
                              advancedTossSettings[opt.key as keyof typeof advancedTossSettings] 
                                ? "bg-cyan-500 border-cyan-500" 
                                : "border-white/10 bg-transparent"
                            )}>
                              {advancedTossSettings[opt.key as keyof typeof advancedTossSettings] && <CheckCheck className="w-3.5 h-3.5 text-black" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={handleAfterTossOptimize}
                      disabled={isAfterTossLoading || (!playingXIText.trim() && images.length === 0)}
                      className={cn(
                        "w-full h-16 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all flex items-center justify-center gap-4 group mt-4",
                        isAfterTossLoading 
                          ? "bg-white/10 text-white/30 cursor-not-allowed" 
                          : "bg-white text-black hover:bg-cyan-500 shadow-2xl shadow-cyan-500/20 active:scale-95"
                      )}
                    >
                      {isAfterTossLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Generating {advancedTossSettings.teamCount} Teams...
                        </>
                      ) : (
                        <>
                          <Activity className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                          Generate GL Teams
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {showHistory ? (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-3xl font-black italic tracking-tighter uppercase">Optimization History</h2>
                  <p className="text-white/40 text-sm font-medium uppercase tracking-[0.2em]">Recap your previous winning strategies</p>
                </div>
                <div className="flex gap-4">
                   {history.length > 0 && (
                    <button 
                      onClick={clearHistory}
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-all flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Clear All
                    </button>
                   )}
                   <button 
                    onClick={() => setShowHistory(false)}
                    className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-black hover:bg-emerald-500 transition-all"
                  >
                    Back to Generator
                  </button>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-[3rem] py-24 flex flex-col items-center justify-center gap-6 text-center">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                    <History className="w-10 h-10 text-white/20" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-bold">No history available</p>
                    <p className="text-white/40 text-sm max-w-xs">Your optimized squads will appear here after your first analysis.</p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6">
                  {history.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 group hover:border-emerald-500/30 transition-all"
                    >
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0">
                          <Trophy className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="text-emerald-500 font-black text-sm uppercase tracking-widest">{item.leagueType} League</span>
                            <span className="w-1 h-1 bg-white/20 rounded-full" />
                            <span className="text-white/40 font-mono text-[10px] flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-lg font-bold tracking-tight">{item.teamCount} Optimizations Developed</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <button 
                          onClick={() => {
                            // Defensive sanitization of historical data
                            setResult(sanitizeResult(item.result));
                            setLeagueType(item.leagueType);
                            setTeamCount(item.teamCount);
                            setShowHistory(false);
                            setChatMessages([]);
                          }}
                          className="px-6 py-3 rounded-2xl bg-white text-black font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all flex items-center gap-2"
                        >
                          View Report <ChevronRight className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteHistoryItem(item.id)}
                          className="w-12 h-12 rounded-2xl bg-white/5 text-white/20 hover:text-red-500 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 transition-all flex items-center justify-center"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : !result ? (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="grid lg:grid-cols-2 gap-12 items-start"
            >
              <div className="space-y-10">
                <div className="space-y-4">
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold tracking-widest uppercase"
                  >
                    <Zap className={cn("w-3 h-3", optimizerEnabled && leagueType === 'Advanced Grand' && "animate-pulse")} /> 
                    {optimizerEnabled && leagueType === 'Advanced Grand' ? "🔥 AI GL Optimizer Active" : "Professional Cricket Analyst"}
                  </motion.div>
                  <h2 className="text-6xl md:text-7xl font-display font-black tracking-tighter leading-[0.9] uppercase">
                    Master the <br/> 
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">Numbers.</span>
                  </h2>
                  <p className="text-white/40 text-lg leading-relaxed max-w-lg font-medium">
                    Professional-grade fantasy analytics. Advanced AI optimization for the elite 1%.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-3xl p-8 space-y-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Trophy className="w-32 h-32" />
                  </div>

                  <div className="space-y-6 relative z-10">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(['Advanced Grand', 'Grand', 'Medium', 'Small'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setLeagueType(type)}
                          className={cn(
                            "py-4 px-2 rounded-2xl border transition-all flex flex-col items-center gap-3",
                            leagueType === type 
                              ? "bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20" 
                              : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20"
                          )}
                        >
                          {type === 'Advanced Grand' && <Zap className="w-5 h-5 animate-pulse" />}
                          {type === 'Grand' && <Zap className="w-5 h-5" />}
                          {type === 'Medium' && <Target className="w-5 h-5" />}
                          {type === 'Small' && <ShieldCheck className="w-5 h-5" />}
                          <span className="font-black uppercase text-[9px] tracking-widest text-center">{type === 'Advanced Grand' ? 'Adv. Grand' : `${type} League`}</span>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Zap className="w-3 h-3 text-emerald-500" />
                          Match Navigator
                        </label>
                        <button 
                          onClick={fetchMatches}
                          className="text-[8px] font-bold text-emerald-500/50 hover:text-emerald-500 uppercase tracking-widest transition-colors flex items-center gap-1"
                        >
                          <RefreshCcw className={cn("w-2.5 h-2.5", isMatchesLoading && "animate-spin")} /> Update
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-2 px-2 scroll-smooth">
                          <button
                            onClick={() => { setMatchId(undefined); setMatchInsights(null); }}
                            className={cn(
                              "shrink-0 px-5 py-4 rounded-2xl border transition-all text-left min-w-[140px] glass-card",
                              !matchId 
                                ? "bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20" 
                                : "text-white/50 hover:bg-white/10"
                            )}
                          >
                            <p className="text-[9px] font-black uppercase tracking-widest mb-1 opacity-60">Manual</p>
                            <p className="text-xs font-bold leading-tight">Image Only</p>
                          </button>
                          
                          {/* Live & Upcoming Cards */}
                          {[...(matchData?.live || []), ...(matchData?.upcoming || [])].map((m: any) => {
                            const isLive = matchData?.live?.some(lm => lm.id === m.id);
                            const isSelected = matchId === m.id;
                            
                            return (
                              <button
                                key={m.id}
                                onClick={() => handleMatchSelect(m.id)}
                                className={cn(
                                  "shrink-0 px-5 py-4 rounded-2xl border transition-all text-left min-w-[220px] relative overflow-hidden group glass-card",
                                  isSelected
                                    ? "bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20" 
                                    : "text-white/70 hover:bg-white/10"
                                )}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <span className={cn(
                                    "status-badge",
                                    isSelected 
                                      ? "bg-black/20 text-black" 
                                      : isLive ? "bg-red-500/20 text-red-500 animate-pulse" : "bg-blue-500/20 text-blue-500"
                                  )}>
                                    {isLive ? "Live" : "Soon"}
                                  </span>
                                  <span className="text-[9px] font-mono opacity-50 uppercase tracking-tighter">
                                    {m.title?.slice(0, 18)}
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs font-black uppercase tracking-tight leading-tight">{m.team_a} vs {m.team_b}</p>
                                  {m.score && <p className={cn("text-[10px] font-bold font-mono", isSelected ? "text-black/60" : "text-emerald-500")}>{m.score}</p>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Insights Panel */}
                    <AnimatePresence>
                      {matchId && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-5 rounded-[2rem] bg-white/[0.03] border border-white/10 space-y-4">
                            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                              <h4 className="text-[10px] font-black uppercase text-emerald-500 tracking-[0.2em] flex items-center gap-2">
                                <History className="w-3.5 h-3.5" /> Historical Insights
                              </h4>
                              {isInsightsLoading && <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />}
                            </div>

                            {matchInsights ? (
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                  <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-2">H2H Performance</p>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold">
                                      <span>Team A Won</span>
                                      <span className="text-emerald-500">{matchInsights.h2h?.team1_win || "N/A"}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold">
                                      <span>Team B Won</span>
                                      <span className="text-emerald-500">{matchInsights.h2h?.team2_win || "N/A"}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                  <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-2">Venue Bias</p>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] font-bold">
                                      <span>Avg 1st Innings</span>
                                      <span className="text-blue-400">{matchInsights.venue?.avg_1st_innings || "N/A"}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold">
                                      <span>Pitch Type</span>
                                      <span className="text-blue-400">{matchInsights.venue?.pitch_type || "Balanced"}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[10px] text-white/20 italic">
                                {isInsightsLoading ? "Synchronizing historical database..." : "No specific historical data available for this match yet."}
                              </p>
                            )}

                            {/* Team News Section */}
                            <div className="mt-4 pt-4 border-t border-white/5">
                              <h4 className="text-[10px] font-black uppercase text-amber-500 tracking-[0.2em] flex items-center gap-2 mb-3">
                                <Zap className="w-3.5 h-3.5" /> Team News & Updates
                              </h4>
                              {isNewsLoading ? (
                                <div className="flex items-center gap-2 text-[10px] text-white/30">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Fetching latest reports...
                                </div>
                              ) : matchNews.length > 0 ? (
                                <div className="space-y-3">
                                  {matchNews.slice(0, 3).map((item: any, idx: number) => (
                                    <div key={idx} className="bg-white/[0.02] p-3 rounded-xl border border-white/5">
                                      <h5 className="text-[10px] font-bold text-white/80 mb-1">{item.story?.hline || "Update"}</h5>
                                      <p className="text-[9px] text-white/40 line-clamp-2 leading-relaxed">
                                        {item.story?.intro || "Check full news report for injury and XI updates."}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-white/20 italic">No critical team updates or injury reports found for this match.</p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Squad Optimization Limit</label>
                        <span className="text-emerald-500 font-mono font-bold text-2xl">{teamCount}</span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="80" 
                        value={teamCount} 
                        onChange={(e) => setTeamCount(parseInt(e.target.value))}
                        className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Upload Data (Up to 20 images)</label>
                      <div 
                        {...getRootProps()} 
                        className={cn(
                          "border-2 border-dashed rounded-3xl p-12 transition-all flex flex-col items-center justify-center gap-6 cursor-pointer group/upload",
                          isDragActive ? "border-emerald-500 bg-emerald-500/5" : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                        )}
                      >
                        <input {...getInputProps()} />
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center group-hover/upload:scale-110 transition-transform">
                          <Upload className="w-8 h-8 text-emerald-500" />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="font-bold text-lg">Drop your stats images here</p>
                          <p className="text-xs text-white/30 font-medium">PNG, JPG, HEIC supported</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                        <AnimatePresence>
                          {images.map((img, idx) => (
                            <motion.div 
                              key={img.preview}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="relative aspect-square rounded-xl overflow-hidden group border border-white/10 shadow-xl"
                            >
                              <img src={img.preview} alt="" className="w-full h-full object-cover" />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeImage(idx);
                                }}
                                className="absolute inset-x-0 bottom-0 bg-black/80 backdrop-blur-sm p-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                              >
                                <X className="w-4 h-4 text-red-500" />
                              </button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>

                    <button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || images.length === 0}
                      className={cn(
                        "w-full py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all",
                        isAnalyzing || images.length === 0
                          ? "bg-white/5 text-white/20 cursor-not-allowed"
                          : "bg-emerald-500 text-black active:scale-95 shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40"
                      )}
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          OPTIMIZING SQUAD DATA...
                        </>
                      ) : (
                        <>
                          DEPLOY ANALYSIS
                          <ChevronRight className="w-5 h-5" />
                        </>
                      )}
                    </button>

                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400 text-sm"
                      >
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p>{error}</p>
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              {/* Persona Section */}
              <div className="lg:sticky lg:top-32 space-y-8">
                <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden p-10 flex flex-col gap-12 relative group shadow-2xl">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/10 pointer-events-none" />
                  
                  <div className="relative z-10 flex items-center gap-6">
                    <div className="w-20 h-20 bg-emerald-500 rounded-full overflow-hidden border-4 border-black inline-flex items-center justify-center shadow-emerald-500/20 shadow-2xl">
                       <Trophy className="w-10 h-10 text-black font-bold" />
                    </div>
                    <div>
                      <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">Lead Analyst</h3>
                      <p className="text-3xl font-black italic tracking-tighter">THE PRO PLAYER</p>
                    </div>
                  </div>

                  <div className="relative z-10 space-y-6">
                    <p className="text-2xl md:text-3xl font-medium leading-[1.3] text-white/80 italic">
                      "I don't just pick players. I look at pitch moisture, bowler release angles, and historical strike-zones. Give me the data, and I'll give you a <span className="text-white font-black underline decoration-emerald-500 decoration-4">Winning Streak</span>."
                    </p>
                    
                    <div className="grid grid-cols-2 gap-8 pt-8 border-t border-white/10">
                      <div>
                        <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Analysis Engine</div>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(i => <div key={i} className="flex-1 h-1 bg-emerald-500 rounded-full" />)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Team Depth</div>
                        <div className="flex gap-1">
                          {[1,2,3,4].map(i => <div key={i} className="flex-1 h-1 bg-emerald-500 rounded-full" />)}
                          <div className="flex-1 h-1 bg-white/10 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-5 text-center space-y-1">
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Speed</p>
                    <p className="text-xl font-black">ULTRA</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-5 text-center space-y-1">
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Accuracy</p>
                    <p className="text-xl font-black">98.2%</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-5 text-center space-y-1">
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Reliabiity</p>
                    <p className="text-xl font-black">PRO</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-12 pb-24"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 bg-black/40 backdrop-blur-xl border border-white/10 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent pointer-events-none" />
                <div className="relative z-10 space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500 text-black text-[10px] font-black tracking-widest uppercase">
                    Live Data Prosessed
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase leading-[0.9]">Expert Analysis Report</h2>
                  <p className="font-medium text-white/40 uppercase tracking-[0.2em] text-xs">
                    {leagueType} League • {teamCount} Variations Created
                  </p>
                </div>
                <div className="relative z-10 flex flex-wrap gap-4 items-center">
                  <button 
                    onClick={handleShareAll}
                    className={cn(
                      "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all hover:bg-emerald-500/20 flex items-center gap-2",
                      shareAllCopied && "bg-emerald-500 text-black border-emerald-500"
                    )}
                  >
                    {shareAllCopied ? (
                      <><CheckCheck className="w-4 h-4" /> Copied All</>
                    ) : (
                      <><Share2 className="w-4 h-4" /> Share All Teams</>
                    )}
                  </button>
                  <button 
                    onClick={handleRegenerateAfterToss}
                    disabled={isRegenerating || isAnalyzing}
                    className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all hover:bg-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCcw className={cn("w-4 h-4", isRegenerating && "animate-spin")} />
                    {isRegenerating ? "Optimizing..." : "Toss Regeneration"}
                  </button>
                  <button 
                    onClick={() => setResult(null)}
                    className="bg-white text-black px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-tighter hover:bg-emerald-500 hover:text-black transition-colors"
                  >
                    New Strategy
                  </button>
                </div>
              </div>

              <div className="grid lg:grid-cols-4 gap-6">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="lg:col-span-3 bg-white/5 border border-white/10 p-8 rounded-[2rem] space-y-8 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500 rounded flex items-center justify-center">
                        <Zap className="w-5 h-5 text-black" />
                      </div>
                      <div>
                        <h3 className="font-black text-sm uppercase tracking-[0.2em]">Strategy Blueprint</h3>
                        <p className="text-[10px] text-white/30 uppercase font-black tracking-widest">Recommended Approach</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="bg-black/40 rounded-2xl p-6 border border-white/5 space-y-4">
                        <h4 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest flex items-center gap-2">
                          <BarChart3 className="w-3 h-3" /> Match Scenario Probability
                        </h4>
                        <div className="space-y-3">
                          {Object.entries(result.matchScenarioProbs).map(([key, val]) => (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold text-white/50 uppercase tracking-tighter">
                                <span>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                <span className="text-emerald-500">{val}</span>
                              </div>
                              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: val }}
                                  className="h-full bg-emerald-500"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-emerald-500/5 rounded-2xl p-6 border border-emerald-500/20">
                         <h4 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest flex items-center gap-2 mb-3">
                          <ShieldCheck className="w-3 h-3" /> Team Building Mandate
                        </h4>
                        <p className="text-sm font-medium italic text-white/80 leading-relaxed">
                          {result.teamBuildingBlueprint}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="bg-black/40 rounded-2xl p-6 border border-white/5">
                        <h4 className="text-[10px] font-black uppercase text-blue-400 tracking-widest flex items-center gap-2 mb-4">
                          <Target className="w-3 h-3" /> Captaincy Matrix
                        </h4>
                        <div className="space-y-4">
                          {Object.entries(result.captaincyMatrix).map(([tier, players]) => (
                            <div key={tier} className="space-y-2">
                              <span className="text-[9px] font-black uppercase text-white/20 tracking-widest">{tier} Options</span>
                              <div className="flex flex-wrap gap-2">
                                {(players as string[]).map(p => (
                                  <span key={p} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-white/70">{p}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                         <div className="bg-red-500/5 rounded-2xl p-4 border border-red-500/10">
                          <h4 className="text-[9px] font-black uppercase text-red-400 tracking-widest mb-2">Fade List</h4>
                          {result.fadeStrategy.slice(0, 2).map((s, i) => (
                            <div key={i} className="text-[10px] font-bold mb-1 last:mb-0">• {s.name}</div>
                          ))}
                        </div>
                        <div className="bg-emerald-500/5 rounded-2xl p-4 border border-emerald-500/10">
                          <h4 className="text-[9px] font-black uppercase text-emerald-400 tracking-widest mb-2">G-League Edge</h4>
                          {result.differentialPicks.slice(0, 2).map((s, i) => (
                            <div key={i} className="text-[10px] font-bold mb-1 last:mb-0">• {s.name}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <div className="space-y-6">
                  <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] h-full flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                        <Target className="w-5 h-5 text-white" />
                      </div>
                      <h4 className="font-black text-sm uppercase tracking-widest">Key Differentials</h4>
                      <div className="space-y-4">
                        {result.differentialPicks.map((pick, i) => (
                          <div key={i} className="space-y-1">
                            <div className="text-[11px] font-black text-emerald-500">{pick.name}</div>
                            <div className="text-[9px] text-white/40 italic leading-tight">{pick.reason}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white/5 border border-white/10 p-8 rounded-[2rem] space-y-6 relative overflow-hidden group hover:border-emerald-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <h3 className="font-black text-sm uppercase tracking-[0.2em]">Ground Conditions</h3>
                  </div>
                  <p className="text-white/60 leading-relaxed font-medium text-lg italic">
                    {result.groundReport}
                  </p>
                </motion.div>

                <motion.div 
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   transition={{ delay: 0.2 }}
                  className="bg-white/5 border border-white/10 p-8 rounded-[2rem] space-y-6 relative overflow-hidden group hover:border-emerald-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/10 rounded flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-500" />
                    </div>
                    <h3 className="font-black text-sm uppercase tracking-[0.2em]">Form Evaluations</h3>
                  </div>
                  <p className="text-white/60 leading-relaxed font-medium text-lg italic">
                    {result.playerEvaluations}
                  </p>
                </motion.div>

                <motion.div 
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   transition={{ delay: 0.3 }}
                  className="bg-white/5 border border-white/10 p-8 rounded-[2rem] space-y-6 relative overflow-hidden group hover:border-emerald-500/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-500/10 rounded flex items-center justify-center">
                      <Target className="w-5 h-5 text-red-500" />
                    </div>
                    <h3 className="font-black text-sm uppercase tracking-[0.2em]">Key Battles</h3>
                  </div>
                  <p className="text-white/60 leading-relaxed font-medium text-lg italic">
                    {result.keyMatchups}
                  </p>
                </motion.div>
              </div>

              {/* AI Fantasy Pandit Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900/50 border border-white/10 rounded-[2.5rem] overflow-hidden dashboard-border"
              >
                <div className="bg-emerald-500/10 border-b border-white/5 p-8 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-black" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black italic tracking-tighter uppercase">AI Fantasy Pandit</h3>
                      <p className="text-xs font-medium text-emerald-500 uppercase tracking-widest">Digital Cricket Oracle</p>
                    </div>
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">
                    <span>Context Aware</span>
                    <div className="w-1 h-1 bg-white/10 rounded-full" />
                    <span>Real-time Wisdom</span>
                  </div>
                </div>

                <div className="p-8 space-y-6">
                  {chatMessages.length === 0 ? (
                    <div className="text-center py-12 space-y-4">
                      <MessageSquare className="w-12 h-12 text-white/10 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-lg font-bold">Ask me anything about these teams</p>
                        <p className="text-white/40 text-sm">"Why is Kohli not the captain?" or "Which bowler is best for death overs?"</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                      {chatMessages.map((msg, i) => (
                        <div 
                          key={i} 
                          className={cn(
                            "flex flex-col gap-2 max-w-[85%]",
                            msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                          )}
                        >
                          <div className={cn(
                            "px-5 py-3 rounded-2xl text-sm font-medium leading-relaxed",
                            msg.role === 'user' 
                              ? "bg-emerald-500 text-black rounded-tr-none" 
                              : "bg-white/5 border border-white/10 text-white/80 rounded-tl-none"
                          )}>
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      {isChatLoading && (
                        <div className="flex items-center gap-3 text-white/30 italic text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Consulting cricket history...
                        </div>
                      )}
                    </div>
                  )}

                  <div className="relative pt-4">
                    <input 
                      type="text" 
                      value={currentQuestion}
                      onChange={(e) => setCurrentQuestion(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAskPandit()}
                      placeholder="Ask the AI Fantasy Pandit..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 pr-16 text-sm font-medium focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                    <button 
                      onClick={handleAskPandit}
                      disabled={isChatLoading || !currentQuestion.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 bg-white text-black rounded-xl flex items-center justify-center hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>

              <div className="space-y-8">
                {result.tossImpactAnalysis && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-8 rounded-[2rem] bg-blue-500/5 border border-blue-500/10"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-2xl bg-blue-500/20 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <h4 className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Toss Strategic Analysis</h4>
                        <p className="text-sm font-bold text-white">Post-Toss Adjustments Applied</p>
                      </div>
                    </div>
                    <p className="text-white/70 italic font-medium leading-relaxed">
                      "{result.tossImpactAnalysis}"
                    </p>
                    {result.scenarioBreakdown && (
                       <p className="text-[10px] text-white/30 mt-4 uppercase tracking-widest leading-relaxed">
                        <span className="text-blue-500/50">Strategy:</span> {result.scenarioBreakdown}
                      </p>
                    )}
                  </motion.div>
                )}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="h-px w-8 bg-white/10" />
                    <h3 className="text-xl font-black uppercase italic tracking-tighter shrink-0">
                      Optimized <span className="text-emerald-500">Squads</span>
                    </h3>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>

                  {teamGroups.length > 1 && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {teamGroups.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveGroupIndex(i)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                            activeGroupIndex === i 
                              ? "bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/20" 
                              : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:border-white/20"
                          )}
                        >
                          Squads {i * 10 + 1} - {Math.min((i + 1) * 10, result.teams.length)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                
                <motion.div 
                  key={activeGroupIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="grid sm:grid-cols-2 xl:grid-cols-3 gap-8"
                >
                  {teamGroups[activeGroupIndex]?.map((team, idx) => {
                    const globalIdx = (activeGroupIndex * 10) + idx;
                    return (
                      <TeamCard 
                        key={team.id} 
                        team={team} 
                        index={globalIdx} 
                        leagueType={leagueType} 
                      />
                    );
                  })}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
      </main>
    </div>
  );
}

interface TeamCardProps {
  team: FantasyTeam;
  index: number;
  leagueType: string;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, index, leagueType }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyTeam = () => {
    const teamSummary = `🏆 AFTER TOSS SQUAD #${index + 1} 🏆
League: ${leagueType}
Players:
${team.players.map((p, i) => `${i + 1}. ${p}${p === team.captain ? ' (C)' : ''}${p === team.viceCaptain ? ' (VC)' : ''}`).join('\n')}

Captain: ${team.captain}
Vice-Captain: ${team.viceCaptain}
${team.tossRationale ? `\nToss Edge: ${team.tossRationale}` : ''}`;
    
    navigator.clipboard.writeText(teamSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: (index % 10) * 0.05 }}
      className="p-1 rounded-[2.5rem] bg-gradient-to-br from-white/10 to-transparent hover:from-cyan-500/20 transition-all duration-500 group shadow-xl"
    >
      <div className="bg-[#0a0a0a] rounded-[2.4rem] p-6 h-full space-y-6 relative overflow-hidden border border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-black font-black text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)]">
               {index + 1}
             </div>
             <div>
               <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30">Team Number</h4>
               <p className="text-xs font-bold text-white uppercase">{team.teamBalance || 'Balanced (11)'}</p>
             </div>
          </div>
          {team.isImpactUsed && (
            <span className="text-[8px] font-black bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20">IMPACT PLAYER</span>
          )}
        </div>

        <div className="space-y-2">
           <div className="grid grid-cols-1 gap-1.5">
             {team.players.map((player) => (
               <div key={player} className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors">
                 <div className="flex items-center gap-2.5">
                   <div className={cn(
                     "w-1 h-1 rounded-full",
                     player === team.captain ? "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" : player === team.viceCaptain ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-white/10"
                   )} />
                   <span className={cn(
                     "text-xs font-bold",
                     player === team.captain ? "text-cyan-400" : player === team.viceCaptain ? "text-emerald-400" : "text-white/70"
                   )}>
                     {player}
                   </span>
                 </div>
                 <div className="flex items-center gap-1.5">
                   {player === team.captain && (
                     <span className="text-[8px] font-black bg-cyan-500 text-black px-1.5 py-0.5 rounded uppercase">C</span>
                   )}
                   {player === team.viceCaptain && (
                     <span className="text-[8px] font-black bg-emerald-500 text-black px-1.5 py-0.5 rounded uppercase">VC</span>
                   )}
                 </div>
               </div>
             ))}
           </div>
        </div>

        {team.tossRationale && (
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[9px] text-white/30 leading-relaxed italic">
              "{team.tossRationale}"
            </p>
          </div>
        )}

        <button 
          onClick={handleCopyTeam}
          className={cn(
            "w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border",
            copied 
              ? "bg-cyan-500 border-cyan-400 text-black shadow-lg shadow-cyan-500/20 active:scale-95" 
              : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white"
          )}
        >
          {copied ? "SQUAD COPIED" : "COPY TEAM"}
        </button>
      </div>
    </motion.div>
  );
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}
