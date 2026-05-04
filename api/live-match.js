let url = "https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live";

let response = await fetch(url, {
  method: "GET",
  headers: {
    "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
    "X-RapidAPI-Host": "cricbuzz-cricket.p.rapidapi.com"
  }
});

let data = await response.json();

// 🔥 fallback
if (!data || Object.keys(data).length === 0) {
  const upcomingRes = await fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/upcoming", {
    method: "GET",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": "cricbuzz-cricket.p.rapidapi.com"
    }
  });

  data = await upcomingRes.json();
}
