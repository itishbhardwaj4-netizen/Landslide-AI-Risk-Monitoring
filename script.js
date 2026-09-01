/* LANDSAFE NER — Flask model-results dashboard. */
// Production Flask API hosted on Render. Change this only if the backend URL changes.
const API_BASE_URL = "https://landslide-ai-risk-monitoring.onrender.com";
const MODEL_DATA_URL = `${API_BASE_URL}/map-data`;
const colors = { critical: "#b42318", high: "#c65d00", moderate: "#9a6700", low: "#247a3d" };
const titles = {
  dashboard: ["Command Center", "Model results from original_data.csv"],
  riskmap: ["Risk Map", "Location-level model risk assessment"],
  locations: ["Monitored Locations", "Risk flags calculated by the Flask model"],
  addlocation: ["Add Location", "Run a demonstration location through the Flask model"],
  alerts: ["Expert Review", "High and critical model flags awaiting expert assessment"]
};

let locations = [];
let dashMap = null;
let fullMap = null;
let dashMarkers = null;
let fullMarkers = null;
let reviewItems = [];

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindFilters();
  bindAddLocationForm();
  setClock();
  setInterval(setClock, 30000);
  loadModelLocations();
});

async function loadModelLocations() {
  setLoadingState(true);
  try {
    const response = await fetch(MODEL_DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Flask returned ${response.status}`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.locations)) {
      throw new Error(data.error || "The model response did not contain locations.");
    }
    locations = data.locations.map(normalizeModelLocation).filter(location =>
      Number.isFinite(location.lat) && Number.isFinite(location.lng)
    );
    renderAll();
    setConnectionState(`MODEL DATA LOADED · ${locations.length} LOCATIONS`, true);
  } catch (error) {
    console.error("Could not load Flask model data:", error);
    renderAll();
    setConnectionState("FLASK DATA UNAVAILABLE", false);
    showMessage("Unable to load model data. Start Flask on port 5001 and refresh.");
  } finally {
    setLoadingState(false);
  }
}

function normalizeModelLocation(location) {
  const probability = Number(location.risk_probability);
  const score = Number.isFinite(probability) ? Math.round(probability * 100) : 0;
  const predictionDetected = Number(location.prediction) === 1;
  return {
    id: location.id,
    name: String(location.place || "Unknown location"),
    state: "Original CSV dataset",
    lat: Number(location.lat), lng: Number(location.lng), score,
    risk: riskFromScore(score),
    trigger: predictionDetected ? "Model flagged landslide risk" : "Model flagged lower risk",
    factors: {
      "Model prediction": predictionDetected ? "RISK DETECTED" : "LOWER RISK",
      "Risk probability": `${score}%`,
      "Rainfall total": numberText(location.rainfall_total_mm, "mm"),
      "Slope angle": numberText(location.slope_degrees, "°"),
      Elevation: numberText(location.elevation_m, "m")
    }
  };
}

function riskFromScore(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "moderate";
  return "low";
}

function numberText(value, unit) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)} ${unit}` : "Not available";
}

function renderAll() {
  rebuildReviewItems();
  renderMetrics();
  renderPriority();
  renderLocations();
  renderExpertReviews();
  initMaps();
  applyFilters();
}

function rebuildReviewItems() {
  const existingStatuses = new Map(reviewItems.map(item => [String(item.locationId), item.status]));
  reviewItems = locations
    .filter(location => location.risk === "high" || location.risk === "critical")
    .sort((a, b) => b.score - a.score)
    .map(location => ({
      locationId: location.id,
      name: location.name,
      score: location.score,
      level: location.risk,
      reason: location.trigger,
      status: existingStatuses.get(String(location.id)) || "pending"
    }));
}

function renderExpertReviews() {
  const container = document.getElementById("alertsList");
  if (!container) return;
  container.replaceChildren();
  const pending = reviewItems.filter(item => item.status === "pending").length;
  setText("reviewCount", `${pending} pending`);
  setText("reviewNavCount", pending);

  if (!reviewItems.length) {
    container.appendChild(emptyElement("No high or critical risk flags currently need review."));
    return;
  }

  reviewItems.forEach(item => {
    const card = document.createElement("article");
    card.className = "card alert";
    const status = item.status === "verified" ? "VERIFIED BY EXPERT" : item.status === "dismissed" ? "DISMISSED BY EXPERT" : "AWAITING EXPERT REVIEW";
    card.innerHTML = `<div><div class="severity" style="color:${colors[item.level]}">${item.level.toUpperCase()}</div><span class="status ${item.status}">${status}</span></div><div><h3>${escapeHTML(item.name)} · ${item.score}/100</h3><p>${escapeHTML(item.reason)}</p></div><div class="actions"></div>`;
    const actions = card.querySelector(".actions");
    if (item.status === "pending") {
      actions.appendChild(reviewButton("VERIFY", "btn", () => updateReviewStatus(item.locationId, "verified")));
      actions.appendChild(reviewButton("DISMISS", "btn danger", () => updateReviewStatus(item.locationId, "dismissed")));
    }
    actions.appendChild(reviewButton("VIEW MAP", "btn", () => {
      const location = locations.find(entry => String(entry.id) === String(item.locationId));
      if (location) openInspector(location);
    }));
    container.appendChild(card);
  });
}

function reviewButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function updateReviewStatus(locationId, status) {
  const item = reviewItems.find(entry => String(entry.locationId) === String(locationId));
  if (!item) return;
  item.status = status;
  renderExpertReviews();
  showMessage(status === "verified" ? "Risk verified by expert." : "Risk dismissed by expert.");
}

function renderMetrics() {
  const counts = locations.reduce((all, location) => {
    all[location.risk] += 1;
    return all;
  }, { critical: 0, high: 0, moderate: 0, low: 0 });
  setText("monitoredCount", locations.length);
  setText("highRiskCount", counts.high + counts.critical);
  setText("criticalCount", counts.critical);
  setText("modelStatus", locations.length ? "READY" : "WAITING");
  setText("locationCount", `${locations.length} monitored`);
}

function renderPriority() {
  const container = document.getElementById("priority");
  if (!container) return;
  container.replaceChildren();
  const list = [...locations].sort((a, b) => b.score - a.score).slice(0, 5);
  if (!list.length) return container.appendChild(emptyElement("Waiting for Flask model results."));
  list.forEach(location => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "priority";
    card.innerHTML = `<div class="p-row"><b>${escapeHTML(location.name)}</b><span class="p-score">${location.score}/100</span></div><div class="p-meta">${escapeHTML(location.trigger)}</div><span class="tag ${location.risk}">${location.risk}</span>`;
    card.addEventListener("click", () => openInspector(location));
    container.appendChild(card);
  });
}

function renderLocations() {
  const container = document.getElementById("locationsGrid");
  if (!container) return;
  container.replaceChildren();
  if (!locations.length) return container.appendChild(emptyElement("No model locations are available yet."));
  [...locations].sort((a, b) => b.score - a.score).forEach(location => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card loc-card";
    card.innerHTML = `<div class="loc-top"><div><h3>${escapeHTML(location.name)}</h3><div class="state">${escapeHTML(location.state)}</div></div><span class="tag ${location.risk}">${location.risk}</span></div><div class="loc-score" style="color:${colors[location.risk]}">${location.score}<small>/ 100</small></div><div class="trigger">${escapeHTML(location.trigger)}</div>`;
    card.addEventListener("click", () => openInspector(location));
    container.appendChild(card);
  });
}

function initMaps() {
  if (!window.L) return showMessage("Map library unavailable. Location results are still available below.");
  if (!dashMap) dashMap = createMap("dashMap", [25.7, 92.4], 6);
  if (!fullMap) fullMap = createMap("fullMap", [25.7, 92.4], 6);
  drawMarkers(dashMap, "dash");
  drawMarkers(fullMap, "full");
}

function createMap(elementId, center, zoom) {
  const map = L.map(elementId, { attributionControl: true }).setView(center, zoom);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: "© Esri"
  }).addTo(map);
  return map;
}

function drawMarkers(map, key, list = locations) {
  const existing = key === "dash" ? dashMarkers : fullMarkers;
  if (existing) map.removeLayer(existing);
  const layer = L.layerGroup().addTo(map);
  list.forEach(location => {
    const marker = L.marker([location.lat, location.lng], { icon: markerIcon(location.risk) });
    marker.bindTooltip(`<b>${escapeHTML(location.name)}</b><br>${location.score}/100 · ${location.risk.toUpperCase()}`);
    marker.on("click", () => openInspector(location));
    marker.addTo(layer);
  });
  if (key === "dash") dashMarkers = layer;
  else fullMarkers = layer;
}

function markerIcon(risk) {
  const color = colors[risk] || colors.low;
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #102029;box-shadow:0 0 0 1px ${color}aa,0 0 13px ${color}66"></span>`,
    iconSize: [16, 16], iconAnchor: [8, 8]
  });
}

function openInspector(location) {
  go("riskmap");
  const inspector = document.getElementById("inspector");
  if (!inspector) return;
  const factors = Object.entries(location.factors).map(([name, value]) =>
    `<div class="factor"><span>${escapeHTML(name)}</span><strong>${escapeHTML(value)}</strong></div>`
  ).join("");
  inspector.innerHTML = `<div class="inspect"><span class="tag ${location.risk}">MODEL RISK FLAG · ${location.risk.toUpperCase()}</span><h3>${escapeHTML(location.name)}</h3><div class="state">${escapeHTML(location.state)}</div><div class="big">${location.score}<small>/ 100 · ${location.risk.toUpperCase()}</small></div><div class="meter"><b style="width:${location.score}%;background:${colors[location.risk]}"></b></div><div class="eyebrow">MODEL INPUTS</div>${factors}<div class="recommend"><b>MODEL RESULT</b>${escapeHTML(location.trigger)}. Review this result with the original dataset and domain expertise.</div></div>`;
  if (fullMap) {
    fullMap.setView([location.lat, location.lng], Math.max(fullMap.getZoom(), 8));
    setTimeout(() => fullMap.invalidateSize(), 100);
  }
}

function bindNavigation() {
  document.addEventListener("click", event => {
    const target = event.target.closest("[data-page]");
    if (!target || !titles[target.dataset.page]) return;
    event.preventDefault();
    go(target.dataset.page);
  });
  document.getElementById("hamburger")?.addEventListener("click", () => document.getElementById("sidebar")?.classList.toggle("open"));
}

function go(page) {
  if (!titles[page]) return;
  document.querySelectorAll(".page").forEach(element => element.classList.remove("show"));
  document.getElementById(page)?.classList.add("show");
  document.querySelectorAll(".nav").forEach(nav => nav.classList.toggle("active", nav.dataset.page === page));
  setText("title", titles[page][0]);
  setText("subtitle", titles[page][1]);
  document.getElementById("sidebar")?.classList.remove("open");
  setTimeout(() => { dashMap?.invalidateSize(); fullMap?.invalidateSize(); }, 100);
}

function bindFilters() {
  document.getElementById("search")?.addEventListener("input", applyFilters);
  document.getElementById("level")?.addEventListener("change", applyFilters);
}

function bindAddLocationForm() {
  const form = document.getElementById("addLocationForm");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const place = String(formData.get("place") || "New location").trim();
    const payload = Object.fromEntries([
      "latitude", "longitude", "rainfall_total_mm", "slope_degrees", "elevation_m"
    ].map(name => [name, Number(formData.get(name))]));
    const result = document.getElementById("addLocationResult");
    const submit = document.getElementById("addLocationSubmit");

    if (Object.values(payload).some(value => !Number.isFinite(value))) {
      if (result) result.textContent = "Enter a valid value in every field.";
      return;
    }

    submit.disabled = true;
    submit.textContent = "RUNNING MODEL…";
    if (result) result.textContent = "Sending location to Flask…";

    try {
      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Prediction failed.");

      const location = normalizeModelLocation({
        id: `demo-${Date.now()}`,
        place,
        lat: payload.latitude,
        lng: payload.longitude,
        rainfall_total_mm: payload.rainfall_total_mm,
        slope_degrees: payload.slope_degrees,
        elevation_m: payload.elevation_m,
        prediction: data.prediction,
        risk_probability: data.risk_probability
      });
      location.state = "Demo location";
      locations.push(location);
      renderAll();
      if (result) result.textContent = `${place}: ${location.risk.toUpperCase()} risk flag (${location.score}/100). Added to the map.`;
      form.reset();
    } catch (error) {
      console.error("Could not add demo location:", error);
      if (result) result.textContent = `Prediction failed: ${error.message}`;
    } finally {
      submit.disabled = false;
      submit.textContent = "RUN MODEL PREDICTION";
    }
  });
}

function applyFilters() {
  if (!fullMap || !window.L) return;
  const search = document.getElementById("search")?.value.trim().toLowerCase() || "";
  const level = document.getElementById("level")?.value || "all";
  drawMarkers(fullMap, "full", locations.filter(location =>
    location.name.toLowerCase().includes(search) && (level === "all" || location.risk === level)
  ));
}

function setLoadingState(isLoading) { setText("modelStatus", isLoading ? "LOADING" : locations.length ? "READY" : "UNAVAILABLE"); }
function setConnectionState(message, connected) {
  setText("modelFeedText", message);
  document.getElementById("modelFeed")?.classList.toggle("demo", !connected);
}
function setClock() { setText("clock", new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })); }
function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
function showMessage(message) { const toast = document.getElementById("toast"); if (toast) { toast.textContent = message; toast.classList.add("show"); } }
function emptyElement(text) { const element = document.createElement("p"); element.className = "empty-message"; element.textContent = text; return element; }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
