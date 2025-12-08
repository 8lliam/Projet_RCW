/********************************************************************
 * 1. Parametres du SPARQL endpoint
 ********************************************************************/
const SPARQL_ENDPOINT = "/api/sparql"; // Proxy Django pour eviter CORS

const SPARQL_QUERY = `
PREFIX rcw:   <http://projet-rcw.com/ontology/>
PREFIX xsd:   <http://www.w3.org/2001/XMLSchema#>

SELECT ?annee ?codeLigne (AVG(?tauxRetard) AS ?tauxRetardMoyen)
WHERE {
  ?mesure a rcw:Ponctualite ;
          rcw:appartientALigne ?ligne ;
          rcw:tauxPonctualite ?tauxPonct ;
          rcw:dateAnalysePonctualite ?date .

  ?ligne rcw:ligne ?codeLigne .

  BIND(100.0 - xsd:decimal(?tauxPonct) AS ?tauxRetard)

  BIND( xsd:integer(SUBSTR(STR(?date), 7, 4)) AS ?annee )
}
GROUP BY ?annee ?codeLigne
ORDER BY ?codeLigne ?annee
`;

/********************************************************************
 * 1.b SPARQL pour les zones RER A/B/C/D
 ********************************************************************/
const SPARQL_QUERY_ZONES = `
PREFIX rcw:   <http://projet-rcw.com/ontology/>
PREFIX xsd:   <http://www.w3.org/2001/XMLSchema#>
PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
PREFIX geo:   <http://www.w3.org/2003/01/geo/wgs84_pos#>

SELECT ?ligne ?labelNorm (SAMPLE(?gareLabel) AS ?gareLabel) (AVG(xsd:decimal(?retardMoyen)) AS ?retardMoyenGare) (SAMPLE(?latVal) AS ?lat) (SAMPLE(?lonVal) AS ?lon)
WHERE {
  ?circulation a rcw:Circulation ;
               rcw:departDe ?gare ;
               rcw:retardMoyen ?retardMoyen .
  ?gare rdfs:label ?gareLabel .

  OPTIONAL {
    ?gare geo:lat ?latRaw ;
          geo:long ?lonRaw .
    BIND(xsd:decimal(?latRaw) AS ?latVal)
    BIND(xsd:decimal(?lonRaw) AS ?lonVal)
  }

  BIND(
    IF(STRSTARTS(STR(?circulation), "http://projet-rcw.com/resource/circulation/RERA/"), "A",
    IF(STRSTARTS(STR(?circulation), "http://projet-rcw.com/resource/circulation/RERB/"), "B",
    IF(STRSTARTS(STR(?circulation), "http://projet-rcw.com/resource/circulation/RERC/"), "C",
    IF(STRSTARTS(STR(?circulation), "http://projet-rcw.com/resource/circulation/RERD/"), "D", "autre")))) AS ?ligne
  )
  FILTER(?ligne IN ("A","B","C","D"))

  # Normalisation du label pour fusionner les variantes (ponctuation, accents)
  BIND(LCASE(REPLACE(STR(?gareLabel), "[^A-Za-z0-9]", " ")) AS ?labelNorm)

  # Filtre anti-valeurs aberrantes (supposées en minutes)
  FILTER(xsd:decimal(?retardMoyen) >= 0 && xsd:decimal(?retardMoyen) <= 180)
}
GROUP BY ?ligne ?labelNorm
ORDER BY DESC(?retardMoyenGare)
`;

/********************************************************************
 * 2. Fetch SPARQL
 ********************************************************************/
async function fetchSparqlData() {
  const url = SPARQL_ENDPOINT + "?query=" + encodeURIComponent(SPARQL_QUERY);

  const response = await fetch(url, {
    headers: { Accept: "application/sparql-results+json" },
  });

  if (!response.ok) {
    throw new Error("Erreur SPARQL: " + response.status);
  }

  return (await response.json()).results.bindings;
}

async function fetchZonesData() {
  const url = SPARQL_ENDPOINT + "?query=" + encodeURIComponent(SPARQL_QUERY_ZONES);

  const response = await fetch(url, {
    headers: { Accept: "application/sparql-results+json" },
  });

  if (!response.ok) {
    throw new Error("Erreur SPARQL zones: " + response.status);
  }

  return (await response.json()).results.bindings;
}

/********************************************************************
 * 3. Transformer les donnees pour Chart.js
 ********************************************************************/
function transformData(bindings) {
  const yearsSet = new Set();
  const linesMap = new Map();

  for (const b of bindings) {
    const year = parseInt(b.annee.value, 10);
    const line = b.codeLigne.value;
    const val = parseFloat(b.tauxRetardMoyen.value);

    yearsSet.add(year);
    if (!linesMap.has(line)) linesMap.set(line, {});
    linesMap.get(line)[year] = val;
  }

  const years = Array.from(yearsSet).sort();

  const datasets = [];
  const lineStats = {};
  const palette = [
    "#ff6b6b", "#22d3ee", "#60a5fa", "#fbbf24", "#f472b6", "#a78bfa",
    "#34d399", "#c084fc", "#fb7185", "#f97316", "#38bdf8", "#f59e0b",
  ];
let colorIndex = 0;

for (const [line, yearMap] of linesMap.entries()) {
  const data = years.map((y) => (yearMap[y] ?? null));
  const color = palette[colorIndex++ % palette.length];

    datasets.push({
      label: "Ligne " + line,
      data,
      borderColor: color,
      backgroundColor: color,
      tension: 0.25,
      spanGaps: true,
    });

    lineStats[line] = Object.entries(yearMap)
      .map(([year, value]) => ({
        year: parseInt(year, 10),
        value,
      }))
      .sort((a, b) => a.year - b.year);
  }

  return { years, datasets, lineStats };
}

/********************************************************************
 * 4. Chart.js
 ********************************************************************/
let retardChart = null;

function renderChart(years, datasets) {
  const ctx = document.getElementById("retardChart").getContext("2d");
  if (retardChart) retardChart.destroy();

  retardChart = new Chart(ctx, {
    type: "line",
    data: { labels: years, datasets },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { color: "#e5e7eb" } },
        y: {
          ticks: {
            color: "#e5e7eb",
            callback: (v) => v + "%",
          },
        },
      },
      plugins: {
        legend: {
          labels: { color: "#e5e7eb" },
        },
      },
    },
  });
}

/********************************************************************
 * 5. Analyse narrative + reponse a la question 1
 ********************************************************************/
function generateAnalysis(lineStats) {
  const question1Answer = document.getElementById("question1Answer");
  if (!question1Answer) return;

  const lines = Object.entries(lineStats);
  if (!lines.length) {
    question1Answer.textContent = "Impossible de conclure sans donnees.";
    return;
  }

  let improving = 0;
  let degrading = 0;
  let stable = 0;
  const trendDetails = [];

  lines.forEach(([line, points]) => {
    if (!points.length) {
      stable += 1;
      trendDetails.push({ line, delta: 0, direction: "stable", from: 0, to: 0 });
      return;
    }

    const first = points[0].value;
    const last = points[points.length - 1].value;
    const delta = +(last - first).toFixed(2);

    let direction = "stable";
    if (delta < -0.5) {
      direction = "baisse";
      improving += 1;
    } else if (delta > 0.5) {
      direction = "hausse";
      degrading += 1;
    } else {
      stable += 1;
    }

    trendDetails.push({ line, delta, direction, from: first, to: last });
  });

  let answer = "Trop peu de donnees pour conclure.";
  if (improving > degrading) {
    answer =
      "Globalement, le taux de retard diminue : les transports semblent devenir plus fiables au fil des ans.";
  } else if (degrading > improving) {
    answer =
      "Plusieurs lignes voient leurs retards augmenter : la fiabilite se degrade sur la periode observee.";
  } else if (improving === degrading && improving > 0) {
    answer =
      "Les tendances sont contrastees selon les lignes : certaines progressent, d'autres non, la fiabilite globale reste a surveiller.";
  }

  question1Answer.textContent = answer;
}

/********************************************************************
 * 6. Legende cliquable
 ********************************************************************/
function normalizeLabel(label = "") {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function pickTextColor(hex) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return "#0b1224";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0b1224" : "#f8fafc";
}

function renderLegend(lineStats) {
  const badgesContainer = document.getElementById("lineBadges");

  badgesContainer.innerHTML = "";

  const lines = Object.keys(lineStats);

  lines.forEach((line, index) => {
    const datasetColor =
      (retardChart && retardChart.data.datasets[index]?.borderColor) || "#6b7280";
    const badge = document.createElement("span");
    badge.className = "badge rounded-pill bg-secondary badge-line active";
    badge.textContent = "Ligne " + line;
    badge.style.backgroundColor = datasetColor;
    badge.style.borderColor = datasetColor;
    badge.style.color = pickTextColor(datasetColor);
    badge.style.opacity = "1";
    badgesContainer.appendChild(badge);

    badge.addEventListener("click", () => {
      if (retardChart && retardChart.isDatasetVisible(index)) {
        retardChart.hide(index);
        badge.classList.remove("active");
        badge.style.opacity = "0.4";
      } else if (retardChart) {
        retardChart.show(index);
        badge.classList.add("active");
        badge.style.opacity = "1";
      }
    });
  });
}

/********************************************************************
 * 7. Carte des zones impactees (RER A/B/C/D)
 ********************************************************************/
function renderZonesMap(bindings) {
  const container = document.getElementById("mapZones");
  if (!container) return;
  container.innerHTML = "";

  const byLine = { A: new Map(), B: new Map(), C: new Map(), D: new Map() };

  bindings.forEach((b) => {
    const line = b.ligne?.value;
    const labelRaw = b.gareLabel?.value || b.labelNorm?.value;
    const norm = normalizeLabel(b.labelNorm?.value || labelRaw || "");
    const retard = parseFloat(b.retardMoyenGare?.value);
    if (!line || !byLine[line] || !norm || Number.isNaN(retard)) return;
    const map = byLine[line];
    const current = map.get(norm);
    if (!current || retard > current.retard) {
      map.set(norm, { label: labelRaw || norm, retard });
    }
  });

  const colorByLine = {
    A: "#f97316",
    B: "#3b82f6",
    C: "#10b981",
    D: "#e11d48",
  };

  const grid = document.createElement("div");
  grid.className = "geo-grid";

  ["A", "B", "C", "D"].forEach((line) => {
    const card = document.createElement("div");
    card.className = "geo-card";

    const head = document.createElement("div");
    head.className = "geo-card-head";
    head.style.background = colorByLine[line] || "#6366f1";
    head.innerHTML = `<span class="fw-bold">RER ${line}</span>`;

    const body = document.createElement("div");
    body.className = "geo-card-body text-soft small";

    const sorted = Array.from(byLine[line].values())
      .sort((a, b) => b.retard - a.retard)
      .slice(0, 5);
    if (!sorted.length) {
      body.textContent = "Pas de donnees pour cette ligne.";
    } else {
      body.innerHTML = sorted
        .map(
          (item, idx) =>
            `<div class="geo-row"><span class="geo-rank">${idx + 1}</span><span class="geo-name">${item.label}</span></div>`
        )
        .join("");
    }

    card.appendChild(head);
    card.appendChild(body);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

/********************************************************************
 * 8. Heatmap simplifiee des hotspots
 ********************************************************************/
function pseudoPosition(label = "") {
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0;
  }
  const x = 10 + (h % 80); // range 10..89
  const y = 10 + ((h >> 8) % 80);
  return { x, y };
}

function renderHotspots(bindings) {
  const container = document.getElementById("mapHotspots");
  if (!container) return;
  container.innerHTML = "";

  const agg = new Map();
  bindings.forEach((b) => {
    const labelRaw = b.gareLabel?.value || b.labelNorm?.value;
    const norm = normalizeLabel(b.labelNorm?.value || labelRaw || "");
    const retard = parseFloat(b.retardMoyenGare?.value);
    if (!labelRaw || !norm || Number.isNaN(retard)) return;
    const current = agg.get(norm);
    if (!current || retard > current.retard) agg.set(norm, { label: labelRaw || norm, retard });
  });

  const spots = Array.from(agg.values()).sort((a, b) => b.retard - a.retard);
  if (!spots.length) {
    container.textContent = "Pas de donnees suffisantes pour tracer la heatmap.";
    return;
  }

  const max = spots[0].retard || 1;
  const threshold = Math.max(0.5, max * 0.35); // n'afficher que les gares les plus impactees
  const filtered = spots.filter((s) => s.retard >= threshold).slice(0, 40);

  filtered.forEach((s) => {
    const ratio = Math.max(0.1, s.retard / max);
    const size = 26 + ratio * 60;
    const intensity = Math.min(1, 0.3 + ratio * 0.7);
    const { x, y } = pseudoPosition(s.label);

    const spot = document.createElement("div");
    spot.className = "geo-spot";
    spot.style.width = `${size}px`;
    spot.style.height = `${size}px`;
    spot.style.left = `${x}%`;
    spot.style.top = `${y}%`;
    spot.style.background = `radial-gradient(circle, rgba(248,113,113,${intensity}) 0%, rgba(220,38,38,${intensity}) 45%, rgba(185,28,28,0.05) 100%)`;
    spot.title = `${s.label} - ${s.retard.toFixed(1)} min`;
    container.appendChild(spot);
  });
}

/********************************************************************
 * 9. Carte Leaflet (interactive) des hotspots
 ********************************************************************/
let leafletMap = null;

function pseudoLatLng(label = "") {
  // Reprojection deterministe d'un libelle dans une bbox IDF grossiere
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  const lat = 48.6 + (h % 4000) / 10000; // ~48.6 .. 48.999
  const lng = 1.9 + ((h >> 8) % 15000) / 10000; // ~1.9 .. 3.4
  return [lat, lng];
}

function renderLeafletHotspots(bindings) {
  const container = document.getElementById("mapLeaf");
  if (!container || typeof L === "undefined") return;

  if (!leafletMap) {
    leafletMap = L.map("mapLeaf", { zoomControl: true }).setView([48.86, 2.34], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      minZoom: 8,
      maxZoom: 15,
    }).addTo(leafletMap);
  }

  // Nettoyage des couches precedentes
  leafletMap.eachLayer((layer) => {
    if (layer instanceof L.CircleMarker) leafletMap.removeLayer(layer);
  });

  const agg = new Map();
  bindings.forEach((b) => {
    const label = b.gareLabel?.value || b.labelNorm?.value;
    const norm = normalizeLabel(b.labelNorm?.value || label || "");
    const retard = parseFloat(b.retardMoyenGare?.value);
    const lat = b.lat ? parseFloat(b.lat.value) : NaN;
    const lon = b.lon ? parseFloat(b.lon.value) : NaN;
    if (!label || !norm || Number.isNaN(retard)) return;
    const current = agg.get(norm);
    if (!current || retard > current.retard) agg.set(norm, { label, retard, lat, lon });
  });

  const points = Array.from(agg.values()).sort((a, b) => b.retard - a.retard);
  if (!points.length) return;

  const max = points[0].retard || 1;
  const threshold = Math.max(0.5, max * 0.35);
  const filtered = points.filter((p) => p.retard >= threshold).slice(0, 80);

  filtered.forEach((p) => {
    const hasCoords = !Number.isNaN(p.lat) && !Number.isNaN(p.lon);
    const [lat, lng] = hasCoords ? [p.lat, p.lon] : pseudoLatLng(p.label);
    const ratio = Math.max(0.1, p.retard / max);
    const radius = 10 + ratio * 18;
    const color = `rgba(220,38,38,${0.4 + ratio * 0.4})`;
    L.circleMarker([lat, lng], {
      radius,
      color: "#ef4444",
      fillColor: color,
      fillOpacity: 0.7,
      weight: 1,
    })
      .bindTooltip(`${p.label} — ${p.retard.toFixed(1)} min`)
      .addTo(leafletMap);
  });
}

/********************************************************************
 * 10. Initialisation
 ********************************************************************/
async function init() {
  const btn = document.getElementById("reloadBtn");
  btn.disabled = true;
  btn.textContent = "Chargement...";

  try {
    const [bindings, zones] = await Promise.all([
      fetchSparqlData(),
      fetchZonesData(),
    ]);
    const { years, datasets, lineStats } = transformData(bindings);

    renderChart(years, datasets);
    generateAnalysis(lineStats);
    renderLegend(lineStats);
    renderZonesMap(zones);
    renderHotspots(zones);
    renderLeafletHotspots(zones);
  } catch (err) {
    alert("Erreur SPARQL : " + err.message);
  }

  btn.disabled = false;
  btn.textContent = "Rafraichir les donnees";
}

document.getElementById("reloadBtn").addEventListener("click", init);
window.addEventListener("DOMContentLoaded", init);
