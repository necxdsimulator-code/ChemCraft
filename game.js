console.log('CHEMCRAFT JS LOADED');
'use strict';

const CONFIG = {
  MAX_REACTANTS: 5,
  STORAGE_KEY: 'chemcraft_save_v2',
  STARTING_SYMBOLS: new Set([
    'H','Li','Be','B','C','N','O','F','Na','Mg','Al','Si','P','S','Cl',
    'K','Ca','Ti','Fe','Co','Ni','Cu','Zn','Ga','Br','Au','I','Cs','Ba','Hg','Pb','Sn'
  ])
};

const Game = {
  compounds: [],
  reactions: [],
  missions: [],
  achievements: [],
  compoundMap: new Map(),
  reactionMap: new Map(),
  selectedReactants: [],
  discoveredCompounds: new Set(),
  discoveredReactions: new Set(),
  currentXP: 0,
  level: 1,
  reactionHistory: [],
  initialized: false
};

async function loadJSON(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Could not load ${path}: HTTP ${r.status}`);
  return r.json();
}

async function loadDatabase() {
  const compounds = await loadJSON('compounds.json');
  const reactions = await loadJSON('reactions.json');
  Game.compounds = Array.isArray(compounds) ? compounds : (compounds.compounds || []);
  Game.reactions = Array.isArray(reactions) ? reactions : (reactions.reactions || []);

  // Optional files. They are NOT required for the chemistry engine.
  try {
    const missions = await loadJSON('missions.json');
    Game.missions = Array.isArray(missions) ? missions : (missions.missions || []);
  } catch (_) { Game.missions = []; }
  try {
    const achievements = await loadJSON('achievements.json');
    Game.achievements = Array.isArray(achievements) ? achievements : (achievements.achievements || []);
  } catch (_) { Game.achievements = []; }

  console.log(`Compounds loaded: ${Game.compounds.length}`);
  console.log(`Reactions loaded: ${Game.reactions.length}`);
}

function buildIndexes() {
  Game.compoundMap.clear();
  Game.reactionMap.clear();
  for (const c of Game.compounds) if (c?.id) Game.compoundMap.set(String(c.id), c);
  for (const r of Game.reactions) if (r?.id) Game.reactionMap.set(String(r.id), r);
}

function getCompound(id) { return Game.compoundMap.get(String(id)); }
function getCompoundName(id) {
  const c = getCompound(id);
  return c?.name || c?.common_name || c?.formula || String(id);
}
function getCompoundFormula(id) {
  const c = getCompound(id);
  return c?.formula || c?.name || String(id);
}

/*
   For gameplay, use the chemically relevant elemental form where the
   database has one. Examples: H -> H2, N -> N2, O -> O2, Cl -> Cl2,
   F -> F2, Br -> Br2, I -> I2, P -> P4, S -> S8.
   Monatomic elements such as C, Na, K, Fe, Ag, etc. remain unchanged.
*/
const PREFERRED_ELEMENTAL_FORMS = {
  H: 'h2',
  N: 'n2',
  O: 'o2',
  F: 'f2',
  Cl: 'cl2',
  Br: 'br2',
  I: 'i2',
  P: 'p4',
  S: 's8'
};

function isElement(c) {
  if (!c) return false;
  if (c.category === 'element' || c.type === 'element' || c.category === 'elemental_form') return true;
  return CONFIG.STARTING_SYMBOLS.has(String(c.formula || '').trim());
}

function getElementBaseSymbol(c) {
  if (!c) return '';
  if (c.symbol) return String(c.symbol).trim();
  const formula = String(c.formula || '').trim();
  const match = formula.match(/^([A-Z][a-z]?)/);
  return match ? match[1] : '';
}

function getPreferredElementId(c) {
  if (!c) return null;

  const base = getElementBaseSymbol(c);
  const preferredId = PREFERRED_ELEMENTAL_FORMS[base];

  if (!preferredId) return String(c.id);

  const preferred = Game.compoundMap.get(preferredId);
  return preferred ? preferredId : String(c.id);
}

function getStartingElements() {
  const ids = new Set();

  for (const c of Game.compounds) {
    if (!c || !c.id || !isElement(c)) continue;

    const formula = String(c.formula || '').trim();
    const symbol = String(c.symbol || '').trim();

    if (!CONFIG.STARTING_SYMBOLS.has(formula) && !CONFIG.STARTING_SYMBOLS.has(symbol)) {
      continue;
    }

    // Keep the atomic form available for compatibility, but also seed the
    // preferred molecular form so its card can actually be selected.
    ids.add(String(c.id));

    const preferredId = getPreferredElementId(c);
    if (preferredId) ids.add(preferredId);
  }

  return [...ids];
}

function saveGame() {
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
    discoveredCompounds: [...Game.discoveredCompounds],
    discoveredReactions: [...Game.discoveredReactions],
    currentXP: Game.currentXP,
    level: Game.level,
    reactionHistory: Game.reactionHistory.slice(0, 100)
  }));
}

function loadSave() {
  // Always seed the inventory with the requested elements.
  Game.discoveredCompounds = new Set(getStartingElements());
  Game.discoveredReactions = new Set();
  Game.currentXP = 0;
  Game.level = 1;
  Game.reactionHistory = [];

  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return;
    const save = JSON.parse(raw);

    for (const id of (save.discoveredCompounds || [])) {
      if (Game.compoundMap.has(String(id))) Game.discoveredCompounds.add(String(id));
    }
    for (const id of (save.discoveredReactions || [])) Game.discoveredReactions.add(String(id));
    Game.currentXP = Number(save.currentXP) || 0;
    Game.level = Number(save.level) || 1;
    Game.reactionHistory = Array.isArray(save.reactionHistory) ? save.reactionHistory : [];
  } catch (e) {
    console.warn('Invalid save; starting fresh.', e);
  }
}

function resetGame() {
  if (!confirm('Are you sure you want to erase your ChemCraft progress?')) return;
  localStorage.removeItem(CONFIG.STORAGE_KEY);
  Game.selectedReactants = [];
  Game.discoveredCompounds = new Set(getStartingElements());
  Game.discoveredReactions = new Set();
  Game.currentXP = 0;
  Game.level = 1;
  Game.reactionHistory = [];
  saveGame();
  refreshUI();
  showMessage('Game reset. All starting elements are available.');
}

function discoverCompound(id) {
  id = String(id);
  if (!Game.compoundMap.has(id)) return false;
  if (Game.discoveredCompounds.has(id)) return false;
  Game.discoveredCompounds.add(id);
  return true;
}

function renderCompounds(searchText = '') {
  const container = document.getElementById('compound-list');
  if (!container) return;
  container.innerHTML = '';

  const q = String(searchText).trim().toLowerCase();

  /* Build the element display without showing both H and H2, both N and N2,
     etc. The playable molecular form is displayed when it exists. */
  const preferredIds = new Set();
  const replacedAtomicIds = new Set();

  for (const c of Game.compounds) {
    if (!c || !isElement(c)) continue;

    const base = getElementBaseSymbol(c);
    const preferredId = PREFERRED_ELEMENTAL_FORMS[base];

    if (preferredId && Game.compoundMap.has(preferredId)) {
      preferredIds.add(preferredId);
      if (String(c.id) !== preferredId && c.category === 'element') {
        replacedAtomicIds.add(String(c.id));
      }
    }
  }

  const seen = new Set();
  const visible = [];

  for (const c of Game.compounds) {
    if (!c?.id) continue;

    const id = String(c.id);
    const element = isElement(c);

    // Hide the atomic duplicate when its preferred elemental form exists.
    if (element && c.category === 'element' && replacedAtomicIds.has(id)) {
      continue;
    }

    if (!element && !Game.discoveredCompounds.has(id)) continue;

    if (!q || [c.name,c.formula,c.category,c.type].filter(Boolean).join(' ').toLowerCase().includes(q)) {
      if (!seen.has(id)) {
        seen.add(id);
        visible.push(c);
      }
    }
  }

  if (!visible.length) {
    container.innerHTML = '<div class="empty-inventory">No substances available.</div>';
    return;
  }

  for (const c of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'compound-button';
    button.dataset.id = c.id;
    button.innerHTML = `<strong>${escapeHTML(c.formula || c.name || c.id)}</strong><span>${escapeHTML(c.name || c.id)}</span>`;
    button.addEventListener('click', () => addReactant(c.id));
    container.appendChild(button);
  }
}
function addReactant(id) {
  if (!Game.initialized) return showMessage('ChemCraft is still loading...');
  id = String(id);
  if (!getCompound(id)) return showMessage('That substance is not in the database.');
  if (!Game.discoveredCompounds.has(id)) return showMessage('Discover that compound first.');
  if (Game.selectedReactants.length >= CONFIG.MAX_REACTANTS) return showMessage(`Maximum ${CONFIG.MAX_REACTANTS} reactants allowed.`);
  Game.selectedReactants.push(id);
  renderReactants();
}

function removeReactant(index) {
  if (index < 0 || index >= Game.selectedReactants.length) return;
  Game.selectedReactants.splice(index, 1);
  renderReactants();
}

function clearReactants() {
  Game.selectedReactants = [];
  renderReactants();
}

function renderReactants() {
  const container = document.getElementById('reactants');
  if (!container) return;
  container.innerHTML = '';
  Game.selectedReactants.forEach((id,index) => {
    const c = getCompound(id);
    const div = document.createElement('div');
    div.className = 'reactant-item';
    div.innerHTML = `<span>${escapeHTML(c?.formula || c?.name || id)}</span><button type="button">×</button>`;
    div.querySelector('button').addEventListener('click', () => removeReactant(index));
    container.appendChild(div);
  });
}

function normalize(ids) { return ids.map(String).sort(); }
function reactionReactants(r) {
  return (r.reactants || []).map(x => typeof x === 'string' ? x : (x.compound || x.id)).filter(Boolean);
}
function reactionProducts(r) {
  return (r.products || []).map(x => typeof x === 'string' ? x : (x.compound || x.id)).filter(Boolean);
}

function findMatchingReactions(reactants = Game.selectedReactants) {
  const input = normalize(reactants);
  if (!input.length) return [];
  return Game.reactions.filter(r => {
    const expected = normalize(reactionReactants(r));
    return expected.length === input.length && expected.every((x,i) => x === input[i]);
  });
}

function performReaction() {
  if (!Game.initialized) return showMessage('ChemCraft is still loading...');
  if (!Game.selectedReactants.length) return showMessage('Add reactants first.');

  const matches = findMatchingReactions();
  if (!matches.length) {
    showMessage('No reaction found for these reactants.');
    showReactionResult({products:[], firstDiscovery:false, firstReaction:false, equation:'', conditions:[]});
    return;
  }

  const reaction = matches[0];
  const products = reactionProducts(reaction);
  const firstDiscovery = products.some(discoverCompound);
  const rid = String(reaction.id);
  const firstReaction = !Game.discoveredReactions.has(rid);
  Game.discoveredReactions.add(rid);

  Game.currentXP += 10 + (firstDiscovery ? 25 : 0);
  Game.level = Math.max(1, Math.floor(Game.currentXP / 100) + 1);
  Game.reactionHistory.unshift({
    reactionId: rid,
    reactants: [...Game.selectedReactants],
    products: [...products],
    equation: reaction.equation || '',
    timestamp: new Date().toISOString()
  });
  Game.reactionHistory = Game.reactionHistory.slice(0,100);
  saveGame();

  showReactionResult({
    products,
    firstDiscovery,
    firstReaction,
    equation: reaction.equation || '',
    conditions: reaction.conditions ? [reaction.conditions] : []
  });
  refreshUI();
}

function showReactionResult(result) {
  const container = document.getElementById('reaction-result');
  if (!container) return console.log(result);
  const productsHTML = (result.products || []).map(id => {
    const c = getCompound(id);
    return `<div class="product"><strong>${escapeHTML(c?.formula || id)}</strong><span>${escapeHTML(c?.name || id)}</span></div>`;
  }).join('');
  container.innerHTML = `
    <div class="reaction-card">
      ${result.firstDiscovery ? '<div class="new-reaction">NEW COMPOUND DISCOVERED!</div>' : ''}
      ${result.firstReaction ? '<div class="new-reaction">REACTION DISCOVERED!</div>' : ''}
      ${result.equation ? `<div class="equation">${escapeHTML(result.equation)}</div>` : ''}
      <div class="products">${productsHTML}</div>
      ${(result.conditions || []).length ? `<div><strong>Conditions:</strong> ${result.conditions.map(escapeHTML).join(', ')}</div>` : ''}
    </div>`;
}

function renderHistory() {
  const container = document.getElementById('history');
  if (!container) return;
  container.innerHTML = '';
  for (const h of Game.reactionHistory) {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.textContent = h.equation || h.reactionId || '';
    container.appendChild(div);
  }
}

function getStatistics() {
  return {
    totalCompounds: Game.compounds.length,
    discoveredCompounds: Game.discoveredCompounds.size,
    totalReactions: Game.reactions.length,
    discoveredReactions: Game.discoveredReactions.size,
    currentXP: Game.currentXP,
    level: Game.level
  };
}

function updateStatistics() {
  const s = getStatistics();
  const map = {
    'compound-count': `${s.discoveredCompounds} / ${s.totalCompounds}`,
    'reaction-count': `${s.discoveredReactions} / ${s.totalReactions}`,
    'xp': String(s.currentXP),
    'level': String(s.level)
  };
  for (const [id,value] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }
}

function setupSearch() {
  const input = document.getElementById('compound-search');
  if (input) input.addEventListener('input', () => renderCompounds(input.value));
}

function setupButtons() {
  const react = document.getElementById('react-button');
  const clear = document.getElementById('clear-button');
  const reset = document.getElementById('reset-button');
  if (react) react.addEventListener('click', performReaction);
  if (clear) clear.addEventListener('click', clearReactants);
  if (reset) reset.addEventListener('click', resetGame);
}

function setupKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'INPUT') performReaction();
    if (e.key === 'Escape') clearReactants();
  });
}

function refreshUI() {
  renderReactants();
  renderCompounds();
  renderHistory();
  updateStatistics();
}

async function initGame() {
  try {
    await loadDatabase();
    buildIndexes();
    loadSave();

    Game.initialized = true;

    const start = getStartingElements();
    console.log(`Starting inventory: ${start.length}`);
    console.log(start.map(getCompoundFormula));

    if (start.length === 0) {
      throw new Error('No starting elements were found in compounds.json.');
    }

    refreshUI();
  } catch (error) {
    console.error('ChemCraft initialization failed:', error);
    showError(`ChemCraft could not start: ${error.message}`);
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

window.ChemCraft = {
  Game, addReactant, removeReactant, clearReactants, performReaction,
  findMatchingReactions, getCompound, getCompoundName, getCompoundFormula,
  getStatistics, resetGame, saveGame, refreshUI
};

document.addEventListener('DOMContentLoaded', async () => {
  setupButtons();
  setupSearch();
  setupKeyboard();
  await initGame();
});
