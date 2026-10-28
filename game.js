/* ChemCraft browser game engine. Data source: the supplied JSON database.
 *
 * Batch 1 changes
 *  - Inventory model: the player only owns starter items (elements + raw
 *    materials flagged with "starter": <level> in the compound files) and
 *    compounds they have formed. The sidebar, inventory and stats all read the
 *    same set (state.discoveredCompounds).
 *  - Level system: reaching a level grants that level's starter items.
 *  - Reactions that share the same reactants but have different products are
 *    all reachable (previously only the first one ever fired).
 *
 * Batch 2 changes
 *  - The Elements/Compounds toggle is gone: the sidebar is one inventory list
 *    (elements first, then compounds with the newest first).
 *  - The "Products appear here" preview is gone: products are only revealed
 *    after the player presses React.
 *  - Tiles are squares; the text size of each tile is fitted to its content.
 *  - Compounds added by the last reaction are highlighted in the sidebar.
 *
 * Batch 3 changes
 *  - Achievements drive progression. Every level has 10 achievements (1 XP
 *    requirement, 2 general milestones, 7 compounds to form, tied to the
 *    Class 10 NCERT chemistry chapters). Completing all 10 unlocks the next
 *    level. See achievements.json for the data.
 *  - Achievements pay out XP when they are completed.
 *  - The XP stat shows the XP requirement of the current level.
 *
 * Batch 4 changes
 *  - Reactions match on the SET of reactants: adding a reactant twice to mirror
 *    a balanced equation (2H2 + O2) works exactly like adding it once.
 *  - routeTo() finds the shortest chain of reactions from the player's current
 *    inventory to any compound; the Achievements screen uses it for its
 *    "Show next step" help so no compound target can be a dead end.
 *  - Message colours come from CSS classes so they work in both themes.
 */
(() => {
  'use strict';

  const LEVELS = [1, 2, 3, 4, 5];
  const MAX_LEVEL = LEVELS[LEVELS.length - 1];
  const SAVE_KEY = 'chemcraft-save-v2';
  const MAX_REACTANTS = 5;

  const XP_NEW_REACTION = 10;
  const XP_NEW_COMPOUND = 5;
  const XP_BAR_MAX = 1000;

  const state = {
    ready: false, loadingError: '', level: 1, xp: 0,
    compounds: [], reactions: [], missions: [],
    achievements: [],                 // flat list, each entry carries its level
    achievementLevels: [],            // [{level, title, summary, achievements}]
    completedAchievements: new Set(),
    selectedReactants: [],
    discoveredCompounds: new Set(),   // everything in the player's inventory
    formedCompounds: new Set(),       // compounds produced by a reaction
    discoveredReactions: new Set(),   // canonical reaction ids
    reactionHistory: [], reactionsPerformed: 0,
    outcomes: [], totalCompounds: 0, totalReactions: 0,
    search: '', recent: new Set()   // recent = ids added by the last reaction
  };
  const byId = new Map();
  const outcomesByReactants = new Map();
  const cycleCounter = new Map();

  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const formulaOf = c => c?.formula || c?.symbol || c?.name || c?.id || '?';
  const itemId = item => String(item && typeof item === 'object' ? (item.compound ?? item.id ?? item.name ?? '') : item).trim().toLowerCase();
  // Reactants are matched as a SET (selecting H2 twice is the same as once).
  const normal = arr => [...new Set((Array.isArray(arr) ? arr : []).map(itemId).filter(Boolean))].sort().join('|');
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  const plain = s => String(s ?? '').toLowerCase().replace(/[₀-₉]/g, ch => String(SUB.indexOf(ch)));
  const isElementItem = c => !!c && (c.category === 'element' || c.category === 'elemental_form');
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------------------------------------------------------------- save */
  function loadSave() {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      const strings = v => (Array.isArray(v) ? v.map(String) : []);
      state.level = clamp(Number(data.level) || 1, 1, MAX_LEVEL);
      state.xp = Math.max(0, Number(data.xp) || 0);
      state.discoveredCompounds = new Set(strings(data.discoveredCompounds));
      state.formedCompounds = new Set(strings(data.formedCompounds));
      state.discoveredReactions = new Set(strings(data.discoveredReactions));
      state.reactionHistory = Array.isArray(data.reactionHistory) ? data.reactionHistory : [];
      state.reactionsPerformed = Math.max(0, Number(data.reactionsPerformed) || 0);
      state.completedAchievements = new Set(strings(data.completedAchievements));
    } catch (_) { /* Start with a clean save if browser storage is malformed. */ }
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        level: state.level, xp: state.xp,
        discoveredCompounds: [...state.discoveredCompounds],
        formedCompounds: [...state.formedCompounds],
        discoveredReactions: [...state.discoveredReactions],
        reactionHistory: state.reactionHistory.slice(0, 100),
        reactionsPerformed: state.reactionsPerformed,
        completedAchievements: [...state.completedAchievements]
      }));
    } catch (_) { /* Private browsing may disable storage. */ }
  }
  async function readJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
    return response.json();
  }

  /* ---------------------------------------------------------------- data */
  // Reactions with identical reactants AND products (only the coefficients or
  // wording differ) are one "outcome". Reactions with the same reactants but
  // different products are separate outcomes of the same combination.
  function buildOutcomes() {
    const groups = new Map();
    for (const r of state.reactions) {
      const reactants = [...new Set((r.reactants || r.reactantIds || []).map(itemId).filter(Boolean))];
      const products = (r.products || []).map(itemId).filter(Boolean);
      if (!reactants.length) continue;
      const rKey = normal(reactants);
      const key = `${rKey}=>${normal(products)}`;
      let o = groups.get(key);
      if (!o) {
        o = { key, rKey, id: String(r.id), reaction: r, reactants, products, level: Number(r.level) || 1, ids: [] };
        groups.set(key, o);
      }
      o.ids.push(String(r.id));
      if ((Number(r.level) || 1) < o.level) o.level = Number(r.level) || 1;
    }
    state.outcomes = [...groups.values()];
    outcomesByReactants.clear();
    for (const o of state.outcomes) {
      if (!outcomesByReactants.has(o.rKey)) outcomesByReactants.set(o.rKey, []);
      outcomesByReactants.get(o.rKey).push(o);
    }
  }

  // Everything that can ever be obtained from the starter items, used as the
  // denominator of the Compounds / Reactions stats.
  function computeTotals() {
    const have = new Set(state.compounds.filter(c => c.starter).map(c => String(c.id)));
    let changed = true;
    while (changed) {
      changed = false;
      for (const o of state.outcomes) {
        if (!o.reactants.every(id => have.has(id))) continue;
        for (const p of o.products) if (!have.has(p)) { have.add(p); changed = true; }
      }
    }
    state.totalCompounds = have.size;
    state.totalReactions = state.outcomes.filter(o => o.reactants.every(id => have.has(id))).length;
  }

  // Add every starter item that belongs to levels up to `level`.
  function grantStarters(level) {
    const granted = [];
    for (const c of state.compounds) {
      if (c.starter && Number(c.starter) <= level && !state.discoveredCompounds.has(String(c.id))) {
        state.discoveredCompounds.add(String(c.id));
        granted.push(c);
      }
    }
    return granted;
  }

  /* ----------------------------------------------------------- achievements */
  // Current and target value of one achievement (see achievements.json).
  function achievementProgress(a) {
    switch (a.type) {
      case 'xp': return { current: state.xp, target: a.value };
      case 'reactions_performed': return { current: state.reactionsPerformed, target: a.value };
      case 'compounds_formed': return { current: state.formedCompounds.size, target: a.value };
      case 'unique_reactions': return { current: state.discoveredReactions.size, target: a.value };
      case 'form_compound': return { current: state.formedCompounds.has(String(a.compound)) ? 1 : 0, target: 1 };
      default: return { current: 0, target: 1 };
    }
  }
  const levelAchievements = level => state.achievements.filter(a => a.level === level);
  const isAchievementDone = a => state.completedAchievements.has(a.id);
  function levelProgress(level = state.level) {
    const list = levelAchievements(level);
    const done = list.filter(isAchievementDone).length;
    return { level, done, total: list.length, fraction: list.length ? done / list.length : 0,
             complete: list.length > 0 && done === list.length, max: level >= MAX_LEVEL };
  }
  const isMastered = () => state.level >= MAX_LEVEL && levelProgress(MAX_LEVEL).complete;
  // The XP requirement of the current level doubles as the goal of the XP bar.
  function xpGoal() {
    const a = levelAchievements(state.level).find(x => x.type === 'xp');
    return a ? a.value : null;
  }
  // Items a level adds to the inventory (shown as the reward for finishing the level before it).
  const levelStarters = level => state.compounds.filter(c => Number(c.starter) === level);

  // Completes every achievement of the current level whose condition is met,
  // pays out its XP, and moves up a level once all 10 are done. Paying XP can
  // complete further achievements, so this repeats until nothing changes.
  function evaluateAchievements() {
    const unlocked = [], levelsGained = [], granted = [];
    let changed = true, guard = 0;
    while (changed && guard++ < 100) {
      changed = false;
      for (const a of levelAchievements(state.level)) {
        if (isAchievementDone(a)) continue;
        const { current, target } = achievementProgress(a);
        if (current < target) continue;
        state.completedAchievements.add(a.id);
        state.xp += Number(a.xp_reward) || 0;
        unlocked.push(a); changed = true;
      }
      if (state.level < MAX_LEVEL && levelProgress(state.level).complete) {
        state.level += 1;
        levelsGained.push(state.level);
        granted.push(...grantStarters(state.level));
        changed = true;
      }
    }
    return { unlocked, levelsGained, granted };
  }

  /* ----------------------------------------------------------------- init */
  async function init() {
    loadSave();
    try {
      const requests = [];
      for (const level of LEVELS) {
        requests.push(readJSON(`level${level}_compounds.json`));
        requests.push(readJSON(`level${level}_reactions.json`));
      }
      requests.push(readJSON('missions.json'), readJSON('achievements.json'));
      const data = await Promise.all(requests);
      for (let i = 0; i < LEVELS.length; i++) {
        state.compounds.push(...data[i * 2].map(c => ({...c, id: String(c.id), level: LEVELS[i]})));
        state.reactions.push(...data[i * 2 + 1].map(r => ({...r, level: LEVELS[i]})));
      }
      state.missions = data[LEVELS.length * 2];
      const achievementData = data[LEVELS.length * 2 + 1] || {};
      state.achievementLevels = (achievementData.levels || []).map(l => ({
        level: Number(l.level), title: l.title || `Level ${l.level}`, summary: l.summary || '',
        achievements: (l.achievements || []).map(a => ({...a, level: Number(l.level)}))
      }));
      state.achievements = state.achievementLevels.flatMap(l => l.achievements);
      state.compounds.forEach(c => byId.set(c.id, c));

      // Drop saved ids that no longer exist in the database.
      state.discoveredCompounds = new Set([...state.discoveredCompounds].filter(id => byId.has(id)));
      state.formedCompounds = new Set([...state.formedCompounds].filter(id => byId.has(id)));
      state.formedCompounds.forEach(id => state.discoveredCompounds.add(id));

      buildOutcomes();
      computeTotals();
      state.ready = true;
      grantStarters(state.level);
      // Levels the player has already passed count as finished (older saves).
      state.achievements.filter(a => a.level < state.level).forEach(a => state.completedAchievements.add(a.id));
      evaluateAchievements();
      grantStarters(state.level);
      save();

      bindPlayControls();
      renderCompoundPicker(); renderReactants(); updateStats();
      setMessage('Database loaded. Choose up to 5 reactants.', true);
      window.dispatchEvent(new CustomEvent('chemcraft:ready'));
      window.dispatchEvent(new CustomEvent('chemcraft:progress'));
    } catch (err) {
      console.error('ChemCraft data loading failed:', err);
      state.loadingError = err.message;
      const msg = $('message');
      if (msg) { msg.textContent = 'Could not load the chemistry database. Run this site through a web server and keep the JSON files beside index.html.'; msg.classList.add('msg-bad'); }
    }
  }

  /* -------------------------------------------------------------- sidebar */
  function bindPlayControls() {
    $('compound-search')?.addEventListener('input', e => { state.search = plain(e.target.value.trim()); renderCompoundPicker(); });
    $('react-button')?.addEventListener('click', performReaction);
    $('clear-button')?.addEventListener('click', () => { state.selectedReactants = []; renderReactants(); setMessage('Reactants cleared.', true); });
  }
  // Only items the player owns are listed: elements first (in the order they
  // were unlocked), then compounds with the newest one first.
  function visibleCompounds() {
    const items = [...state.discoveredCompounds].map(id => byId.get(id)).filter(Boolean);
    const elements = items.filter(isElementItem);
    const compounds = items.filter(c => !isElementItem(c)).reverse();
    return [...elements, ...compounds]
      .filter(c => plain(`${c.name} ${c.formula} ${c.symbol || ''} ${c.id}`).includes(state.search));
  }
  // Text size for a square tile, as a share of the tile width (see the
  // .compound-button CSS): longer formulas and longer words get smaller text.
  function fitSizes(c) {
    const f = [...String(formulaOf(c))].length;
    const fs = f <= 3 ? 25 : f === 4 ? 22 : f === 5 ? 20 : f === 6 ? 18 : f === 7 ? 16 : f === 8 ? 14.5 : f === 9 ? 13 : f === 10 ? 12 : 11;
    const longest = Math.max(0, ...String(c.name || '').split(/\s+/).map(w => w.length));
    const ns = longest >= 13 ? 10.5 : longest >= 11 ? 11.5 : longest >= 9 ? 12.5 : 13.5;
    return { fs, ns };
  }
  function renderCompoundPicker() {
    const box = $('compound-list'); if (!box || !state.ready) return;
    const scroll = box.scrollTop;
    box.innerHTML = '';
    const items = visibleCompounds();
    items.forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'compound-button';
      if (state.recent.has(String(c.id))) b.classList.add('just-added');
      const { fs, ns } = fitSizes(c);
      b.style.setProperty('--fs', fs); b.style.setProperty('--ns', ns);
      b.innerHTML = `<span class="tile"><strong class="tile-formula">${safe(formulaOf(c))}</strong><span class="tile-name">${safe(c.name || '')}</span></span>`;
      b.title = `Add ${c.name || formulaOf(c)} as a reactant`;
      b.addEventListener('click', () => {
        if (state.selectedReactants.length >= MAX_REACTANTS) { setMessage(`You can add a maximum of ${MAX_REACTANTS} reactants.`); return; }
        state.selectedReactants.push(String(c.id)); renderReactants(); setMessage(`${c.name || formulaOf(c)} added.`, true);
      });
      box.appendChild(b);
    });
    if (!items.length) box.innerHTML = '<p class="subtle" style="grid-column:1/-1">No matching items.</p>';
    box.scrollTop = scroll;
  }
  // Scroll the sidebar so the first compound added by the last reaction is visible.
  function revealNewItems() {
    const box = $('compound-list'); const el = box?.querySelector('.just-added'); if (!el) return;
    const b = box.getBoundingClientRect(), e = el.getBoundingClientRect();
    if (e.top < b.top || e.bottom > b.bottom) box.scrollTop += e.top - b.top - 8;
  }
  function renderReactants() {
    const box = $('reactants'); if (!box) return;
    box.innerHTML = '';
    state.selectedReactants.forEach((id, index) => {
      const c = byId.get(id);
      const item = document.createElement('div'); item.className = 'reactant-item';
      item.innerHTML = `<span>${safe(formulaOf(c || {id}))}</span><button type="button" aria-label="Remove ${safe(formulaOf(c || {id}))}">×</button>`;
      item.querySelector('button').addEventListener('click', () => { state.selectedReactants.splice(index, 1); renderReactants(); });
      box.appendChild(item);
    });
    if (!state.selectedReactants.length) box.innerHTML = '<span class="subtle">Select reactants from the left panel</span>';
  }

  /* ------------------------------------------------------------- reactions */
  // All outcomes of a reactant combination that are unlocked at this level.
  function availableOutcomes(ids) {
    const key = normal(ids);
    if (!key) return [];
    return (outcomesByReactants.get(key) || []).filter(o => o.level <= state.level);
  }
  // Prefer an outcome the player has not discovered yet; once all are known,
  // cycle through them so every outcome can be seen again.
  function pickOutcome(ids) {
    const list = availableOutcomes(ids);
    if (!list.length) return null;
    const fresh = list.find(o => !state.discoveredReactions.has(o.id));
    if (fresh) return fresh;
    const key = normal(ids);
    const n = cycleCounter.get(key) || 0;
    cycleCounter.set(key, n + 1);
    return list[n % list.length];
  }
  function productLabel(reaction) {
    return (reaction.products || []).map(p => {
      const id = typeof p === 'string' ? p : (p.compound ?? p.id);
      const c = byId.get(String(id));
      const coefficient = typeof p === 'object' && Number(p.coefficient) > 1 ? `${p.coefficient} ` : '';
      return `${coefficient}${formulaOf(c || {id})}`;
    }).join(' + ') || 'Product not specified';
  }
  function setMessage(text, good = false) {
    const box = $('message'); if (!box) return;
    box.textContent = text;
    box.classList.toggle('msg-good', !!good);
    box.classList.toggle('msg-bad', !good);
  }
  function performReaction() {
    if (!state.ready) { setMessage('The database is still loading.'); return; }
    if (!state.selectedReactants.length) { setMessage('Add at least one reactant first.'); return; }
    if (!state.selectedReactants.every(id => state.discoveredCompounds.has(id))) { setMessage('You do not own one of the selected reactants.'); return; }
    const outcome = pickOutcome(state.selectedReactants);
    const output = $('reaction-result');
    if (!outcome) {
      setMessage('No matching reaction was found. Try another combination.');
      if (output) output.innerHTML = '<div><div style="font-size:48px">🧪</div><div style="font-size:18px;margin-top:9px">No matching reaction</div><div style="margin-top:6px">This combination does not react at your current level.</div><div class="subtle" style="margin-top:10px;font-size:13px">Tip: some reactions need only one reactant, so try a compound on its own. You never need to add a reactant twice.</div></div>';
      return;
    }
    const reaction = outcome.reaction;
    const isNewReaction = !state.discoveredReactions.has(outcome.id);
    const newCompounds = [];
    outcome.products.forEach(id => {
      if (!byId.has(id)) return;
      if (!state.discoveredCompounds.has(id)) { state.discoveredCompounds.add(id); newCompounds.push(byId.get(id)); }
      state.formedCompounds.add(id);
    });
    state.recent = new Set(newCompounds.map(c => String(c.id)));
    state.reactionsPerformed += 1;
    state.discoveredReactions.add(outcome.id);
    const gained = (isNewReaction ? XP_NEW_REACTION : 0) + newCompounds.length * XP_NEW_COMPOUND;
    state.xp += gained;
    state.reactionHistory.unshift({reactionID: outcome.id, equation: reaction.equation || '', timestamp: Date.now()});
    state.reactionHistory = state.reactionHistory.slice(0, 100);
    const progress = evaluateAchievements();
    save();

    const names = newCompounds.map(c => safe(formulaOf(c))).join(', ');
    const more = availableOutcomes(outcome.reactants).some(o => !state.discoveredReactions.has(o.id));
    if (output) output.innerHTML = `<div>
      <div style="font-size:48px">⚗️</div>
      <div style="font-size:20px;font-weight:900;margin-top:9px">${isNewReaction ? 'New reaction discovered!' : 'Reaction repeated'}</div>
      <div style="font-size:22px;margin-top:8px">${safe(reaction.equation || productLabel(reaction))}</div>
      ${newCompounds.length ? `<div style="margin-top:8px">New in inventory: <strong>${names}</strong></div>` : ''}
      <div style="margin-top:8px">${gained ? `+${gained} XP` : 'No new discoveries'}</div>
      ${more ? '<div style="margin-top:8px" class="subtle">This combination can react in other ways too.</div>' : ''}
      ${progress.unlocked.map(a => `<div class="ok-text" style="margin-top:10px;font-weight:900">🏆 Achievement unlocked: ${safe(a.name)}${Number(a.xp_reward) ? ` (+${Number(a.xp_reward)} XP)` : ''}</div>`).join('')}
      ${progress.levelsGained.length ? `<div class="ok-text" style="margin-top:12px;font-size:18px;font-weight:900">Level ${state.level} unlocked!</div>` : ''}
    </div>`;
    if ($('reaction-equation')) $('reaction-equation').textContent = reaction.equation || '—';
    if ($('reaction-conditions')) $('reaction-conditions').textContent = reaction.conditions || 'Not specified';
    if ($('reaction-description')) $('reaction-description').textContent = reaction.description || reaction.explanation || reaction.type || 'Reaction from the supplied database.';
    state.selectedReactants = [];
    renderReactants(); renderCompoundPicker(); revealNewItems(); updateStats();
    window.dispatchEvent(new CustomEvent('chemcraft:progress'));
    if (progress.levelsGained.length) {
      setMessage(`Level ${state.level} unlocked! ${progress.granted.length} new item${progress.granted.length === 1 ? '' : 's'} added to your inventory.`, true);
    } else if (progress.unlocked.length) {
      setMessage(`Achievement unlocked: ${progress.unlocked.map(a => a.name).join(', ')}.`, true);
    } else {
      setMessage(newCompounds.length ? `You formed ${productLabel(reaction)}.` : `Reaction complete: ${productLabel(reaction)}.`, true);
    }
  }

  /* ------------------------------------------------------------ route helper */
  // Shortest chain of reactions that turns the player's CURRENT inventory into
  // `target`, using only reactions unlocked at the current level. Steps come
  // back in an order they can be performed, so steps[0] can be done right now.
  function routeTo(target) {
    target = String(target);
    if (!byId.has(target)) return { steps: [], reachable: false };
    if (state.formedCompounds.has(target)) return { steps: [], reachable: true, done: true };
    const have = new Set(state.discoveredCompounds);
    have.delete(target);                       // the target must be produced by a reaction
    const via = new Map();
    let grew = true;
    while (grew && !have.has(target)) {
      grew = false;
      const snapshot = new Set(have);          // one layer at a time keeps the route short
      for (const o of state.outcomes) {
        if (o.level > state.level || !o.reactants.every(r => snapshot.has(r))) continue;
        for (const p of o.products) if (!have.has(p)) { have.add(p); via.set(p, o); grew = true; }
      }
    }
    if (!have.has(target)) return { steps: [], reachable: false };
    const steps = [], seen = new Set();
    const walk = (id, root) => {
      if (!root && state.discoveredCompounds.has(id)) return;
      const o = via.get(id);
      if (!o || seen.has(o.id)) return;
      seen.add(o.id);
      o.reactants.forEach(r => walk(r, false));
      steps.push(o);
    };
    walk(target, true);
    return { steps, reachable: true, done: false };
  }
  // Plain-language description of one step of a route.
  function describeStep(o) {
    const nameOf = id => { const c = byId.get(id); return c ? `${c.name} (${formulaOf(c)})` : id; };
    return {
      reactants: o.reactants.map(nameOf),
      products: o.products.map(nameOf),
      equation: o.reaction.equation || '',
      alone: o.reactants.length === 1,
      several: availableOutcomes(o.reactants).length > 1
    };
  }

  /* ----------------------------------------------------------------- stats */
  function updateStats() {
    const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
    const fill = (id, pct) => { const el = $(id); if (el) el.style.width = `${clamp(pct, 0, 100)}%`; };
    const goal = xpGoal();
    set('xp', goal && state.xp < goal ? `${state.xp} / ${goal}` : String(state.xp));
    set('compound-count', `${state.discoveredCompounds.size} / ${state.totalCompounds}`);
    set('reaction-count', `${state.discoveredReactions.size} / ${state.totalReactions}`);
    fill('xp-fill', state.xp / (goal || XP_BAR_MAX) * 100);
    fill('compound-fill', state.totalCompounds ? state.discoveredCompounds.size / state.totalCompounds * 100 : 0);
    fill('reaction-fill', state.totalReactions ? state.discoveredReactions.size / state.totalReactions * 100 : 0);
    const lp = levelProgress();
    set('level', `${state.level} / ${MAX_LEVEL}`);
    fill('level-fill', lp.fraction * 100);
    set('level-detail', isMastered() ? 'All achievements complete. Master Chemist!' : `${lp.done} / ${lp.total} achievements complete.`);
  }

  // Expose the names the existing HTML UI expects.
  window.ChemCraft = window.ChemCraft || {};
  window.ChemCraft.Game = state;
  window.ChemCraft.updateStats = updateStats;
  window.ChemCraft.levelProgress = levelProgress;
  window.ChemCraft.achievementProgress = achievementProgress;
  window.ChemCraft.isAchievementDone = isAchievementDone;
  window.ChemCraft.levelStarters = levelStarters;
  window.ChemCraft.isMastered = isMastered;
  window.ChemCraft.routeTo = routeTo;
  window.ChemCraft.describeStep = describeStep;
  window.ChemCraft.SAVE_KEY = SAVE_KEY;
  window.Game = state;
  window.ChemCraft.resetProgress = () => { localStorage.removeItem(SAVE_KEY); location.reload(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
