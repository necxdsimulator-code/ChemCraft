/* ChemCraft browser game engine. Data source: the supplied JSON database. */
(() => {
  'use strict';
  const LEVELS = [1, 2, 3, 4, 5];
  const SAVE_KEY = 'chemcraft-save-v1';
  const state = {
    ready: false, loadingError: '', level: 1, xp: 0,
    compounds: [], reactions: [], missions: [], achievements: [],
    selectedReactants: [], discoveredCompounds: new Set(),
    discoveredReactions: new Set(), reactionHistory: [],
    tab: 'element', search: ''
  };
  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const formulaOf = c => c?.formula || c?.symbol || c?.name || c?.id || '?';
  const itemId = item => String(item && typeof item === 'object' ? (item.compound ?? item.id ?? item.name ?? '') : item).trim().toLowerCase();
  const normal = arr => (Array.isArray(arr) ? arr : []).map(itemId).filter(Boolean).sort().join('|');

  function loadSave() {
    try {
      const save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      state.level = Math.max(1, Math.min(5, Number(save.level) || 1));
      state.xp = Math.max(0, Number(save.xp) || 0);
      state.discoveredCompounds = new Set(Array.isArray(save.discoveredCompounds) ? save.discoveredCompounds : []);
      state.discoveredReactions = new Set(Array.isArray(save.discoveredReactions) ? save.discoveredReactions : []);
      state.reactionHistory = Array.isArray(save.reactionHistory) ? save.reactionHistory : [];
    } catch (_) { /* Start with a clean save if browser storage is malformed. */ }
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        level: state.level, xp: state.xp,
        discoveredCompounds: [...state.discoveredCompounds],
        discoveredReactions: [...state.discoveredReactions],
        reactionHistory: state.reactionHistory.slice(0, 100)
      }));
    } catch (_) { /* Private browsing may disable storage. */ }
  }
  async function readJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
    return response.json();
  }
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
        state.compounds.push(...data[i * 2].map(c => ({...c, level: LEVELS[i]})));
        state.reactions.push(...data[i * 2 + 1].map(r => ({...r, level: LEVELS[i]})));
      }
      state.missions = data[10];
      state.achievements = data[11];
      state.ready = true;
      // Starting elements are immediately available in the lab.
      state.compounds.filter(c => c.category === 'element' && c.level <= state.level).forEach(c => state.discoveredCompounds.add(String(c.id)));
      bindPlayControls();
      renderCompoundPicker(); renderReactants(); renderPreview(); updateStats();
      const msg = $('message'); if (msg) { msg.textContent = 'Database loaded. Choose up to 5 reactants.'; msg.style.color = '#42ed68'; }
      window.dispatchEvent(new CustomEvent('chemcraft:ready'));
    } catch (err) {
      console.error('ChemCraft data loading failed:', err);
      state.loadingError = err.message;
      const msg = $('message');
      if (msg) { msg.textContent = 'Could not load the chemistry database. Run this site through a web server and keep the JSON files beside index.html.'; msg.style.color = '#ffb2b2'; }
    }
  }
  function bindPlayControls() {
    const tabs = document.querySelectorAll('.segmented button');
    tabs.forEach((button, i) => button.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      button.classList.add('active');
      state.tab = i === 0 ? 'element' : 'compound';
      const search = $('compound-search'); if (search) search.placeholder = `Search ${state.tab === 'element' ? 'elements' : 'compounds'}...`;
      renderCompoundPicker();
    }));
    $('compound-search')?.addEventListener('input', e => { state.search = e.target.value.trim().toLowerCase(); renderCompoundPicker(); });
    $('react-button')?.addEventListener('click', performReaction);
    $('clear-button')?.addEventListener('click', () => { state.selectedReactants = []; renderReactants(); renderPreview(); setMessage('Reactants cleared.', true); });
  }
  function visibleCompounds() {
    return state.compounds.filter(c => {
      if (Number(c.level || 1) > state.level) return false;
      const isElement = c.category === 'element' || c.type === 'element' || c.isElement === true || c.category === 'elemental_form';
      return state.tab === 'element' ? isElement : !isElement;
    }).filter(c => `${c.name} ${c.formula} ${c.symbol} ${c.id}`.toLowerCase().includes(state.search));
  }
  function renderCompoundPicker() {
    const box = $('compound-list'); if (!box || !state.ready) return;
    box.innerHTML = '';
    const items = visibleCompounds();
    items.forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'compound-button';
      b.innerHTML = `<strong>${safe(formulaOf(c))}</strong><span>${safe(c.name || '')}</span>`;
      b.title = `Add ${c.name || formulaOf(c)} as a reactant`;
      b.addEventListener('click', () => {
        if (state.selectedReactants.length >= 5) { setMessage('You can add a maximum of 5 reactants.'); return; }
        state.selectedReactants.push(String(c.id)); renderReactants(); renderPreview(); setMessage(`${c.name || formulaOf(c)} added.` , true);
      });
      box.appendChild(b);
    });
    if (!items.length) box.innerHTML = '<p class="subtle" style="grid-column:1/-1">No matching items in this level.</p>';
  }
  function renderReactants() {
    const box = $('reactants'); if (!box) return;
    box.innerHTML = '';
    state.selectedReactants.forEach((id, index) => {
      const c = state.compounds.find(x => String(x.id) === id);
      const item = document.createElement('div'); item.className = 'reactant-item';
      item.innerHTML = `<span>${safe(formulaOf(c))}</span><button type="button" aria-label="Remove ${safe(formulaOf(c))}">×</button>`;
      item.querySelector('button').addEventListener('click', () => { state.selectedReactants.splice(index, 1); renderReactants(); renderPreview(); });
      box.appendChild(item);
    });
    if (!state.selectedReactants.length) box.innerHTML = '<span class="subtle">Select reactants from the left panel</span>';
  }
  function findReaction(ids) {
    const wanted = normal(ids);
    if (!wanted) return null;
    return state.reactions.find(r => {
      if (Number(r.level || 1) > state.level) return false;
      // The supplied database may repeat a reaction across levels; compare IDs
      // independent of order and support string/object reactant records.
      return normal(r.reactants || r.reactantIds || []) === wanted;
    }) || null;
  }
  function productLabel(reaction) {
    return (reaction.products || []).map(p => {
      const id = typeof p === 'string' ? p : (p.compound ?? p.id);
      const c = state.compounds.find(x => String(x.id) === String(id));
      const coefficient = typeof p === 'object' && Number(p.coefficient) > 1 ? `${p.coefficient} ` : '';
      return `${coefficient}${formulaOf(c || {id})}`;
    }).join(' + ') || 'Product not specified';
  }
  function renderPreview() {
    const box = $('product-preview'); if (!box) return;
    if (!state.selectedReactants.length) { box.textContent = 'Products appear here'; return; }
    const r = findReaction(state.selectedReactants);
    box.textContent = r ? productLabel(r) : '???';
  }
  function setMessage(text, good = false) {
    const box = $('message'); if (!box) return;
    box.textContent = text; box.style.color = good ? '#42ed68' : '#ffb2b2';
  }
  function performReaction() {
    if (!state.ready) { setMessage('The database is still loading.'); return; }
    if (!state.selectedReactants.length) { setMessage('Add at least one reactant first.'); return; }
    const reaction = findReaction(state.selectedReactants);
    if (!reaction) {
      setMessage('No matching reaction was found in the current level database. Try another combination.');
      const output = $('reaction-result'); if (output) output.innerHTML = '<div><div style="font-size:48px">🧪</div><div style="font-size:18px;margin-top:9px">No matching reaction</div><div style="margin-top:6px">This combination is not listed in the current database.</div></div>';
      return;
    }
    const productIds = (reaction.products || []).map(p => String(typeof p === 'string' ? p : (p.compound ?? p.id))).filter(id => id && id !== 'undefined');
    productIds.forEach(id => state.discoveredCompounds.add(id));
    state.discoveredReactions.add(String(reaction.id));
    state.xp += 10;
    // Every 100 XP advances one level, up to Level 5.
    state.level = Math.max(state.level, Math.min(5, Math.floor(state.xp / 100) + 1));
    state.reactionHistory.unshift({reactionID: reaction.id, equation: reaction.equation || '', timestamp: Date.now()});
    state.reactionHistory = state.reactionHistory.slice(0, 100);
    save();
    const output = $('reaction-result');
    if (output) output.innerHTML = `<div><div style="font-size:48px">⚗️</div><div style="font-size:20px;font-weight:900;margin-top:9px">Reaction found!</div><div style="font-size:22px;margin-top:8px">${safe(reaction.equation || productLabel(reaction))}</div><div style="margin-top:8px">+10 XP</div></div>`;
    if ($('reaction-equation')) $('reaction-equation').textContent = reaction.equation || '—';
    if ($('reaction-conditions')) $('reaction-conditions').textContent = reaction.conditions || 'Not specified';
    if ($('reaction-description')) $('reaction-description').textContent = reaction.description || reaction.explanation || reaction.type || 'Reaction from the supplied database.';
    state.selectedReactants = [];
    renderReactants(); renderPreview(); renderCompoundPicker(); updateStats();
    setMessage(`Success! You discovered ${productLabel(reaction)}. +10 XP`, true);
  }
  function updateStats() {
    const xp = $('xp'); if (xp) xp.textContent = String(state.xp);
    const cc = $('compound-count'); if (cc) cc.textContent = `${state.discoveredCompounds.size} / ${state.compounds.length}`;
    const rc = $('reaction-count'); if (rc) rc.textContent = `${state.discoveredReactions.size} / ${state.reactions.length}`;
    const xpFill = $('xp-fill'); if (xpFill) xpFill.style.width = `${Math.min(100, state.xp / 10)}%`;
    const cf = $('compound-fill'); if (cf) cf.style.width = `${state.compounds.length ? state.discoveredCompounds.size / state.compounds.length * 100 : 0}%`;
    const rf = $('reaction-fill'); if (rf) rf.style.width = `${state.reactions.length ? state.discoveredReactions.size / state.reactions.length * 100 : 0}%`;
  }
  // Expose the names the existing HTML UI expects.
  window.ChemCraft = window.ChemCraft || {};
  window.ChemCraft.Game = state;
  window.Game = state;
  window.ChemCraft.resetProgress = () => { localStorage.removeItem(SAVE_KEY); location.reload(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true}); else init();
})();
