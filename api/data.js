const BASE = "https://www.padelfederacion.es/Paginas/fpadelib/";
const LEAGUE = "28876";
const GROUP = "32942";
const TEAM_ID = "161338";

function decode(value = "") {
  return value.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function text(html = "") {
  return decode(html.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function cells(row) {
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
}

function rowList(html) {
  return [...html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map((match) => ({
    className: match[1].match(/class=["']([^"']*)["']/i)?.[1] || "",
    html: match[2],
  }));
}

function anchor(cell = "") {
  const match = cell.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
  return { name: text(match?.[2] || cell), href: match?.[1].match(/href=["']([^"']*)["']/i)?.[1] || "" };
}

function idFromHref(href, key) {
  return new URLSearchParams(href.replace(/&amp;/gi, "&").split("?")[1] || "").get(key);
}

async function fetchPage(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SixSevenDashboard/1.0)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`La federación respondió ${response.status}`);
  return response.text();
}

function parseStandings(html) {
  return rowList(html).filter((row) => row.className.includes("LineasRnk")).map((row) => {
    const td = cells(row.html), team = anchor(td[1]);
    return {
      position: Number(text(td[0])), team: team.name, teamId: idFromHref(team.href, "IdEquipo"),
      played: Number(text(td[2])), points: Number(text(td[3])),
      wins: Number(text(td[4])), losses: Number(text(td[5])),
      matchesWon: Number(text(td[6])), matchesLost: Number(text(td[7])),
      setsWon: Number(text(td[8])), setsLost: Number(text(td[9])),
    };
  });
}

function parseMatches(html, round) {
  return rowList(html).filter((row) => row.className.includes("LineasRnk")).map((row, index) => {
    const td = cells(row.html), home = anchor(td[0]), away = anchor(td[3]), date = anchor(td[4]);
    const query = new URLSearchParams((anchor(td[5]).href || "").replace(/&amp;/gi, "&").split("?")[1] || "");
    const [datePart, time] = date.name.split(" - ");
    return {
      id: query.get("Partido"), round, home: home.name, homeId: idFromHref(home.href, "IdEquipo"),
      homeScore: text(td[1]), awayScore: text(td[2]), away: away.name, awayId: idFromHref(away.href, "IdEquipo"),
      date: datePart || "", time: time || "", venue: text(td[4]).replace(date.name, "").trim(),
      played: /^\d+$/.test(text(td[1])) && /^\d+$/.test(text(td[2])),
    };
  });
}

function roundCount(html) {
  const select = html.match(/<select\b[^>]*id=["']jornada["'][^>]*>([\s\S]*?)<\/select>/i)?.[1] || "";
  const values = [...select.matchAll(/<option\b[^>]*value=["'](\d+)["']/gi)].map((match) => Number(match[1]));
  return Math.max(1, ...values);
}

function parseDetail(html, fixture) {
  const rows = rowList(html), pairings = [];
  for (let i = 0; i < rows.length; i++) {
    const header = text(rows[i].html);
    const pairNumber = Number(header.match(/Pareja\s+(\d+)\s+Local/i)?.[1]);
    if (!pairNumber) continue;
    const first = rows.slice(i + 1).find((row) => row.className.includes("LineasRnk"));
    if (!first) continue;
    const firstCells = cells(first.html);
    const homePlayers = text(firstCells[0]).split(/\s+-\s+/).map((name) => name.trim()).filter(Boolean);
    const awayPlayers = text(firstCells[3]).split(/\s+-\s+/).map((name) => name.trim()).filter(Boolean);
    const setScores = [];
    if (/^\d+$/.test(text(firstCells[1])) && /^\d+$/.test(text(firstCells[2]))) {
      setScores.push([Number(text(firstCells[1])), Number(text(firstCells[2]))]);
    }
    let j = rows.indexOf(first) + 1;
    while (j < rows.length && !rows[j].className.includes("CabeceraRnk")) {
      if (rows[j].className.includes("LineasRnk")) {
        const scoreCells = cells(rows[j].html).map(text);
        if (/^\d+$/.test(scoreCells[0]) && /^\d+$/.test(scoreCells[1])) {
          setScores.push([Number(scoreCells[0]), Number(scoreCells[1])]);
        }
      }
      j++;
    }
    const homeSets = setScores.filter(([home, away]) => home > away).length;
    const awaySets = setScores.filter(([home, away]) => away > home).length;
    pairings.push({
      number: pairNumber, homePlayers, awayPlayers, setScores, homeSets, awaySets,
      winner: homeSets === awaySets ? null : homeSets > awaySets ? "home" : "away",
    });
  }
  return { ...fixture, pairings, detailAvailable: pairings.length > 0 };
}

module.exports = async function handler(_request, response) {
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  try {
    const standingsHtml = await fetchPage(`Ligas_Clasificacion.asp?Liga=${LEAGUE}&grupo=${GROUP}`);
    const firstRoundHtml = await fetchPage(`Ligas_Calendario.asp?grupo=${GROUP}&Liga=${LEAGUE}&jornada=1`);
    const rounds = roundCount(firstRoundHtml);
    const schedules = await Promise.all(Array.from({ length: rounds }, (_, i) =>
      i === 0 ? parseMatches(firstRoundHtml, 1) : fetchPage(`Ligas_Calendario.asp?grupo=${GROUP}&Liga=${LEAGUE}&jornada=${i + 1}`).then((html) => parseMatches(html, i + 1))));
    const allMatches = schedules.flat();
    const detailFixtures = allMatches.filter((match) => match.played && match.id);
    const details = await Promise.all(detailFixtures.map(async (fixture) => {
      try {
        const html = await fetchPage(`Ligas_Detalle.asp?Liga=${LEAGUE}&Jornada=${fixture.round}&Partido=${fixture.id}&Grupo=${GROUP}`);
        return parseDetail(html, fixture);
      } catch {
        return { ...fixture, pairings: [], detailAvailable: false };
      }
    }));
    const standings = parseStandings(standingsHtml);
    response.status(200).json({
      league: "LA LIGA FPIB 26/27 (MENORCA)", group: "DIVISIÓN AZUL MASCULINA", team: "SIX SEVEN",
      standings, teamStanding: standings.find((team) => team.teamId === TEAM_ID) || null,
      rounds, matches: allMatches, details,
      updatedAt: new Date().toISOString(),
      source: { standings: `${BASE}Ligas_Clasificacion.asp?Liga=${LEAGUE}&grupo=${GROUP}`, calendar: `${BASE}Ligas_Calendario.asp?grupo=${GROUP}&Liga=${LEAGUE}` },
    });
  } catch (error) {
    response.status(502).json({ error: "No se han podido consultar los datos de la federación.", detail: error.message });
  }
};
