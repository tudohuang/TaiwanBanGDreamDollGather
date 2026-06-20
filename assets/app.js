"use strict";
const CFG = window.SITE_CONFIG || {};
const $ = (s) => document.querySelector(s);
const REGION_ORDER = ["北部", "中部", "南部", "東部", "離島"];
const REGION_COLORS = { 北部: "#4a78c2", 中部: "#2f9e74", 南部: "#e2773f", 東部: "#9461b8", 離島: "#1aa3a3", 其他: "#8c8175" };
const BAND_COLORS = {
  "Poppin'Party": "#e24a82", "Afterglow": "#cf3030", "Hello Happy World!": "#cf8a16",
  "Pastel*Palettes": "#d264a6", "Roselia": "#3b4db0", "Morfonica": "#2f8fb3",
  "RAISE A SUILEN": "#b02e5c", "MyGO!!!!!": "#2f9183", "Ave Mujica": "#6e4a93",
};
const regionColor = (r) => REGION_COLORS[r] || REGION_COLORS["其他"];
const bandColor = (n) => BAND_COLORS[n] || "var(--ink-soft)";
const primaryColor = (d) => (d.topics[0] && BAND_COLORS[d.topics[0]]) || regionColor(d.region);
const state = { all: [], filtered: [], view: "list", map: null, markerLayer: null, calendar: null, mapGen: 0, calJumped: false, current: null };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const todayMidnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isPast = (d) => d.date && d.date < todayMidnight();
function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/), y, mo, da;
  if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
  else {
    m = s.match(/(\d{1,2})\D+(\d{1,2})/);
    if (!m) return null;
    mo = +m[1]; da = +m[2]; y = todayMidnight().getFullYear();
    if (new Date(y, mo - 1, da) < todayMidnight()) y += 1; // 已過 → 視為明年
  }
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const d = new Date(y, mo - 1, da); d.setHours(0, 0, 0, 0);
  return isNaN(d) ? null : d;
}
const dateParts = (d) => d.date
  ? { num: `${pad2(d.date.getMonth() + 1)}.${pad2(d.date.getDate())}`, wk: `週${WEEKDAY[d.date.getDay()]}` }
  : { num: d.dateStr || "日期未定", wk: "" };
const dateLabel = (d) => { const p = dateParts(d); return p.wk ? `${p.num}（${p.wk}）` : p.num; };
function priceInfo(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return { known: false, free: false, label: "—" };
  if (/^0+$/.test(v) || /免費|free|不?用錢/i.test(v)) return { known: true, free: true, label: "免費" };
  const num = v.match(/\d+/);
  return { known: true, free: false, label: num ? `NT$ ${num[0]}` : v };
}
const CITY_REGION = {
  基隆: "北部", 台北: "北部", 新北: "北部", 桃園: "北部", 新竹: "北部", 宜蘭: "北部",
  苗栗: "中部", 台中: "中部", 彰化: "中部", 南投: "中部", 雲林: "中部",
  嘉義: "南部", 台南: "南部", 高雄: "南部", 屏東: "南部", 花蓮: "東部", 台東: "東部",
  澎湖: "離島", 金門: "離島", 連江: "離島", 馬祖: "離島",
};
function regionFromCity(city) {
  const c = String(city || "").replace(/臺/g, "台").replace(/[市縣]/g, "").trim();
  const k = Object.keys(CITY_REGION).find((k) => c.startsWith(k));
  return k ? CITY_REGION[k] : "";
}
function threadsPermalink(link) {
  try {
    const u = new URL(String(link || "").trim());
    if (!/^(www\.)?threads\.(net|com)$/.test(u.hostname) || !/\/post\//.test(u.pathname)) return null;
    return "https://www.threads.net" + u.pathname.replace(/\/+$/, "");
  } catch (e) { return null; }
}
const GEO_KEY = "dollGather_geocache_v1";
let geoCache = {}; try { geoCache = JSON.parse(localStorage.getItem(GEO_KEY) || "{}"); } catch (e) {}
let geoChain = Promise.resolve();
function geoQueries(d) {
  const out = [], addr = (d.address || "").replace(/^\s*\d{3,6}\s*/, "").trim();
  if (addr) {
    out.push(addr);
    const noLi = addr.replace(/[一-龥]{1,4}里/, "").trim();   // 去掉「XX里」
    if (noLi && noLi !== addr) out.push(noLi);
    const street = (noLi.match(/^(.*?(?:路|街|大道))/) || [])[1]; // 退到街/路
    if (street) out.push(street);
  }
  const cv = [d.city, d.venue].filter(Boolean).join(" ").trim();
  if (cv) out.push(cv);
  if (d.city) out.push(d.city);
  return [...new Set(out.filter(Boolean))];
}
function geocode(q) {
  if (!q) return Promise.resolve(null);
  if (q in geoCache) return Promise.resolve(geoCache[q]);
  geoChain = geoChain.then(async () => {
    if (q in geoCache) return;
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tw&accept-language=zh-TW&q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } });
      const j = await r.json();
      geoCache[q] = j && j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
      localStorage.setItem(GEO_KEY, JSON.stringify(geoCache));
    } catch (e) { geoCache[q] = null; }
    await new Promise((res) => setTimeout(res, 1100));
  });
  return geoChain.then(() => geoCache[q]);
}
async function geocodeData(d) { for (const q of geoQueries(d)) { const c = await geocode(q); if (c) return c; } return null; }
const loadScript = (src) => new Promise((res, rej) => {
  const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s);
});
let _mapLibs, _calLibs;
const ensureMapLibs = () => window.L ? Promise.resolve() : (_mapLibs ||= loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"));
const ensureCalendarLibs = () => window.FullCalendar ? Promise.resolve() : (_calLibs ||= loadScript("https://cdn.jsdelivr.net/npm/fullcalendar@6.1.11/index.global.min.js"));
function isThisWeekend(date) {
  const t = todayMidnight(), sat = new Date(t);
  sat.setDate(t.getDate() + ((6 - t.getDay() + 7) % 7));
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
  return +date === +sat || +date === +sun;
}
function urgency(d) {
  if (!d.date) return null;
  const diff = Math.round((d.date - todayMidnight()) / 864e5);
  if (diff < 0) return null;
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (isThisWeekend(d.date)) return "本週末";
  return diff <= 7 ? `倒數 ${diff} 天` : null;
}
function capacityInfo(d) {
  const cap = parseInt(d.capacity, 10), cur = parseInt(d.current, 10);
  if (!isFinite(cap)) return null;
  if (isFinite(cur) && cur >= cap) return { t: "已額滿", full: true };
  if (isFinite(cur)) { const left = cap - cur; if (left > 0) return { t: `剩 ${left} 位`, low: left <= 5 }; }
  return { t: `限 ${cap} 位` };
}
const fmtDT = (dt) => `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`;
const fmtD = (dt) => `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}`;
const calLoc = (d) => [d.city, d.venue, d.address].filter(Boolean).join(" ");
function timeRange(d) {
  const m = d.date && String(d.time || "").match(/(\d{1,2})[:：](\d{2})(?:\s*[-~–至]\s*(\d{1,2})[:：](\d{2}))?/);
  if (!m) return null;
  const start = new Date(d.date); start.setHours(+m[1], +m[2], 0, 0);
  let end = m[3] != null ? new Date(d.date) : null;
  if (end) end.setHours(+m[3], +m[4], 0, 0);
  if (!end || end <= start) end = new Date(+start + 72e5); // 預設 2 小時
  return { start, end };
}
function calDates(d) {
  const tr = timeRange(d);
  if (tr) return { g: `${fmtDT(tr.start)}/${fmtDT(tr.end)}`, tr };
  if (d.date) { const n = new Date(d.date); n.setDate(n.getDate() + 1); return { g: `${fmtD(d.date)}/${fmtD(n)}`, tr: null }; }
  return null;
}
function googleCalUrl(d) {
  const c = calDates(d);
  if (!c) return null;
  return "https://calendar.google.com/calendar/render?" + new URLSearchParams({
    action: "TEMPLATE", text: d.name, dates: c.g, location: calLoc(d),
    details: [d.note, d.link && "詳情：" + d.link].filter(Boolean).join("\n"),
  });
}
function icsUri(d) {
  const c = calDates(d);
  if (!c) return null;
  const e = (s) => String(s || "").replace(/([\\,;])/g, "\\$1").replace(/\n/g, "\\n");
  const dt = c.tr
    ? `DTSTART:${fmtDT(c.tr.start)}\r\nDTEND:${fmtDT(c.tr.end)}`
    : `DTSTART;VALUE=DATE:${c.g.split("/")[0]}\r\nDTEND;VALUE=DATE:${c.g.split("/")[1]}`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//娃聚地圖//TW//", "BEGIN:VEVENT",
    `UID:${d.id}@dollgather`, `SUMMARY:${e(d.name)}`, dt, `LOCATION:${e(calLoc(d))}`,
    `DESCRIPTION:${e(d.note)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
}
const eventUrl = (d) => location.origin + location.pathname + "?e=" + d.id;
async function shareEvent(d) {
  const url = eventUrl(d);
  if (navigator.share) {
    try { return await navigator.share({ title: d.name, text: `${d.name}｜${dateLabel(d)} ${d.city}`, url }); }
    catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); toast("已複製連結，貼到脆分享吧"); }
  catch (e) { toast(url); }
}
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2000);
}
const HEADER_ALIAS = { 活動名稱: "名稱", 場次名稱: "名稱", 名字: "名稱", 報名連結: "連結", 網址: "連結" };
const splitMulti = (s) => String(s || "").split(/[,，、]\s*/).map((x) => x.trim()).filter(Boolean);
function eventId(d) { // 由內容算穩定 ID（分享連結用）
  const s = `${d.dateStr}|${d.name}|${d.city}|${d.venue}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function normalize(row) {
  const clean = {};
  for (const k in row) { const key = String(k).replace(/[（(].*?[)）]/g, "").trim(); if (key && clean[key] == null) clean[key] = row[k]; }
  for (const a in HEADER_ALIAS) if (clean[a] != null && clean[HEADER_ALIAS[a]] == null) clean[HEADER_ALIAS[a]] = clean[a];
  const g = (k) => String(clean[k] ?? "").trim();
  const SHORT = { 北: "北部", 中: "中部", 南: "南部", 東: "東部" };
  let region = SHORT[g("地區")] || g("地區");
  if (!REGION_COLORS[region]) region = regionFromCity(g("縣市")) || "其他";
  const lat = parseFloat(g("緯度")), lng = parseFloat(g("經度"));
  const o = {
    name: g("名稱"), date: parseDate(g("日期")), dateStr: g("日期"), time: g("時間"),
    region, city: g("縣市"), venue: g("地點"), address: g("地址"),
    lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null,
    topics: splitMulti(g("主題")), types: splitMulti(g("性質")),
    price: priceInfo(g("價錢")), capacity: g("名額"), current: g("目前人數"),
    organizer: g("主辦"), link: g("連結"), note: g("備註"),
  };
  o.id = eventId(o);
  return o;
}
async function loadData() {
  if (!CFG.SHEET_ID) return [];
  let url = `https://docs.google.com/spreadsheets/d/${CFG.SHEET_ID}/gviz/tq?tqx=out:csv`;
  if (CFG.SHEET_NAME) url += `&sheet=${encodeURIComponent(CFG.SHEET_NAME)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw 0;
    return Papa.parse(await res.text(), { header: true, skipEmptyLines: true }).data.map(normalize).filter((d) => d.name);
  } catch (e) {
    $("#status").textContent = "讀取資料失敗，請確認試算表已開「知道連結的任何人可檢視」。";
    return [];
  }
}
function applyFilters() {
  const q = $("#search").value.trim().toLowerCase();
  const region = $("#filter-region").value, topic = $("#filter-topic").value,
    type = $("#filter-type").value, price = $("#filter-price").value,
    upcoming = $("#filter-upcoming").checked;
  state.filtered = state.all.filter((d) => {
    if (region && d.region !== region) return false;
    if (topic && !d.topics.includes(topic)) return false;
    if (type && !d.types.includes(type)) return false;
    if (price === "free" && !d.price.free) return false;
    if (price === "paid" && d.price.free) return false;
    if (upcoming && isPast(d)) return false;
    if (q && ![d.name, d.venue, d.city, d.organizer, ...d.topics, ...d.types].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
  state.filtered.sort((a, b) => (a.date && b.date ? a.date - b.date : a.date ? -1 : b.date ? 1 : 0));
  $("#result-count").textContent = `全 ${state.filtered.length} 場`;
  renderActiveView();
}
function monthLabel(dt) {
  const t = todayMidnight();
  if (dt.getFullYear() === t.getFullYear()) return dt.getMonth() === t.getMonth() ? "本月" : `${dt.getMonth() + 1} 月`;
  return `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月`;
}
const tagsHTML = (d) => [
  ...d.topics.map((t) => `<span class="tg" style="color:${bandColor(t)}">${esc(t)}</span>`),
  ...d.types.map((t) => `<span class="tg tg-type">${esc(t)}</span>`),
].join('<span class="tg-sep">／</span>');
function entryHTML(d, i) {
  const dp = dateParts(d), u = urgency(d), cap = capacityInfo(d), tags = tagsHTML(d), meta = [];
  const placeLine = [[d.city, d.venue].filter(Boolean).map(esc).join("・"), d.time && esc(d.time)].filter(Boolean).join("　");
  if (cap) meta.push(`<span class="entry-cap${cap.full ? " full" : cap.low ? " low" : ""}">${esc(cap.t)}</span>`);
  if (d.price.known) meta.push(`<span class="entry-price${d.price.free ? " free" : ""}">${esc(d.price.label)}</span>`);
  return `
    <article class="entry${isPast(d) ? " is-past" : ""}" data-i="${i}" tabindex="0">
      <div class="entry-date">
        <span class="dnum" style="color:${primaryColor(d)}">${esc(dp.num)}</span>
        ${dp.wk ? `<span class="dwk">${esc(dp.wk)}</span>` : ""}
        ${u ? `<span class="urg">${esc(u)}</span>` : ""}
      </div>
      <div class="entry-main">
        <h3 class="entry-title">${esc(d.name)}<span class="entry-region"><i style="background:${regionColor(d.region)}"></i>${esc(d.region)}</span></h3>
        ${placeLine ? `<p class="entry-place">${placeLine}</p>` : ""}
        <p class="entry-foot">${tags ? `<span class="entry-tags">${tags}</span>` : ""}${meta.length ? `<span class="entry-meta">${meta.join("")}</span>` : ""}</p>
      </div>
    </article>`;
}
function renderList() {
  const box = $("#view-list");
  if (!state.filtered.length) {
    box.innerHTML = `<p class="empty">${state.all.length ? "這個條件下沒有娃聚，換個條件再找找。" : "還沒有娃聚資料 —— 點右上角「投稿娃聚」當第一筆。"}</p>`;
    return;
  }
  const today = todayMidnight(), items = state.filtered.map((d, i) => ({ d, i })), groups = [];
  let key = null;
  items.filter((x) => x.d.date && x.d.date >= today).forEach((x) => {
    const k = `${x.d.date.getFullYear()}-${x.d.date.getMonth()}`;
    if (k !== key) { key = k; groups.push({ label: monthLabel(x.d.date), items: [] }); }
    groups[groups.length - 1].items.push(x);
  });
  const past = items.filter((x) => x.d.date && x.d.date < today).reverse();
  const undated = items.filter((x) => !x.d.date);
  if (past.length) groups.push({ label: "已結束", items: past });
  if (undated.length) groups.push({ label: "日期未定", items: undated });
  box.innerHTML = groups.map((g) =>
    `<section class="group"><h2 class="group-head">${esc(g.label)}<span class="group-count">${g.items.length}</span></h2>${g.items.map((x) => entryHTML(x.d, x.i)).join("")}</section>`
  ).join("");
}
function ensureMap() {
  if (state.map) return;
  state.map = L.map("map", { scrollWheelZoom: false }).setView([23.7, 121], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(state.map);
  state.markerLayer = L.layerGroup().addTo(state.map);
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = () => (state.legendDiv = L.DomUtil.create("div", "map-legend"));
  legend.addTo(state.map);
}
function updateLegend() {
  if (!state.legendDiv) return;
  const present = [...REGION_ORDER, "其他"].filter((r) => state.filtered.some((d) => d.region === r));
  state.legendDiv.innerHTML = present.map((r) => `<span class="lg-item"><i style="background:${REGION_COLORS[r]}"></i>${r}</span>`).join("");
  state.legendDiv.style.display = present.length ? "" : "none";
}
function addMarker(d, i, pts) {
  const place = [d.city, d.venue].filter(Boolean).map(esc).join(" ");
  L.circleMarker([d.lat, d.lng], { radius: 7, color: "#fffdf8", weight: 2, fillColor: regionColor(d.region), fillOpacity: 1 })
    .bindPopup(`<p class="popup-title">${esc(d.name)}</p><p class="popup-meta">${esc(dateLabel(d))}${place ? "・" + place : ""}</p><span class="popup-link" data-i="${i}">查看詳情 →</span>`)
    .addTo(state.markerLayer);
  pts.push([d.lat, d.lng]);
}
async function renderMap() {
  await ensureMapLibs();
  if (state.view !== "map") return;
  ensureMap();
  state.map.invalidateSize();
  state.markerLayer.clearLayers();
  const gen = ++state.mapGen, pts = [], pending = [];
  state.filtered.forEach((d, i) => {
    if (d.lat != null && d.lng != null) return addMarker(d, i, pts);
    const hit = geoQueries(d).map((q) => geoCache[q]).find(Boolean);
    if (hit) { d.lat = hit.lat; d.lng = hit.lng; addMarker(d, i, pts); }
    else if (geoQueries(d).length) pending.push({ d, i });
  });
  const fit = () => pts.length && state.map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  fit(); updateLegend();
  if (pending.length) {
    state.map.attributionControl.setPrefix("定位中…");
    for (const { d, i } of pending) {
      const c = await geocodeData(d);
      if (gen !== state.mapGen) return; // 篩選已變更
      if (c) { d.lat = c.lat; d.lng = c.lng; addMarker(d, i, pts); fit(); }
    }
    state.map.attributionControl.setPrefix("");
  }
}
function ensureCalendar() {
  if (state.calendar) return;
  state.calendar = new FullCalendar.Calendar($("#calendar"), {
    initialView: "dayGridMonth", height: "auto", locale: "zh-tw", firstDay: 0,
    headerToolbar: { left: "prev,next today", center: "title", right: "" },
    buttonText: { today: "今天" }, titleFormat: { year: "numeric", month: "long" }, dayMaxEvents: 3,
    eventClick: (info) => openModal(state.filtered[info.event.extendedProps.idx]),
  });
  state.calendar.render();
}
async function renderCalendar() {
  await ensureCalendarLibs();
  if (state.view !== "calendar") return;
  ensureCalendar();
  state.calendar.removeAllEvents();
  const dated = state.filtered.filter((d) => d.date);
  dated.forEach((d) => state.calendar.addEvent({
    title: d.name, start: d.date, allDay: true, color: regionColor(d.region),
    extendedProps: { idx: state.filtered.indexOf(d) },
  }));
  if (!state.calJumped && dated.length) { // 首次跳到最早一場的月份
    state.calendar.gotoDate(dated.reduce((a, b) => (a.date < b.date ? a : b)).date);
    state.calJumped = true;
  }
  state.calendar.updateSize();
}
const detailRow = (label, value) => value ? `<div class="detail-row"><span class="label">${label}</span><span class="value">${value}</span></div>` : "";
function badgesHTML(d) {
  const rc = regionColor(d.region);
  let h = `<span class="badge region" style="color:${rc};background:${rc}1e">${esc(d.region)}</span>`;
  d.topics.forEach((t) => { const c = BAND_COLORS[t]; h += c ? `<span class="badge topic" style="color:${c};border-color:${c}55">${esc(t)}</span>` : `<span class="badge topic">${esc(t)}</span>`; });
  d.types.forEach((t) => (h += `<span class="badge type">${esc(t)}</span>`));
  if (d.price.known) h += `<span class="badge price${d.price.free ? " free" : ""}">${esc(d.price.label)}</span>`;
  if (isPast(d)) h += `<span class="badge past">已結束</span>`;
  return h;
}
function linkSection(link) {
  if (!link) return "";
  const perma = threadsPermalink(link);
  if (perma) return `<div class="threads-embed"><iframe src="${esc(perma)}/embed" scrolling="auto" frameborder="0" title="Threads 貼文"></iframe></div><a class="link-plain" href="${esc(link)}" target="_blank" rel="noopener">在 Threads 開啟原文 ↗</a>`;
  return `<a class="signup-btn" href="${esc(link)}" target="_blank" rel="noopener">前往報名 / 詳情 ↗</a>`;
}
function actionsHTML(d) {
  const g = googleCalUrl(d), ics = icsUri(d);
  return `<div class="modal-actions">${g ? `<a class="act-btn" href="${g}" target="_blank" rel="noopener">＋ 加入 Google 日曆</a>` : ""}<button class="act-btn" type="button" data-share>分享</button>${ics ? `<a class="act-ghost" href="${ics}" download="${esc(d.name)}.ics">.ics</a>` : ""}</div>`;
}
function openModal(d) {
  if (!d) return;
  state.current = d;
  const place = [d.city, d.venue].filter(Boolean).map(esc).join(" ");
  const people = (d.capacity || d.current) ? `${d.current ? esc(d.current) : "?"} / ${d.capacity ? esc(d.capacity) : "不限"}` : "";
  const mapLink = (d.address || place) ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address || place)}" target="_blank" rel="noopener">在 Google 地圖開啟 ↗</a>` : "";
  $("#modal-body").innerHTML =
    `<h2>${esc(d.name)}</h2><div class="detail-badges">${badgesHTML(d)}</div>` +
    detailRow("日期", `${esc(dateLabel(d))}${d.time ? " ・ " + esc(d.time) : ""}`) +
    detailRow("地點", [place, d.address ? esc(d.address) : "", mapLink].filter(Boolean).join("<br>")) +
    detailRow("主題", d.topics.map(esc).join("、")) +
    detailRow("性質", d.types.map(esc).join("、")) +
    detailRow("價錢", d.price.known ? esc(d.price.label) : "") +
    detailRow("名額", people) +
    detailRow("主辦", esc(d.organizer)) +
    detailRow("備註", esc(d.note).replace(/\n/g, "<br>")) +
    actionsHTML(d) + linkSection(d.link);
  $("#modal").hidden = false;
  try { history.replaceState(null, "", "?e=" + d.id); } catch (e) {}
}
const closeModal = () => { $("#modal").hidden = true; state.current = null; try { history.replaceState(null, "", location.pathname); } catch (e) {} };
function renderActiveView() {
  if (state.view === "map") renderMap();
  else if (state.view === "calendar") renderCalendar();
  else renderList();
}
function switchView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  ["list", "map", "calendar"].forEach((v) => ($(`#view-${v}`).hidden = v !== view));
  renderActiveView();
}
function buildFilterOptions() {
  const fill = (sel, vals) => vals.forEach((v) => $(sel).add(new Option(v, v)));
  fill("#filter-region", [...REGION_ORDER, "其他"].filter((r) => state.all.some((d) => d.region === r)));
  fill("#filter-topic", [...new Set(state.all.flatMap((d) => d.topics))].sort());
  fill("#filter-type", [...new Set(state.all.flatMap((d) => d.types))].sort());
}
function bindEvents() {
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));
  ["#search", "#filter-region", "#filter-topic", "#filter-type", "#filter-price", "#filter-upcoming"].forEach((sel) => {
    const el = $(sel);
    el.addEventListener(el.type === "search" ? "input" : "change", applyFilters);
  });
  $("#reset-filters").addEventListener("click", () => {
    $("#search").value = "";
    ["#filter-region", "#filter-topic", "#filter-type", "#filter-price"].forEach((s) => ($(s).value = ""));
    $("#filter-upcoming").checked = true;
    applyFilters();
  });
  const openFromIndex = (e) => { const el = e.target.closest(".entry"); if (el) openModal(state.filtered[+el.dataset.i]); };
  $("#view-list").addEventListener("click", openFromIndex);
  $("#view-list").addEventListener("keydown", (e) => { if (e.key === "Enter") openFromIndex(e); });
  $("#map").addEventListener("click", (e) => { const l = e.target.closest(".popup-link"); if (l) openModal(state.filtered[+l.dataset.i]); });
  $("#modal").addEventListener("click", (e) => {
    if (e.target.closest("[data-share]")) return void (state.current && shareEvent(state.current));
    if (e.target.dataset.close !== undefined) closeModal();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
async function init() {
  if (CFG.TITLE) { const n = $("#site-title .brand-name"); if (n) n.textContent = CFG.TITLE; document.title = CFG.TITLE; }
  if (CFG.SUBTITLE) $("#site-subtitle").textContent = CFG.SUBTITLE;
  if (CFG.FORM_URL) { const b = $("#submit-btn"); b.href = CFG.FORM_URL; b.hidden = false; }
  bindEvents();
  $("#view-list").innerHTML = `<p class="empty">正在把娃聚撈出來…</p>`;
  state.all = await loadData();
  buildFilterOptions();
  applyFilters();
  const params = new URLSearchParams(location.search);
  if (["map", "calendar"].includes(params.get("view"))) switchView(params.get("view"));
  const ev = params.get("e") && state.all.find((x) => x.id === params.get("e"));
  if (ev) openModal(ev);
}
init();
