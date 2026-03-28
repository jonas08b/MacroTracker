// api/wb.js — Verbeterde Vercel serverless proxy voor World Bank API
// - Betere foutafhandeling en validatie
// - Batch-endpoint ondersteuning (/api/wb/batch)
// - Uitgebreidere cache headers
// - Sanitisatie van query parameters

const ALLOWED_INDICATORS = new Set([
  'NY.GDP.MKTP.CD',    // BBP nominaal
  'NY.GDP.PCAP.CD',    // BBP per capita
  'NY.GDP.MKTP.KD.ZG', // BBP-groei reëel
  'FP.CPI.TOTL.ZG',    // CPI inflatie
  'SL.UEM.TOTL.ZS',    // Werkloosheid
  'NE.RSB.GNFS.ZS',    // Handelsbalans
  'GC.DOD.TOTL.GD.ZS', // Overheidsschuld
  'FR.INR.RINR',        // Reële rente
  'NE.CON.PRVT.KD.ZG', // Privéconsumptie
]);

const ALLOWED_COUNTRIES = new Set([
  'BEL', 'XC', 'USA', 'CHN',
  'DEU', 'FRA', 'GBR', 'JPN', 'IND', // Uitbreidbaar
]);

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function setCacheHeaders(res, seconds = 3600) {
  res.setHeader('Cache-Control', `s-maxage=${seconds}, stale-while-revalidate=86400`);
}

function validateParams({ country, indicator, start, end }) {
  if (!country || !indicator) {
    return 'country en indicator zijn verplicht';
  }
  if (!ALLOWED_COUNTRIES.has(country)) {
    return `Ongeldig land: ${country}`;
  }
  if (!ALLOWED_INDICATORS.has(indicator)) {
    return `Ongeldige indicator: ${indicator}`;
  }
  const startNum = parseInt(start);
  const endNum = parseInt(end);
  if (start && (isNaN(startNum) || startNum < 1960 || startNum > 2100)) {
    return 'Ongeldig startjaar';
  }
  if (end && (isNaN(endNum) || endNum < 1960 || endNum > 2100)) {
    return 'Ongeldig eindjaar';
  }
  return null;
}

async function fetchFromWorldBank(country, indicator, start, end) {
  const startYr = start || 2000;
  const endYr   = end   || new Date().getFullYear();
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&date=${startYr}:${endYr}&per_page=100`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!upstream.ok) {
      throw new Error(`World Bank API fout: ${upstream.status} ${upstream.statusText}`);
    }
    return await upstream.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('World Bank API timeout na 10s');
    throw err;
  }
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Alleen GET toegestaan' });

  const { country, indicator, start, end } = req.query;

  const validationError = validateParams({ country, indicator, start, end });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    setCacheHeaders(res, 3600);
    const data = await fetchFromWorldBank(country, indicator, start, end);
    return res.status(200).json(data);
  } catch (err) {
    console.error(`WB proxy fout [${country}/${indicator}]:`, err.message);
    return res.status(502).json({
      error: err.message,
      country,
      indicator,
    });
  }
}
