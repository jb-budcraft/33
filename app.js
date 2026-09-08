(() => {
  const START_DATE = "2026-08-06";
  const START_WEIGHT = 142;
  const TARGET_DATE = "2027-08-06";
  const TARGET_WEIGHT = 109;
  const HEIGHT_M = 2.05;
  // NIH/ACSM ~0.45–0.9 kg/týd; u dny+cholesterol střed pásma (ne crash)
  const PACE_OPT_LO = 0.5;
  const PACE_OPT_HI = 0.75;
  const PACE_MAX = 0.9;
  const WEIGHT_KEY = "weight33.entries.v1";
  const CORE_KEY = "weight33.core.v1";
  const DAILY_GOAL = 15;
  const SEED = Object.freeze({ id: "seed", date: START_DATE, weight: START_WEIGHT });

  const $ = (id) => document.getElementById(id);
  const els = {
    home: $("viewHome"),
    weight: $("viewWeight"),
    core: $("viewCore"),
    weightInput: $("weightInput"),
    dateInput: $("dateInput"),
    weightLog: $("weightLog"),
    coreLog: $("coreLog"),
    dialog: $("confirmDialog"),
    confirmText: $("confirmText"),
    deadline: $("deadline"),
    currentWeight: $("currentWeight"),
    currentMeta: $("currentMeta"),
    weekDelta: $("weekDelta"),
    monthDelta: $("monthDelta"),
    trendValue: $("trendValue"),
    trendSub: $("trendSub"),
    paceValue: $("paceValue"),
    paceSub: $("paceSub"),
    planLine: $("planLine"),
    todayMins: $("todayMins"),
    coreMeta: $("coreMeta"),
    coreWeek: $("coreWeek"),
    coreMonth: $("coreMonth"),
    coreAvg: $("coreAvg"),
    corePlan: $("corePlan"),
    draftMins: $("draftMins"),
    draftCancel: $("draftCancel"),
    draftConfirm: $("draftConfirm"),
  };

  let pendingDelete = null;
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
    return Math.round((parseLocalDate(bIso) - parseLocalDate(aIso)) / 86400000);
  }

  const TOTAL_DAYS = daysBetween(START_DATE, TARGET_DATE);

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

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback();
    } catch {
      return fallback();
    }
  }

  function saveJSON(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function byDateAsc(a, b, tiebreak) {
    if (a.date === b.date) return tiebreak(a, b);
    return a.date < b.date ? -1 : 1;
  }

  function downloadCsv(name, lines) {
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function setStat(el, text, cls) {
    el.textContent = text;
    el.className = `stat-value ${cls}`;
  }

  function fillLog(listEl, rows) {
    const frag = document.createDocumentFragment();
    for (const row of rows) {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="date">${row.date}</span>` +
        `<span class="val">${row.val}</span>` +
        `<button type="button" class="del" aria-label="smazat" data-id="${row.id}">×</button>`;
      frag.appendChild(li);
    }
    listEl.replaceChildren(frag);
  }

  function askDelete(type, id, message) {
    pendingDelete = { type, id };
    els.confirmText.textContent = message;
    els.dialog.showModal();
  }

  // —— navigation ——
  const VIEWS = { home: els.home, weight: els.weight, core: els.core };

  function showView(name) {
    for (const [key, el] of Object.entries(VIEWS)) {
      el.hidden = key !== name;
    }
    document.body.classList.toggle("theme-core", name === "core");
    document.body.classList.toggle("theme-weight", name === "weight");

    try {
      if (name === "weight") {
        els.dateInput.value = els.dateInput.value || todayISO();
        renderWeight();
      } else if (name === "core") {
        renderCore();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // —— weight ——
  function loadWeight() {
    const seed = () => [{ ...SEED }];
    const parsed = loadJSON(WEIGHT_KEY, seed);
    if (!parsed.length) return seed();
    const cleaned = parsed
      .map((e) => {
        const weight = Number(e.weight);
        return {
          id: e.id || uid(),
          date: e.date,
          weight: Number.isFinite(weight) ? weight : null,
        };
      })
      .filter((e) => e.date && e.weight != null);
    return cleaned.length ? cleaned : seed();
  }

  function saveWeight(entries) {
    saveJSON(WEIGHT_KEY, entries);
  }

  function sortedWeight(entries) {
    return [...entries].sort((a, b) => byDateAsc(a, b, (x, y) => x.weight - y.weight));
  }

  function latestWeight(entries) {
    const s = sortedWeight(entries);
    return s[s.length - 1] || null;
  }

  function weightOnOrBefore(entries, targetIso) {
    let best = null;
    for (const e of sortedWeight(entries)) {
      if (e.date <= targetIso) best = e;
    }
    return best;
  }

  function deltaOverDays(entries, cur, days) {
    if (!cur) return null;
    const past = weightOnOrBefore(entries, shiftIso(cur.date, -days));
    if (!past || past.date === cur.date) return null;
    return cur.weight - past.weight;
  }

  function formatDelta(kg) {
    if (kg == null || Number.isNaN(kg)) return "—";
    return `${kg > 0 ? "+" : ""}${kg.toFixed(1)}`;
  }

  function deltaClass(kg) {
    if (kg == null || Number.isNaN(kg)) return "flat";
    if (kg < -0.05) return "loss";
    if (kg > 0.05) return "gain";
    return "flat";
  }

  function plannedWeight(onIso) {
    const elapsed = Math.min(Math.max(daysBetween(START_DATE, onIso), 0), TOTAL_DAYS);
    return START_WEIGHT - (START_WEIGHT - TARGET_WEIGHT) * (elapsed / TOTAL_DAYS);
  }

  function bmi(kg) {
    return kg / (HEIGHT_M * HEIGHT_M);
  }

  /** Weekly loss rate (positive = hubnutí) from ~lookback days, else from start. */
  function weeklyLossPace(entries, cur, lookbackDays) {
    if (!cur) return null;
    const past = weightOnOrBefore(entries, shiftIso(cur.date, -lookbackDays));
    const from = past && past.date !== cur.date
      ? past
      : { date: START_DATE, weight: START_WEIGHT };
    const days = Math.max(daysBetween(from.date, cur.date), 1);
    return ((from.weight - cur.weight) / days) * 7;
  }

  function paceBand(pace) {
    if (pace == null || Number.isNaN(pace)) return { label: "—", cls: "flat" };
    if (pace < PACE_OPT_LO) return { label: "pomalu", cls: "bad" };
    if (pace <= PACE_OPT_HI) return { label: "v pásmu", cls: "ok" };
    if (pace <= PACE_MAX) return { label: "horní okraj", cls: "flat" };
    return { label: "rychle", cls: "bad" };
  }

  function renderWeight() {
    const entries = loadWeight();
    const cur = latestWeight(entries);
    const nowIso = cur ? cur.date : todayISO();

    els.deadline.textContent = `cíl ${formatCs(TARGET_DATE)}`;

    if (cur) {
      const left = cur.weight - TARGET_WEIGHT;
      const daysLeft = daysBetween(nowIso, TARGET_DATE);
      const lost = START_WEIGHT - cur.weight;
      els.currentWeight.textContent = cur.weight.toFixed(1);
      els.currentMeta.textContent =
        `z ${START_WEIGHT} · −${lost.toFixed(1)} · zbývá ${left.toFixed(1)} kg · ${daysLeft} d · BMI ${bmi(cur.weight).toFixed(1)}`;

      const week = deltaOverDays(entries, cur, 7);
      const month = deltaOverDays(entries, cur, 30);
      setStat(els.weekDelta, formatDelta(week), deltaClass(week));
      setStat(els.monthDelta, formatDelta(month), deltaClass(month));

      const plan = plannedWeight(nowIso);
      const vsPlan = cur.weight - plan;
      const ahead = vsPlan <= 0.05;
      setStat(els.trendValue, formatDelta(vsPlan), ahead ? "ahead" : "behind");
      els.trendSub.textContent = "kg vs plán";

      const pace = weeklyLossPace(entries, cur, 30);
      const band = paceBand(pace);
      setStat(
        els.paceValue,
        pace == null ? "—" : pace.toFixed(2),
        band.cls
      );
      els.paceSub.textContent =
        pace == null ? "" : `${band.label} · ${PACE_OPT_LO}–${PACE_OPT_HI}`;

      const needWeek = (left / Math.max(daysLeft, 1)) * 7;
      els.planLine.innerHTML =
        `cílové tempo <strong>${needWeek.toFixed(2)}</strong> kg/týd · ` +
        `plán <strong>${plan.toFixed(1)}</strong> kg · ` +
        `cíl <strong>${TARGET_WEIGHT}</strong> · ` +
        `výzkum <strong>${PACE_OPT_LO}–${PACE_OPT_HI}</strong> kg/týd`;
    } else {
      els.currentWeight.textContent = "—";
      els.currentMeta.textContent = "";
      setStat(els.weekDelta, "—", "flat");
      setStat(els.monthDelta, "—", "flat");
      setStat(els.trendValue, "—", "flat");
      setStat(els.paceValue, "—", "flat");
      els.trendSub.textContent = "";
      els.paceSub.textContent = "";
      els.planLine.textContent = "";
    }

    fillLog(
      els.weightLog,
      sortedWeight(entries)
        .reverse()
        .map((e) => ({
          id: e.id,
          date: formatCs(e.date),
          val: `${e.weight.toFixed(1)} kg`,
        }))
    );
  }

  // —— core ——
  function loadCore() {
    return loadJSON(CORE_KEY, () => [])
      .map((e) => ({
        id: e.id || uid(),
        date: e.date,
        mins: Number(e.mins) || 0,
        ts: e.ts || 0,
      }))
      .filter((e) => e.date && e.mins > 0);
  }

  function saveCore(entries) {
    saveJSON(CORE_KEY, entries);
  }

  function sortedCore(entries) {
    return [...entries].sort((a, b) => byDateAsc(a, b, (x, y) => (x.ts || 0) - (y.ts || 0)));
  }

  function dailyTotals(entries, days) {
    const today = todayISO();
    const map = new Map();
    for (let i = 0; i < days; i++) map.set(shiftIso(today, -i), 0);
    for (const e of entries) {
      if (map.has(e.date)) map.set(e.date, map.get(e.date) + e.mins);
    }
    return map;
  }

  function setDraft(n) {
    draftMins = Math.max(0, n);
    els.draftMins.textContent = `${draftMins} min`;
    const on = draftMins > 0;
    els.draftCancel.disabled = !on;
    els.draftConfirm.disabled = !on;
  }

  function renderCore() {
    const entries = loadCore();
    const today = todayISO();
    const weekMap = dailyTotals(entries, 7);
    const monthMap = dailyTotals(entries, 30);
    const todayTotal = weekMap.get(today) || 0;
    const left = Math.max(DAILY_GOAL - todayTotal, 0);
    const weekVals = [...weekMap.values()];
    const monthVals = [...monthMap.values()];
    const weekHit = weekVals.filter((m) => m >= DAILY_GOAL).length;
    const monthHit = monthVals.filter((m) => m >= DAILY_GOAL).length;
    const weekSum = weekVals.reduce((a, b) => a + b, 0);
    const weekAvg = weekSum / 7;

    els.todayMins.textContent = String(todayTotal);
    els.coreMeta.textContent =
      todayTotal >= DAILY_GOAL
        ? `cíl ${DAILY_GOAL} · +${todayTotal - DAILY_GOAL} navíc`
        : `cíl ${DAILY_GOAL} · zbývá ${left} min`;

    setStat(els.coreWeek, `${weekHit}/7`, weekHit >= 7 ? "ok" : weekHit >= 4 ? "flat" : "bad");
    setStat(els.coreMonth, `${monthHit}/30`, monthHit >= 25 ? "ok" : monthHit >= 15 ? "flat" : "bad");
    setStat(els.coreAvg, weekAvg.toFixed(1), weekAvg >= DAILY_GOAL ? "ok" : "bad");

    els.corePlan.innerHTML =
      `celkem 7 d <strong>${weekSum}</strong> min · ` +
      `dnes <strong>${todayTotal >= DAILY_GOAL ? "OK" : "−" + left}</strong>`;

    const dayHit = new Map();
    for (const e of entries) dayHit.set(e.date, (dayHit.get(e.date) || 0) + e.mins);

    fillLog(
      els.coreLog,
      sortedCore(entries)
        .reverse()
        .map((e) => ({
          id: e.id,
          date: `${formatCs(e.date)}${(dayHit.get(e.date) || 0) >= DAILY_GOAL ? " · ≥15" : ""}`,
          val: `+${e.mins} min`,
        }))
    );
  }

  // —— events ——
  $("openWeight").addEventListener("click", () => showView("weight"));
  $("openCore").addEventListener("click", () => showView("core"));
  document.querySelectorAll("[data-home]").forEach((btn) => {
    btn.addEventListener("click", () => showView("home"));
  });

  $("saveBtn").addEventListener("click", () => {
    const w = Number(String(els.weightInput.value).replace(",", "."));
    const d = els.dateInput.value || todayISO();
    if (!Number.isFinite(w) || w < 40 || w > 300) {
      els.weightInput.focus();
      return;
    }
    const entries = loadWeight().filter((e) => e.date !== d);
    entries.push({ id: uid(), date: d, weight: Math.round(w * 10) / 10 });
    saveWeight(entries);
    els.weightInput.value = "";
    renderWeight();
  });

  $("exportWeightBtn").addEventListener("click", () => {
    const rows = sortedWeight(loadWeight()).map((e) => `${e.date},${e.weight.toFixed(1)}`);
    downloadCsv("vaha-33.csv", ["date,weight_kg", ...rows]);
  });

  els.weightLog.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".del");
    if (!btn) return;
    const e = loadWeight().find((x) => x.id === btn.dataset.id);
    askDelete(
      "weight",
      btn.dataset.id,
      e ? `Smazat ${e.weight.toFixed(1)} kg z ${formatCs(e.date)}?` : "Smazat záznam?"
    );
  });

  $("plus5").addEventListener("click", () => setDraft(draftMins + 5));
  els.draftCancel.addEventListener("click", () => setDraft(0));
  els.draftConfirm.addEventListener("click", () => {
    if (draftMins <= 0) return;
    const entries = loadCore();
    entries.push({ id: uid(), date: todayISO(), mins: draftMins, ts: Date.now() });
    saveCore(entries);
    setDraft(0);
    renderCore();
  });

  $("exportCoreBtn").addEventListener("click", () => {
    const rows = sortedCore(loadCore()).map((e) => `${e.date},${e.mins}`);
    downloadCsv("cviceni-33.csv", ["date,minutes", ...rows]);
  });

  els.coreLog.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".del");
    if (!btn?.dataset.id) return;
    const e = loadCore().find((x) => x.id === btn.dataset.id);
    askDelete(
      "core",
      btn.dataset.id,
      e ? `Smazat +${e.mins} min z ${formatCs(e.date)}?` : "Smazat záznam?"
    );
  });

  $("confirmCancel").addEventListener("click", () => {
    pendingDelete = null;
    els.dialog.close();
  });

  $("confirmOk").addEventListener("click", () => {
    if (pendingDelete?.type === "weight") {
      const next = loadWeight().filter((e) => e.id !== pendingDelete.id);
      saveWeight(next.length ? next : [{ ...SEED }]);
      renderWeight();
    } else if (pendingDelete?.type === "core") {
      saveCore(loadCore().filter((e) => e.id !== pendingDelete.id));
      renderCore();
    }
    pendingDelete = null;
    els.dialog.close();
  });

  // —— boot ——
  if (!localStorage.getItem(WEIGHT_KEY)) saveWeight([{ ...SEED }]);
  setDraft(0);
  showView("home");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").then((reg) => reg.update()).catch(() => {});
  }
})();
