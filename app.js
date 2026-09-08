(() => {
  const START_DATE = "2026-08-06";
  const START_WEIGHT = 142;
  const TARGET_DATE = "2027-08-06";
  const TARGET_WEIGHT = 109;
  const WEIGHT_KEY = "weight33.entries.v1";
  const CORE_KEY = "weight33.core.v1";
  const DAILY_GOAL = 15;

  const $ = (id) => document.getElementById(id);

  const viewHome = $("viewHome");
  const viewWeight = $("viewWeight");
  const viewCore = $("viewCore");
  const weightInput = $("weightInput");
  const dateInput = $("dateInput");
  const weightLog = $("weightLog");
  const coreLog = $("coreLog");
  const confirmDialog = $("confirmDialog");
  const confirmText = $("confirmText");
  const confirmOk = $("confirmOk");
  const confirmCancel = $("confirmCancel");
  const draftMinsEl = $("draftMins");
  const draftCancel = $("draftCancel");
  const draftConfirm = $("draftConfirm");

  let pendingDelete = null; // { type: 'weight'|'core', id }
  let draftMins = 0;

  function parseLocalDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatCs(iso) {
    const [y, m, d] = iso.split("-");
    return `${Number(d)}.${Number(m)}.${y}`;
  }

  function daysBetween(aIso, bIso) {
    const a = parseLocalDate(aIso);
    const b = parseLocalDate(bIso);
    return Math.round((b - a) / 86400000);
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function shiftIso(iso, days) {
    const d = parseLocalDate(iso);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }

  // —— navigation ——
  function showView(name) {
    const isHome = name === "home";
    const isWeight = name === "weight";
    const isCore = name === "core";

    viewHome.hidden = !isHome;
    viewWeight.hidden = !isWeight;
    viewCore.hidden = !isCore;
    viewHome.classList.toggle("hidden", !isHome);
    viewWeight.classList.toggle("hidden", !isWeight);
    viewCore.classList.toggle("hidden", !isCore);

    document.body.classList.toggle("theme-core", isCore);
    document.body.classList.toggle("theme-weight", isWeight);
    document.body.classList.toggle("screen-home", isHome);

    if (isWeight) renderWeight();
    if (isCore) renderCore();
  }

  $("openWeight").addEventListener("click", () => showView("weight"));
  $("openCore").addEventListener("click", () => showView("core"));
  document.querySelectorAll("[data-home]").forEach((btn) => {
    btn.addEventListener("click", () => showView("home"));
  });

  // —— weight ——
  function loadWeight() {
    try {
      const raw = localStorage.getItem(WEIGHT_KEY);
      if (!raw) return [{ id: "seed", date: START_DATE, weight: START_WEIGHT }];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [{ id: "seed", date: START_DATE, weight: START_WEIGHT }];
      }
      return parsed;
    } catch {
      return [{ id: "seed", date: START_DATE, weight: START_WEIGHT }];
    }
  }

  function saveWeight(entries) {
    localStorage.setItem(WEIGHT_KEY, JSON.stringify(entries));
  }

  function sortedWeight(entries) {
    return [...entries].sort((a, b) => {
      if (a.date === b.date) return a.weight - b.weight;
      return a.date < b.date ? -1 : 1;
    });
  }

  function latestWeight(entries) {
    const s = sortedWeight(entries);
    return s[s.length - 1] || null;
  }

  function weightOnOrBefore(entries, targetIso) {
    const s = sortedWeight(entries).filter((e) => e.date <= targetIso);
    if (s.length === 0) return null;
    return s[s.length - 1];
  }

  function deltaOverDays(entries, days) {
    const cur = latestWeight(entries);
    if (!cur) return null;
    const pastIso = shiftIso(cur.date, -days);
    const past = weightOnOrBefore(entries, pastIso);
    if (!past || past.date === cur.date) return null;
    return { delta: cur.weight - past.weight };
  }

  function formatDelta(kg) {
    if (kg == null || Number.isNaN(kg)) return "—";
    const sign = kg > 0 ? "+" : "";
    return `${sign}${kg.toFixed(1)}`;
  }

  function deltaClass(kg) {
    if (kg == null || Number.isNaN(kg)) return "flat";
    if (kg < -0.05) return "loss";
    if (kg > 0.05) return "gain";
    return "flat";
  }

  function plannedWeight(onIso) {
    const total = daysBetween(START_DATE, TARGET_DATE);
    const elapsed = Math.min(Math.max(daysBetween(START_DATE, onIso), 0), total);
    return START_WEIGHT - (START_WEIGHT - TARGET_WEIGHT) * (elapsed / total);
  }

  function renderWeight() {
    const entries = loadWeight();
    const cur = latestWeight(entries);
    const nowIso = cur ? cur.date : todayISO();

    $("deadline").textContent = `cíl ${formatCs(TARGET_DATE)}`;

    if (cur) {
      $("currentWeight").textContent = cur.weight.toFixed(1);
      const left = cur.weight - TARGET_WEIGHT;
      const daysLeft = daysBetween(nowIso, TARGET_DATE);
      const lost = START_WEIGHT - cur.weight;
      $("currentMeta").textContent =
        `z ${START_WEIGHT} · −${lost.toFixed(1)} · zbývá ${left.toFixed(1)} kg · ${daysLeft} d`;
    } else {
      $("currentWeight").textContent = "—";
      $("currentMeta").textContent = "";
    }

    const week = deltaOverDays(entries, 7);
    const month = deltaOverDays(entries, 30);
    const weekEl = $("weekDelta");
    const monthEl = $("monthDelta");
    weekEl.textContent = week ? formatDelta(week.delta) : "—";
    weekEl.className = `stat-value ${deltaClass(week?.delta)}`;
    monthEl.textContent = month ? formatDelta(month.delta) : "—";
    monthEl.className = `stat-value ${deltaClass(month?.delta)}`;

    const trendEl = $("trendValue");
    const trendSub = $("trendSub");
    const planLine = $("planLine");

    if (cur) {
      const plan = plannedWeight(nowIso);
      const vsPlan = cur.weight - plan;
      trendEl.textContent = formatDelta(vsPlan);
      trendEl.className = `stat-value ${vsPlan <= 0.05 ? "ahead" : "behind"}`;
      trendSub.textContent = vsPlan <= 0.05 ? "pod plánem" : "nad plánem";
      const daysLeft = Math.max(daysBetween(nowIso, TARGET_DATE), 1);
      const needWeek = ((cur.weight - TARGET_WEIGHT) / daysLeft) * 7;
      planLine.innerHTML =
        `plán <strong>${plan.toFixed(1)}</strong> kg · ` +
        `tempo <strong>${needWeek.toFixed(2)}</strong> kg/týd · ` +
        `cíl <strong>${TARGET_WEIGHT}</strong> kg`;
    } else {
      trendEl.textContent = "—";
      trendEl.className = "stat-value flat";
      trendSub.textContent = "";
      planLine.textContent = "";
    }

    weightLog.innerHTML = "";
    for (const e of sortedWeight(entries).reverse()) {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="date">${formatCs(e.date)}</span>
        <span class="val">${e.weight.toFixed(1)} kg</span>
        <button type="button" class="del" aria-label="smazat" data-id="${e.id}">×</button>
      `;
      weightLog.appendChild(li);
    }
  }

  $("saveBtn").addEventListener("click", () => {
    const w = Number(String(weightInput.value).replace(",", "."));
    const d = dateInput.value || todayISO();
    if (!Number.isFinite(w) || w < 40 || w > 300) {
      weightInput.focus();
      return;
    }
    const entries = loadWeight().filter((e) => e.date !== d);
    entries.push({ id: uid(), date: d, weight: Math.round(w * 10) / 10 });
    saveWeight(entries);
    weightInput.value = "";
    renderWeight();
  });

  $("exportWeightBtn").addEventListener("click", () => {
    const entries = sortedWeight(loadWeight());
    const lines = ["date,weight_kg", ...entries.map((e) => `${e.date},${e.weight.toFixed(1)}`)];
    downloadCsv("vaha-33.csv", lines);
  });

  weightLog.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".del");
    if (!btn) return;
    const id = btn.dataset.id;
    const e = loadWeight().find((x) => x.id === id);
    pendingDelete = { type: "weight", id };
    confirmText.textContent = e
      ? `Smazat ${e.weight.toFixed(1)} kg z ${formatCs(e.date)}?`
      : "Smazat záznam?";
    confirmDialog.showModal();
  });

  // —— core / minutes ——
  function loadCore() {
    try {
      const raw = localStorage.getItem(CORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveCore(entries) {
    localStorage.setItem(CORE_KEY, JSON.stringify(entries));
  }

  function sortedCore(entries) {
    return [...entries].sort((a, b) => {
      if (a.date === b.date) return (a.ts || 0) - (b.ts || 0);
      return a.date < b.date ? -1 : 1;
    });
  }

  /** Sum minutes per day for last N calendar days including today */
  function dailyTotals(entries, days) {
    const today = todayISO();
    const map = new Map();
    for (let i = 0; i < days; i++) {
      map.set(shiftIso(today, -i), 0);
    }
    for (const e of entries) {
      if (map.has(e.date)) map.set(e.date, map.get(e.date) + e.mins);
    }
    return map;
  }

  function minutesOn(entries, iso) {
    return entries.filter((e) => e.date === iso).reduce((s, e) => s + e.mins, 0);
  }

  function setDraft(n) {
    draftMins = Math.max(0, n);
    draftMinsEl.textContent = `${draftMins} min`;
    const active = draftMins > 0;
    draftCancel.disabled = !active;
    draftConfirm.disabled = !active;
  }

  function renderCore() {
    const entries = loadCore();
    const today = todayISO();
    const todayTotal = minutesOn(entries, today);
    const left = Math.max(DAILY_GOAL - todayTotal, 0);

    $("todayMins").textContent = String(todayTotal);
    $("coreMeta").textContent =
      todayTotal >= DAILY_GOAL
        ? `cíl ${DAILY_GOAL} · +${todayTotal - DAILY_GOAL} navíc`
        : `cíl ${DAILY_GOAL} · zbývá ${left} min`;

    const weekMap = dailyTotals(entries, 7);
    const monthMap = dailyTotals(entries, 30);
    const weekHit = [...weekMap.values()].filter((m) => m >= DAILY_GOAL).length;
    const monthHit = [...monthMap.values()].filter((m) => m >= DAILY_GOAL).length;
    const weekSum = [...weekMap.values()].reduce((a, b) => a + b, 0);
    const weekAvg = weekSum / 7;

    const weekEl = $("coreWeek");
    const monthEl = $("coreMonth");
    const avgEl = $("coreAvg");

    weekEl.textContent = `${weekHit}/7`;
    weekEl.className = `stat-value ${weekHit >= 7 ? "ok" : weekHit >= 4 ? "flat" : "bad"}`;
    monthEl.textContent = `${monthHit}/30`;
    monthEl.className = `stat-value ${monthHit >= 25 ? "ok" : monthHit >= 15 ? "flat" : "bad"}`;
    avgEl.textContent = weekAvg.toFixed(1);
    avgEl.className = `stat-value ${weekAvg >= DAILY_GOAL ? "ok" : "bad"}`;

    $("corePlan").innerHTML =
      `celkem 7 d <strong>${weekSum}</strong> min · ` +
      `dnes <strong>${todayTotal >= DAILY_GOAL ? "OK" : "−" + left}</strong>`;

    coreLog.innerHTML = "";
    for (const e of sortedCore(entries).reverse()) {
      const li = document.createElement("li");
      const hit = minutesOn(entries, e.date) >= DAILY_GOAL;
      li.innerHTML = `
        <span class="date">${formatCs(e.date)}${hit ? " · ≥15" : ""}</span>
        <span class="val">+${e.mins} min</span>
        <button type="button" class="del" aria-label="smazat" data-id="${e.id}">×</button>
      `;
      coreLog.appendChild(li);
    }
  }

  $("plus5").addEventListener("click", () => setDraft(draftMins + 5));

  draftCancel.addEventListener("click", () => setDraft(0));

  draftConfirm.addEventListener("click", () => {
    if (draftMins <= 0) return;
    const entries = loadCore();
    entries.push({
      id: uid(),
      date: todayISO(),
      mins: draftMins,
      ts: Date.now(),
    });
    saveCore(entries);
    setDraft(0);
    renderCore();
  });

  $("exportCoreBtn").addEventListener("click", () => {
    const entries = sortedCore(loadCore());
    const lines = ["date,minutes", ...entries.map((e) => `${e.date},${e.mins}`)];
    downloadCsv("cviceni-33.csv", lines);
  });

  coreLog.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".del");
    if (!btn || !btn.dataset.id) return;
    const id = btn.dataset.id;
    const e = loadCore().find((x) => x.id === id);
    pendingDelete = { type: "core", id };
    confirmText.textContent = e
      ? `Smazat +${e.mins} min z ${formatCs(e.date)}?`
      : "Smazat záznam?";
    confirmDialog.showModal();
  });

  // —— shared delete / export ——
  function downloadCsv(name, lines) {
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  confirmCancel.addEventListener("click", () => {
    pendingDelete = null;
    confirmDialog.close();
  });

  confirmOk.addEventListener("click", () => {
    if (pendingDelete?.type === "weight") {
      const next = loadWeight().filter((e) => e.id !== pendingDelete.id);
      saveWeight(next.length ? next : [{ id: "seed", date: START_DATE, weight: START_WEIGHT }]);
      renderWeight();
    }
    if (pendingDelete?.type === "core") {
      saveCore(loadCore().filter((e) => e.id !== pendingDelete.id));
      renderCore();
    }
    pendingDelete = null;
    confirmDialog.close();
  });

  // —— boot ——
  if (!localStorage.getItem(WEIGHT_KEY)) {
    saveWeight([{ id: "seed", date: START_DATE, weight: START_WEIGHT }]);
  }
  dateInput.value = todayISO();
  setDraft(0);
  showView("home");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
