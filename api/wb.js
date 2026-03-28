// api/wb.js — Vercel serverless proxy voor World Bank API
// Vercel draait dit server-side → geen CORS-probleem

export default async function handler(req, res) {
  // CORS-headers zodat jouw HTML-bestand deze mag aanroepen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // 1u cache

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { country, indicator, start, end } = req.query;

  if (!country || !indicator) {
    return res.status(400).json({ error: 'country en indicator zijn verplicht' });
  }

  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&date=${start || 2000}:${end || 2025}&per_page=100`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `World Bank fout: ${upstream.status}` });
    }
    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
