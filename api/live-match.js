export default async function handler(req, res) {
  try {
    const headers = {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": "cricbuzz-cricket.p.rapidapi.com"
    };

    // 🔹 1. Sab endpoints call karo
    const [liveRes, upcomingRes, recentRes] = await Promise.all([
      fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live", { headers }),
      fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/upcoming", { headers }),
      fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent", { headers })
    ]);

    const liveData = await liveRes.json();
    const upcomingData = await upcomingRes.json();
    const recentData = await recentRes.json();

    // 🔹 2. Extract matches safely
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

    const liveMatches = extractMatches(liveData);
    const upcomingMatches = extractMatches(upcomingData);
    const recentMatches = extractMatches(recentData);

    // 🔹 3. Combine all
    const allMatches = [
      ...liveMatches,
      ...upcomingMatches,
      ...recentMatches
    ];

    // 🔹 4. Final response
    return res.status(200).json({
      success: true,
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
