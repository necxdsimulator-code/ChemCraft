/* ChemCraft game engine
   Works with the supplied Alpha-compatible index.html and JSON database.
   No external libraries required.
*/
(() => {
  "use strict";

  const STORAGE_KEY = "chemcraft-game-state-v1";
  const LEVEL_XP = [0, 0, 100, 300, 600, 1000];
  const $ = (id) => document.getElementById(id);

  const state = {
    level: 1,
    xp: 0,
    selected: [],
    filter: "element",
    compounds: [],
    reactions: [],
    compoundMap: new Map(),
    discoveredCompounds: new Set(),
    discoveredReactions: new Set(),
    reactionHistory: []
  };

  const escapeHTML = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      state.level = Math.max(1, Math.min(5, Number(saved.level) || 1));
      state.xp = Math.max(0, Number(saved.xp) || 0);
      state.discoveredCompounds = new Set(
        Array.isArray(saved.discoveredCompounds) ? saved.discoveredCompounds : []
      );
      state.discoveredReactions = new Set(
        Array.isArray(saved.discoveredReactions) ? saved.discoveredReactions : []
      );
      state.reactionHistory = Array.isArray(saved.reactionHistory) ? saved.reactionHistory : [];
    } catch (_) { /* start fresh if saved data is malformed */ }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        level: state.level,
        xp: state.xp,
        discoveredCompounds: [...state.discoveredCompounds],
        discoveredReactions: [...state.discoveredReactions],
        reactionHistory: state.reactionHistory.slice(0, 30)
      }));
    } catch (_) { /* storage may be disabled; game remains playable */ }
  }

  async function loadJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
    return response.json();
  }

  function normalizePart(part) {
    if (typeof part === "string") return { id: part, coefficient: 1 };
    return {
      id: String(part?.compound ?? part?.id ?? ""),
      coefficient: Math.max(1, Number(part?.coefficient) || 1)
    };
  }

  function expandParts(parts) {
    const expanded = [];
    for (const raw of (Array.isArray(parts) ? parts : [])) {
      const p = normalizePart(raw);
      if (!p.id) continue;
      for (let i = 0; i < p.coefficient; i++) expanded.push(p.id);
    }
    return expanded.sort();
  }

  function selectedKey(ids) {
    return [...ids].sort().join("|");
  }

  function formatParts(parts) {
    return (parts || []).map(raw => {
      const p = normalizePart(raw);
      const compound = state.compoundMap.get(p.id);
      const formula = compound?.formula || compound?.symbol || p.id;
      return `${p.coefficient > 1 ? p.coefficient : ""}${formula}`;
    }).join(" + ");
  }

  function visibleCompounds() {
    return state.compounds.filter(c => Number(c.level || 1) <= state.level);
  }

  function renderCompoundPicker() {
    const list = $("compound-list");
    if (!list) return;
    const query = ($("compound-search")?.value || "").trim().toLowerCase();
    const items = visibleCompounds().filter(c => {
      const isElement = c.category === "element" || c.category === "elemental_form";
      return state.filter === "element" ? isElement : !isElement;
    }).filter(c => `${c.name} ${c.formula} ${c.id}`.toLowerCase().includes(query));

    list.innerHTML = "";
    for (const c of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "compound-button";
      button.innerHTML = `<strong>${escapeHTML(c.formula || c.id)}</strong><span>${escapeHTML(c.name || "")}</span>`;
      button.title = `${c.name || c.id} (${c.formula || ""})`;
      button.addEventListener("click", () => addReactant(c.id));
      list.appendChild(button);
    }
    if (!items.length) {
      list.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:20px">No ${state.filter === "element" ? "elements" : "compounds"} found at this level.</div>`;
    }
  }

  function renderSelected() {
    const holder = $("reactants");
    if (!holder) return;
    holder.innerHTML = "";
    state.selected.forEach((id, index) => {
      const c = state.compoundMap.get(id);
      const item = document.createElement("div");
      item.className = "reactant-item";
      item.innerHTML = `<span>${escapeHTML(c?.formula || id)}</span><button type="button" aria-label="Remove ${escapeHTML(c?.name || id)}">×</button>`;
      item.querySelector("button").addEventListener("click", () => {
        state.selected.splice(index, 1);
        renderSelected();
        setMessage("");
      });
      holder.appendChild(item);
    });
    const preview = $("product-preview");
    if (preview) preview.textContent = state.selected.length ? `${state.selected.length} reactant${state.selected.length === 1 ? "" : "s"} selected` : "";
  }

  function setMessage(message, good = false) {
    const el = $("message");
    if (!el) return;
    el.textContent = message;
    el.style.color = good ? "#42ed68" : "#ffb2b2";
  }

  function addReactant(id) {
    if (state.selected.length >= 5) {
      setMessage("You can add a maximum of 5 reactants.");
      return;
    }
    state.selected.push(id);
    renderSelected();
    setMessage("");
  }

  function showReaction(reaction, isNew) {
    const result = $("reaction-result");
    if (!result) return;
    const products = (reaction.products || []).map(raw => {
      const p = normalizePart(raw);
      const c = state.compoundMap.get(p.id);
      return `<div class="product"><strong>${escapeHTML(p.coefficient > 1 ? `${p.coefficient} × ` : "")}${escapeHTML(c?.formula || p.id)}</strong><span>${escapeHTML(c?.name || p.id)}</span></div>`;
    }).join("");
    result.innerHTML = `
      <div class="reaction-card">
        ${isNew ? '<div class="new-reaction">NEW DISCOVERY</div>' : ""}
        <h2 class="equation">${escapeHTML(reaction.equation || formatParts(reaction.reactants) + " → " + formatParts(reaction.products))}</h2>
        <div class="products">${products}</div>
        <p style="color:var(--muted);font-size:13px">${escapeHTML(reaction.type || "Chemical reaction")}</p>
      </div>`;
  }

  function performReaction() {
    if (!state.selected.length) {
      setMessage("Select at least one reactant first.");
      return;
    }
    const chosen = selectedKey(state.selected);
    const reaction = state.reactions.find(r => selectedKey(expandParts(r.reactants)) === chosen);
    if (!reaction) {
      setMessage("No recorded reaction for this exact combination.");
      return;
    }

    const isNewReaction = !state.discoveredReactions.has(String(reaction.id));
    const newProducts = [];
    for (const raw of (reaction.products || [])) {
      const p = normalizePart(raw);
      if (!state.discoveredCompounds.has(p.id)) newProducts.push(p.id);
      state.discoveredCompounds.add(p.id);
    }
    state.discoveredReactions.add(String(reaction.id));

    if (isNewReaction) state.xp += 25;
    state.reactionHistory.unshift({
      reactionID: reaction.id,
      equation: reaction.equation || "",
      timestamp: Date.now()
    });
    state.reactionHistory = state.reactionHistory.slice(0, 30);

    while (state.level < 5 && state.xp >= LEVEL_XP[state.level + 1]) {
      state.level++;
    }

    showReaction(reaction, isNewReaction);
    setMessage(isNewReaction ? `Reaction discovered! +25 XP${newProducts.length ? ` · ${newProducts.length} new product(s)` : ""}` : "Reaction repeated successfully.", true);
    state.selected = [];
    renderSelected();
    renderCompoundPicker();
    updateStats();
    updateAchievements();
    saveProgress();
  }

  function clearReaction() {
    state.selected = [];
    renderSelected();
    setMessage("");
    const result = $("reaction-result");
    if (result) result.innerHTML = `<div><div style="font-size:62px;color:#47718b">⚗</div><div style="font-size:18px;margin-top:9px">No reaction yet.</div><div style="margin-top:6px">Select reactants and click React!</div></div>`;
  }

  function updateStats() {
    const xp = $("xp");
    const compounds = $("compound-count");
    const reactions = $("reaction-count");
    if (xp) xp.textContent = state.xp;
    if (compounds) compounds.textContent = `${state.discoveredCompounds.size} / ${state.compounds.length}`;
    if (reactions) reactions.textContent = `${state.discoveredReactions.size} / ${state.reactions.length}`;
    const setWidth = (id, value) => { const el = $(id); if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`; };
    setWidth("xp-fill", state.xp / 1000 * 100);
    setWidth("compound-fill", state.compounds.length ? state.discoveredCompounds.size / state.compounds.length * 100 : 0);
    setWidth("reaction-fill", state.reactions.length ? state.discoveredReactions.size / state.reactions.length * 100 : 0);
  }

  function updateAchievements() {
    const rows = document.querySelectorAll(".achievement");
    const progress = [
      state.discoveredReactions.size > 0 ? 100 : 0,
      Math.min(100, state.discoveredCompounds.size / 25 * 100),
      Math.min(100, state.discoveredReactions.size / 25 * 100),
      state.level === 5 ? 100 : state.level / 5 * 100,
      Math.min(100, state.discoveredCompounds.size / 100 * 100)
    ];
    rows.forEach((row, i) => {
      const pct = Math.round(progress[i] || 0);
      const status = row.querySelector(".achievement-progress");
      const fill = row.querySelector(".achievement-progress-fill");
      if (fill) fill.style.width = `${pct}%`;
      if (status) {
        const first = status.firstChild;
        if (first && first.nodeType === Node.TEXT_NODE) first.textContent = pct >= 100 ? "Unlocked" : "In progress";
        const label = status.querySelector("div[style]");
        if (label) label.textContent = `${pct}%`;
      }
    });
  }

  function bindControls() {
    document.querySelectorAll(".segmented button").forEach((button, index) => {
      button.addEventListener("click", () => {
        state.filter = index === 0 ? "element" : "compound";
        document.querySelectorAll(".segmented button").forEach((b, i) => b.classList.toggle("active", i === index));
        const search = $("compound-search");
        if (search) search.placeholder = index === 0 ? "Search elements..." : "Search compounds...";
        renderCompoundPicker();
      });
    });
    $("compound-search")?.addEventListener("input", renderCompoundPicker);
    $("react-button")?.addEventListener("click", performReaction);
    $("clear-button")?.addEventListener("click", clearReaction);
  }

  async function init() {
    loadProgress();
    bindControls();
    try {
      const [compounds, reactions] = await Promise.all([
        loadJSON("compounds.json"),
        loadJSON("reactions.json")
      ]);
      if (!Array.isArray(compounds) || !Array.isArray(reactions)) throw new Error("Database JSON has an unexpected format.");
      state.compounds = compounds;
      state.reactions = reactions;
      state.compoundMap = new Map(compounds.map(c => [String(c.id), c]));
      // The original 32 elemental entries are included in the compound database.
      for (const c of compounds) {
        if (c.category === "element" || c.category === "elemental_form") {
          state.discoveredCompounds.add(String(c.id));
        }
      }
      window.ChemCraft = { Game: state };
      window.Game = state;
      renderCompoundPicker();
      renderSelected();
      updateStats();
      updateAchievements();
      document.dispatchEvent(new CustomEvent("chemcraft:ready"));
    } catch (error) {
      console.error("ChemCraft startup error:", error);
      setMessage(`Database loading failed: ${error.message}`);
      const list = $("compound-list");
      if (list) list.innerHTML = `<div style="grid-column:1/-1;padding:18px;color:#ffb2b2">Could not load the database. Run this folder through a local web server or deploy it to a static host.</div>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();