import React, { useState, useEffect } from 'react';
import { 
  Trophy, 
  Menu, 
  X, 
  Calendar, 
  Zap, 
  CheckCircle2, 
  Info, 
  Phone, 
  ShieldAlert, 
  ChevronRight,
  Clock,
  MapPin,
  RefreshCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

// --- Mock Data ---
const UPCOMING_MATCHES = [
  { id: 'u1', team_a: 'India', team_b: 'Pakistan', league: 'T20 World Cup', date: 'Oct 24, 2026', time: '19:30 IST', venue: 'Dubai', flag_a: '🇮🇳', flag_b: '🇵🇰' },
  { id: 'u2', team_a: 'Australia', team_b: 'England', league: 'Ashes Series', date: 'Oct 25, 2026', time: '09:00 AEST', venue: 'MCG', flag_a: '🇦🇺', flag_b: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'u3', team_a: 'Mumbai Indians', team_b: 'CSK', league: 'IPL 2026', date: 'Oct 26, 2026', time: '20:00 IST', venue: 'Wankhede', flag_a: '🟦', flag_b: '🟨' },
];

const COMPLETED_MATCHES = [
  { id: 'c1', team_a: 'South Africa', team_b: 'New Zealand', score_a: '182/6', score_b: '178/9', result: 'SA won by 4 runs', league: 'ODI Series', flag_a: '🇿🇦', flag_b: '🇳🇿' },
  { id: 'c2', team_a: 'West Indies', team_b: 'Sri Lanka', score_a: '145/10', score_b: '148/2', result: 'SL won by 8 wickets', league: 'T20 International', flag_a: '🇼🇮', flag_b: '🇱🇰' },
];

const INITIAL_LIVE_MATCHES = [
  { 
    id: 'l1', 
    team_a: 'RCB', 
    team_b: 'KKR', 
    score_a: '165/4', 
    score_b: '45/1', 
    overs: '5.2', 
    league: 'IPL 2026', 
    status: 'In Progress', 
    batting: 'team_b', 
    crr: '8.45', 
    last_updated: 'Just now',
    flag_a: '🔴',
    flag_b: '🟣'
  }
];

type View = 'Home' | 'Upcoming' | 'Live' | 'Completed' | 'About' | 'Contact' | 'Privacy' | 'Terms' | 'Disclaimer';

interface MatchCardProps {
  match: any;
  type: 'upcoming' | 'live' | 'completed';
}

export default function LiveScoresDashboard() {
  const [activeView, setActiveView] = useState<View>('Home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([]);
  const [completedMatches, setCompletedMatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string>("Initializing...");
  const [apiStatus, setApiStatus] = useState<any>(null);
  const [showStatus, setShowStatus] = useState(false);

  const fetchMatches = async () => {
    try {
      // First, check if server is reachable
      const pingUrl = '/api/ping';
      const pingRes = await fetch(pingUrl).catch(() => null);
      if (!pingRes || pingRes.status === 404) {
        setError(`Server unreachable (404) at ${pingUrl}. The backend might not be serving API routes correctly.`);
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/live-match');
      
      if (!response.ok) {
        const text = await response.text();
        let errorMessage = `Server error: ${response.status}`;
        try {
          const json = JSON.parse(text);
          if (json.error) errorMessage = json.error;
        } catch (e) {
          // Response was not JSON
        }
        setError(errorMessage);
        return;
      }

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setLiveMatches(data.live || []);
        setUpcomingMatches(data.upcoming || []);
        setCompletedMatches(data.recent || data.completed || []);
        setDataSource(data._source || "Live");
        setApiStatus(data._apiStatus || null);
        setError(null);
      }
    } catch (err) {
      console.error("Fetch matches error:", err);
      setError("Network failure. Check your internet connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 60000); // 60s update
    return () => clearInterval(interval);
  }, []);

  const AdPlaceholder = ({ label, className }: { label: string, className?: string }) => (
    <div className={cn("bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col items-center justify-center min-h-[100px] text-white/20 select-none", className)}>
      <span className="text-[10px] font-black uppercase tracking-[0.3em] mb-2">Advertisement</span>
      <div className="w-full h-px bg-white/5 mb-2" />
      <span className="text-xs font-mono">{label}</span>
    </div>
  );

  const MatchCard: React.FC<MatchCardProps> = ({ match, type }) => {
    if (type === 'live') {
      return (
        <div className="glass-card p-6 border-brand/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4">
            <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" /> LIVE
            </span>
          </div>
          
          <div className="mb-4">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">{match.league || "Global Match"}</p>
          </div>

          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex-1 flex flex-col items-center text-center">
              <span className="text-4xl mb-2">{match.flag_a || "🏏"}</span>
              <p className="font-bold text-sm uppercase">{match.team_a || "Team A"}</p>
              <p className={cn("text-xl font-mono mt-1", match.batting === 'team_a' ? "text-brand" : "text-white/50")}>{match.score_a || match.score || "0/0"}</p>
            </div>
            
            <div className="text-center px-4">
              <span className="text-white/20 font-black text-xl italic uppercase">VS</span>
              <p className="text-[10px] font-mono text-white/30 mt-2 uppercase">Status: {match.status?.split(' ').slice(0, 2).join(' ') || "Live"}</p>
            </div>

            <div className="flex-1 flex flex-col items-center text-center">
              <span className="text-4xl mb-2">{match.flag_b || "📡"}</span>
              <p className="font-bold text-sm uppercase">{match.team_b || "Team B"}</p>
              <p className={cn("text-xl font-mono mt-1", match.batting === 'team_b' ? "text-brand" : "text-white/50")}>{match.score_b || ""}</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[9px] text-white/30 uppercase font-black">{match.overs ? "Overs" : "Context"}</p>
                <p className="text-xs font-mono font-bold text-brand">{match.overs || match.status || "N/A"}</p>
              </div>
            </div>
            <p className="text-[9px] text-white/40 font-medium italic bg-white/5 px-2 py-1 rounded">{match.venue || "Stadium"}</p>
          </div>
        </div>
      );
    }

    if (type === 'upcoming') {
      return (
        <div className="glass-card glass-card-hover p-4">
          <div className="flex items-center justify-between mb-4">
             <span className="text-[9px] font-black text-brand uppercase tracking-widest">{match.league || "Tournament"}</span>
             <span className="text-[9px] font-mono text-white/30">{match.date || "TBD"}</span>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{match.flag_a || "🏏"}</span>
              <span className="text-xs font-bold uppercase">{match.team_a || "Team A"}</span>
            </div>
            <span className="text-[10px] font-black text-white/10 italic">VS</span>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase">{match.team_b || "Team B"}</span>
              <span className="text-2xl">{match.flag_b || "📡"}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-white/40">
            <Clock className="w-3 h-3" />
            <span className="text-[10px] font-bold">{match.time || match.status || "Check App"}</span>
            <span className="w-1 h-1 bg-white/10 rounded-full" />
            <MapPin className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-tighter truncate max-w-[100px]">{match.venue || "Stadium"}</span>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 opacity-70 hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-between mb-3">
           <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{match.league || "Match"}</span>
           <span className="flex items-center gap-1 text-[9px] font-black text-white/20 uppercase">
             <CheckCircle2 className="w-3 h-3" /> Result
           </span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span>{match.flag_a || "🏏"}</span>
            <span className="text-xs font-bold">{match.team_a || "Team A"}</span>
          </div>
          <span className="text-xs font-mono font-bold">{match.score_a || match.score || "DNF"}</span>
        </div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span>{match.flag_b || "📡"}</span>
            <span className="text-xs font-bold">{match.team_b || "Team B"}</span>
          </div>
          <span className="text-xs font-mono font-bold">{match.score_b || ""}</span>
        </div>
        <div className="pt-2 border-t border-white/5">
          <p className="text-[10px] font-bold text-brand uppercase">{match.result || match.status || "Final Score"}</p>
        </div>
      </div>
    );
  };

  const LegalContent = ({ title }: { title: string }) => {
    const getContent = () => {
      switch(activeView) {
        case 'About': return (
          <div className="space-y-4 text-white/60 text-sm leading-relaxed">
            <p>Welcome to Live Cricket Score, your premium destination for real-time cricket metrics and match analysis. Our platform is built by enthusiasts for enthusiasts, leveraging advanced web technology to deliver instant scorecards and fixture updates.</p>
            <p>Our mission is to provide the fastest, most clean interface for cricket fans worldwide, ensuring you never miss a ball whether it's a T20 World Cup final or a local derby.</p>
          </div>
        );
        case 'Contact': return (
          <div className="space-y-4 text-white/60 text-sm leading-relaxed">
            <p>Have questions or feedback? Our team is available 24/7 to ensure your experience remains top-tier.</p>
            <div className="grid gap-4 mt-6">
              <div className="bg-white/5 p-4 rounded-xl flex items-center gap-4 border border-white/5">
                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Support Line</p>
                  <p className="text-[10px] opacity-60">+1 (800) CRIC-SCORE</p>
                </div>
              </div>
              <div className="bg-white/5 p-4 rounded-xl flex items-center gap-4 border border-white/5">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Email Reach</p>
                  <p className="text-[10px] opacity-60">hello@livecricketscore.pro</p>
                </div>
              </div>
            </div>
          </div>
        );
        case 'Privacy': return (
          <div className="space-y-6 text-white/60 text-sm leading-relaxed">
            <section>
              <h4 className="text-white font-bold mb-2">1. Data Collection</h4>
              <p>We do not collect personal identifiable information unless voluntarily provided. We use cookies to enhance user experience and analyze traffic patterns through tools like Google AdSense.</p>
            </section>
            <section>
              <h4 className="text-white font-bold mb-2">2. Google AdSense</h4>
              <p>We use third-party advertising companies to serve ads when you visit our website. These companies may use information (not including your name, address, email address, or telephone number) about your visits to this and other websites in order to provide advertisements about goods and services of interest to you.</p>
            </section>
            <section>
              <h4 className="text-white font-bold mb-2">3. Third-Party Links</h4>
              <p>Our site may contain links to external sites. We are not responsible for the privacy practices or the content of such sites.</p>
            </section>
          </div>
        );
        case 'Terms': return (
          <div className="space-y-6 text-white/60 text-sm leading-relaxed">
            <section>
              <h4 className="text-white font-bold mb-2">1. Content Usage</h4>
              <p>The content provided on this website is for informational and educational purposes only. Reproduction or redistribution of our proprietary logic or UI designs without permission is prohibited.</p>
            </section>
            <section>
              <h4 className="text-white font-bold mb-2">2. Data Accuracy</h4>
              <p>While we strive for 100% accuracy, scores and statistics are provided "as is" with no guarantee of real-time precision. We are not liable for any losses resulting from decisions made based on this data.</p>
            </section>
          </div>
        );
        case 'Disclaimer': return (
          <div className="space-y-6 text-white/60 text-sm leading-relaxed bg-brand/5 p-6 rounded-2xl border border-brand/10">
            <section>
              <h4 className="text-brand font-bold mb-2 uppercase tracking-widest text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Non-Affiliation
              </h4>
              <p>Live Cricket Score is an independent scores platform. We are NOT affiliated with, sponsored by, or endorsed by the International Cricket Council (ICC), the BCCI, IPL, or any other cricket governing body or league.</p>
            </section>
            <section>
              <h4 className="text-brand font-bold mb-2 uppercase tracking-widest text-xs">Proprietary Notice</h4>
              <p>All trademarks and logos are the property of their respective owners. Scores used are for demonstration and informational purposes only.</p>
            </section>
          </div>
        );
        default: return null;
      }
    };

    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto py-12 px-4"
      >
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setActiveView('Home')} className="p-2 hover:bg-white/5 rounded-full">
            <X className="w-6 h-6 text-white/30" />
          </button>
          <h2 className="text-4xl font-black uppercase tracking-tighter italic">{title}</h2>
        </div>
        <div className="glass-card p-10">
          {getContent()}
        </div>
        <div className="mt-12">
          <AdPlaceholder label="Legal Section Banner Ad" />
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-bg-dark text-white font-sans selection:bg-brand selection:text-black">
      
      {/* API Status Modal */}
      <AnimatePresence>
        {showStatus && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowStatus(false)}
              className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="max-w-md w-full bg-[#111] border border-white/10 rounded-3xl p-8 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-black uppercase italic tracking-tighter">System Health</h2>
                  <button onClick={() => setShowStatus(false)} className="p-2 hover:bg-white/5 rounded-full">
                    <X className="w-6 h-6 text-white/30" />
                  </button>
                </div>

                <div className="space-y-6">
                  {apiStatus ? Object.entries(apiStatus).map(([name, status]: [string, any]) => (
                    <div key={name} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">{name} API Provider</span>
                        <span className={cn("text-xs font-bold mt-1", (status === 'OK' || status === 'Current') ? "text-green-500" : "text-amber-500")}>
                          {status}
                        </span>
                      </div>
                      {(status === 'OK' || status === 'Current') ? (
                        <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                  )) : (
                    <p className="text-sm text-white/40 italic">Diagnostic data not yet available. Refreshing...</p>
                  )}
                  
                  <div className="pt-6 border-t border-white/5">
                    <div className="bg-brand/5 p-4 rounded-xl border border-brand/20">
                      <h4 className="text-[10px] font-black text-brand uppercase mb-2">Resilience Report</h4>
                      <p className="text-[11px] text-white/60 leading-relaxed space-y-1">
                        <span className="block">• <span className="text-white font-bold">429/403 Circuit Active:</span> Provider quota reached. System is automatically bypassing this provider for 15 minutes.</span>
                        <span className="block">• <span className="text-white font-bold">Satellite Simulation:</span> If you see this source, it means global APIs are currently rate-limited. We are simulating live data so you can continue testing.</span>
                        <span className="block">• <span className="text-white font-bold">Data Accuracy:</span> Use "Force Resync" if scores seem stuck. Standard sync interval is 60s.</span>
                      </p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => { fetchMatches(); setShowStatus(false); }}
                  className="w-full mt-8 py-4 bg-white text-black font-black uppercase rounded-2xl hover:bg-brand transition-colors text-sm"
                >
                  Force Resync
                </button>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-80 bg-[#0f0f0f] border-r border-white/10 z-[101] p-8"
            >
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center">
                    <Zap className="w-6 h-6 text-black" />
                  </div>
                  <h1 className="font-display font-black text-xl uppercase tracking-tighter">Live Scores</h1>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/5 rounded-full">
                  <X className="w-6 h-6 text-white/50" />
                </button>
              </div>

              <nav className="space-y-1">
                {(['Home', 'Upcoming', 'Live', 'Completed', 'About', 'Contact', 'Privacy', 'Terms', 'Disclaimer'] as View[]).map((view) => (
                  <button
                    key={view}
                    onClick={() => {
                      setActiveView(view);
                      setIsSidebarOpen(false);
                      window.scrollTo(0, 0);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-xl text-left text-sm font-bold tracking-tight transition-all",
                      activeView === view 
                        ? "bg-brand text-black" 
                        : "text-white/40 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {view}
                    <ChevronRight className={cn("w-4 h-4 opacity-20", activeView === view && "opacity-100")} />
                  </button>
                ))}
              </nav>

              <div className="absolute bottom-8 left-8 right-8 text-center border-t border-white/5 pt-6">
                <p className="text-[10px] text-white/20 uppercase font-black tracking-widest">Powered by AI Analytics</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/5 h-20 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-brand hover:text-black rounded-xl transition-all group"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div 
              onClick={() => setActiveView('Home')}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Trophy className="w-6 h-6 text-black" />
              </div>
              <h1 className="font-display font-black text-2xl uppercase tracking-tighter">Live Cricket Score</h1>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <button 
              onClick={() => setShowStatus(true)}
              className="flex flex-col items-end hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/20 mb-1">
                <span className="w-2 h-2 bg-brand rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase text-brand tracking-widest">Network Live</span>
              </div>
              <span className="text-[8px] font-black uppercase text-white/20 tracking-widest">Source: {dataSource}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-screen">
        {activeView !== 'Home' && activeView !== 'Upcoming' && activeView !== 'Live' && activeView !== 'Completed' ? (
          <LegalContent title={activeView} />
        ) : (
          <div className="max-w-7xl mx-auto px-6 py-12">
            
            {/* Top Ad */}
            <div className="mb-16">
              <AdPlaceholder label="Header Horizontal Banner (728x90)" className="h-[90px] max-w-3xl mx-auto" />
            </div>

            <div className="grid gap-20">
              
              {/* 1. Upcoming Matches */}
              {(activeView === 'Home' || activeView === 'Upcoming') && (
                <section className="space-y-8">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <h3 className="text-3xl font-black uppercase tracking-tighter italic flex items-center gap-3">
                      <Calendar className="w-8 h-8 text-blue-500" /> Upcoming Fixtures
                    </h3>
                    <button onClick={() => setActiveView('Upcoming')} className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] hover:text-white transition-colors">View All</button>
                  </div>
                  {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
                      {[1, 2, 3].map(i => <div key={i} className="h-48 bg-white/5 rounded-2xl" />)}
                    </div>
                  ) : upcomingMatches.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {upcomingMatches.map(match => (
                        <MatchCard key={match.id} match={match} type="upcoming" />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-12 text-center text-white/20">
                      <p className="text-xs font-bold uppercase tracking-widest">No Matches Scheduled</p>
                    </div>
                  )}
                </section>
              )}

              {/* In-Content Ad */}
              <div className="py-4">
                <AdPlaceholder label="Native In-Content Recommendation Ad" />
              </div>

              {/* 2. Live Matches */}
              {(activeView === 'Home' || activeView === 'Live') && (
                <section className="space-y-8">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <h3 className="text-3xl font-black uppercase tracking-tighter italic flex items-center gap-3">
                      <Zap className="w-8 h-8 text-brand animate-pulse" /> Global Live Feed
                    </h3>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => { setIsLoading(true); fetchMatches(); }}
                        className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
                        title="Refresh Live Scores"
                      >
                        <RefreshCcw className={cn("w-5 h-5", isLoading && "animate-spin")} />
                      </button>
                      <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black text-red-500 uppercase">Updating Real-time</span>
                      </div>
                    </div>
                  </div>
                  
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-500 text-xs font-bold">
                      <ShieldAlert className="w-4 h-4" /> {error}
                    </div>
                  )}

                  {isLoading ? (
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-pulse">
                        {[1, 2].map(i => <div key={i} className="h-64 bg-white/5 rounded-3xl" />)}
                     </div>
                  ) : liveMatches.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {liveMatches.map(match => (
                        <MatchCard key={match.id} match={match} type="live" />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white/[0.02] border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center p-12 text-center text-white/20">
                      <Info className="w-8 h-8 mb-4 opacity-50" />
                      <p className="text-sm font-bold uppercase tracking-widest">Awaiting Next Live Event</p>
                      <p className="text-[10px] mt-2">Professional data synchronization active.</p>
                    </div>
                  )}
                </section>
              )}

              {/* 3. Completed Matches */}
              {(activeView === 'Home' || activeView === 'Completed') && (
                <section className="space-y-8">
                   <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <h3 className="text-3xl font-black uppercase tracking-tighter italic flex items-center gap-3 opacity-60">
                      <CheckCircle2 className="w-8 h-8 text-white/30" /> Past Encounters
                    </h3>
                    <button onClick={() => setActiveView('Completed')} className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] hover:text-white transition-colors">History</button>
                  </div>
                  {isLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-pulse">
                      {[1, 2, 3, 4].map(i => <div key={i} className="h-40 bg-white/5 rounded-2xl" />)}
                    </div>
                  ) : completedMatches.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                      {completedMatches.map(match => (
                        <MatchCard key={match.id} match={match} type="completed" />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-12 text-center text-white/20">
                      <p className="text-xs font-bold uppercase tracking-widest">No Recent Matches Found</p>
                    </div>
                  )}
                </section>
              )}

            </div>

             {/* Footer Ad */}
             <div className="mt-24">
              <AdPlaceholder label="Sticky Bottom Adaptive Banner" className="h-[250px]" />
            </div>

          </div>
        )}
      </main>

      {/* Corporate Footer */}
      <footer className="bg-black border-t border-white/5 py-16 mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-black" />
                </div>
                <h1 className="font-display font-black text-2xl uppercase tracking-tighter">Live Cricket Score</h1>
              </div>
              <p className="text-white/30 text-sm max-w-md leading-relaxed">
                The world's fastest cricket scoring engine. Designed for performance, built for the community. Stay ahead of every run, every wicket, and every match moment.
              </p>
            </div>
            <div>
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-6">Navigation</h5>
              <nav className="flex flex-col gap-4">
                <button onClick={() => setActiveView('Home')} className="text-sm font-bold text-white/40 hover:text-brand transition-colors text-left uppercase">Dashboard</button>
                <button onClick={() => setActiveView('Live')} className="text-sm font-bold text-white/40 hover:text-brand transition-colors text-left uppercase">Live Now</button>
                <button onClick={() => setActiveView('About')} className="text-sm font-bold text-white/40 hover:text-brand transition-colors text-left uppercase">Our Story</button>
              </nav>
            </div>
            <div>
              <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-6">Legal & Policy</h5>
              <nav className="flex flex-col gap-4">
                <button onClick={() => setActiveView('Privacy')} className="text-sm font-bold text-white/40 hover:text-brand transition-colors text-left uppercase">Privacy Policy</button>
                <button onClick={() => setActiveView('Disclaimer')} className="text-sm font-bold text-white/40 hover:text-brand transition-colors text-left uppercase">Disclaimer</button>
                <button onClick={() => setActiveView('Terms')} className="text-sm font-bold text-white/40 hover:text-brand transition-colors text-left uppercase">Terms of Use</button>
              </nav>
            </div>
          </div>
          <div className="border-t border-white/5 mt-16 pt-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-[10px] text-white/20 uppercase font-black tracking-widest">© 2026 LIVE CRICKET SCORE PRO. ALL RIGHTS RESERVED.</p>
            <div className="flex gap-6">
               <span className="text-[10px] font-black text-white/10 uppercase tracking-widest">ADSENSE VERIFIED</span>
               <span className="text-[10px] font-black text-white/10 uppercase tracking-widest">SSL SECURE</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
