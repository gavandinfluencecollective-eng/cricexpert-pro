export default async function handler(req, res) {
  try {
    const headers = {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": "cricbuzz-cricket.p.rapidapi.com"
    };

    // 1️⃣ Try LIVE matches
    let response = await fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live", {
      method: "GET",
      headers
    });

    let data = await response.json();

    // 2️⃣ Agar live empty hai → UPCOMING fetch karo
    if (!data || !data.typeMatches || data.typeMatches.length === 0) {
      response = await fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/upcoming", {
        method: "GET",
        headers
      });

      data = await response.json();
    }

    // 3️⃣ Agar still empty → RECENT fetch karo
    if (!data || !data.typeMatches || data.typeMatches.length === 0) {
      response = await fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent", {
        method: "GET",
        headers
      });

      data = await response.json();
    }

    // 4️⃣ Final response
    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "API fetch failed",
      message: error.message
    });
  }
}
