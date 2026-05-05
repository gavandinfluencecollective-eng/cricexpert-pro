export default async function handler(req, res) {
  try {
    const cricbuzzHeaders = {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": "cricbuzz-cricket.p.rapidapi.com"
    };

    // 🔹 1. Cricbuzz se data fetch
    const [liveRes, upcomingRes, recentRes] = await Promise.all([
      fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live", { headers: cricbuzzHeaders }),
      fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/upcoming", { headers: cricbuzzHeaders }),
      fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent", { headers: cricbuzzHeaders })
    ]);

    const liveData = await liveRes.json();
    const upcomingData = await upcomingRes.json();
    const recentData = await recentRes.json();

    // 🔹 Extract function
    const extractMatches = (data) => {
      if (!data || !data.typeMatches) return [];
      let matches = [];
      data.typeMatches.forEach(type => {
        type.seriesMatches?.forEach(series => {
          series.seriesAdWrapper?.matches?.forEach(match => {
            matches.push(match);
          });
        });
      });
      return matches;
    };

    let liveMatches = extractMatches(liveData);
    let upcomingMatches = extractMatches(upcomingData);
    let recentMatches = extractMatches(recentData);

    // 🔥 2. Agar Cricbuzz empty ho → CricketData API use kar
    if (
      liveMatches.length === 0 &&
      upcomingMatches.length === 0 &&
      recentMatches.length === 0
    ) {
      const cricketDataRes = await fetch(
        `https://api.cricketdata.org/v1/matches?apikey=${process.env.CRICKETDATA_API_KEY}`
      );

      const cricketData = await cricketDataRes.json();

      // Simple format mapping
      const fallbackMatches = cricketData?.data?.map(match => ({
        matchId: match.id,
        name: match.name,
        status: match.status,
        teams: match.teams,
        venue: match.venue
      })) || [];

      return res.status(200).json({
        success: true,
        source: "cricketdata",
        total: fallbackMatches.length,
        all: fallbackMatches
      });
    }

    // 🔹 3. Combine Cricbuzz data
    const allMatches = [
      ...liveMatches,
      ...upcomingMatches,
      ...recentMatches
    ];

    return res.status(200).json({
      success: true,
      source: "cricbuzz",
      total: allMatches.length,
      live: liveMatches,
      upcoming: upcomingMatches,
      recent: recentMatches,
      all: allMatches
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "API fetch failed",
      message: error.message
    });
  }
}
