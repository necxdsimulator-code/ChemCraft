/* =========================================================
   CHEMCRAFT - PROGRESSIVE DATABASE VERSION
   Elements unlock by level; compounds unlock only by discovery.
   ========================================================= */

"use strict";

const LEVEL_ELEMENTS = {
    1: ["H","C","N","O","Na","Cl","K","Ca"],
    2: ["Mg","Al","S","P","F","Li"],
    3: ["Fe","Cu","Zn","Si","Ti","Br"],
    4: ["Co","Ni","Be","B","Ga","I"],
    5: ["Au","Cs","Ba","Hg","Pb","Sn"]
};

function getUnlockedSymbols(level = Game.level) {
    const symbols = [];

    for (let l = 1; l <= level; l++) {
        const elements = LEVEL_ELEMENTS[l] || [];

        for (const symbol of elements) {
            if (!symbols.includes(symbol)) {
                symbols.push(symbol);
            }
        }
    }

    return symbols;
}
function esc(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
const XP_LEVELS = {
    1: 0,
    2: 250,
    3: 450,
    4: 700,
    5: 1000
};

const SAVE_KEY = "chemcraft_progressive_v1";
const MAX_REACTANTS = 5;

const Game = {
    level: 1,
    xp: 0,
    compounds: [],
    reactions: [],
    compoundMap: new Map(),
    discoveredCompounds: new Set(),
    discoveredReactions: new Set(),
    selectedReactants: [],
    reactionHistory: [],
    loadedLevels: new Set(),
    reactionsLoaded: false
};


async function loadJSON(file) {

    console.log("Trying to load:", file);

    const url = new URL(
        file,
        window.location.href
    ).href;

    console.log("Full URL:", url);

    const response = await fetch(url, {
        cache: "no-store"
    });

    console.log(
        file,
        "HTTP status:",
        response.status
    );

    if (!response.ok) {

        throw new Error(
            "Could not load " +
            file +
            " - HTTP " +
            response.status +
            " - " +
            url
        );
    }

    const text =
        await response.text();

    console.log(
        file,
        "downloaded:",
        text.length,
        "characters"
    );

    try {

        return JSON.parse(text);

    } catch (error) {

        throw new Error(
            file +
            " was downloaded but is not valid JSON."
        );
    }
}

/* Elements are available by level.
   Compounds are available only if discovered. */
function isAvailable(c) {
    const id = String(c.id);
    if (Game.discoveredCompounds.has(id)) return true;

    const unlocked = new Set(getUnlockedSymbols());
    const f = String(c.formula || "").trim();
    const s = String(c.symbol || "").trim();
    return unlocked.has(f) || unlocked.has(s);
}

async function loadLevel(level) {
    if (Game.loadedLevels.has(level)) return;

    const [cdata, rdata] = await Promise.all([
        loadJSON(`level${level}_compounds.json`),
        loadJSON(`level${level}_reactions.json`)
    ]);

    const newCompounds = Array.isArray(cdata) ? cdata : (cdata.compounds || []);
    const newReactions = Array.isArray(rdata) ? rdata : (rdata.reactions || []);

    for (const c of newCompounds) {
        const id = String(c.id);
        if (!Game.compoundMap.has(id)) {
            Game.compounds.push(c);
            Game.compoundMap.set(id, c);
        }
    }

    const existingReactionIDs = new Set(Game.reactions.map(r => String(r.id)));
    for (const r of newReactions) {
        if (!existingReactionIDs.has(String(r.id))) Game.reactions.push(r);
    }

    Game.loadedLevels.add(level);
    Game.reactionsLoaded = true;

    console.log(`Level ${level} data loaded: ${newCompounds.length} compounds, ${newReactions.length} reactions`);
}

function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
        level: Game.level,
        xp: Game.xp,
        discoveredCompounds: [...Game.discoveredCompounds],
        discoveredReactions: [...Game.discoveredReactions],
        reactionHistory: Game.reactionHistory.slice(0,100)
    }));
}

function loadSave() {
    Game.level = 1;
    Game.xp = 0;
    Game.discoveredCompounds = new Set();
    Game.discoveredReactions = new Set();
    Game.reactionHistory = [];

    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        Game.level = Math.max(1, Math.min(5, Number(s.level) || 1));
        Game.xp = Number(s.xp) || 0;
        Game.discoveredCompounds = new Set((s.discoveredCompounds || []).map(String));
        Game.discoveredReactions = new Set((s.discoveredReactions || []).map(String));
        Game.reactionHistory = Array.isArray(s.reactionHistory) ? s.reactionHistory : [];
    } catch {
        console.warn("Starting with a fresh save.");
    }
}

function showLevelUnlock(level) {
    const old = document.getElementById("level-unlock-popup");
    if (old) old.remove();

    const elements = LEVEL_ELEMENTS[level] || [];
    const popup = document.createElement("div");
    popup.id = "level-unlock-popup";
    popup.innerHTML = `
        <div style="
            position:fixed; inset:0; z-index:9999;
            background:rgba(0,0,0,.65);
            display:flex; align-items:center; justify-content:center;
            padding:20px; font-family:inherit;">
            <div style="
                max-width:520px; width:100%; padding:28px;
                background:#fff; color:#111; border-radius:16px;
                text-align:center; box-shadow:0 12px 50px rgba(0,0,0,.35);">
                <h2 style="margin-top:0">🎉 You reached Level ${level}!</h2>
                <p style="font-size:18px">
                    ${level === 1
                        ? "Your starting elements are:"
                        : "New elements unlocked:"}
                </p>
                <p style="font-size:22px; font-weight:bold; line-height:1.8">
                    ${elements.map(esc).join(" &nbsp; ")}
                </p>
                <button id="level-unlock-close"
                    style="padding:10px 22px; cursor:pointer;">
                    Continue
                </button>
            </div>
        </div>`;
    document.body.appendChild(popup);
    document.getElementById("level-unlock-close").onclick = () => popup.remove();
}

function renderInventory(search = "") {
    const box = document.getElementById("compound-list");
    if (!box) return;

    box.innerHTML = "";
    const q = String(search).trim().toLowerCase();

    const items = Game.compounds.filter(c => {
        if (!isAvailable(c)) return false;
        if (!q) return true;
        return `${c.name || ""} ${c.formula || ""}`.toLowerCase().includes(q);
    });

    if (!items.length) {
        box.innerHTML = "<p>No chemicals available yet.</p>";
        return;
    }

    for (const c of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "compound-button";
        b.innerHTML = `<strong>${esc(c.formula || c.name)}</strong><span>${esc(c.name || "")}</span>`;
        b.onclick = () => addReactant(c.id);
        box.appendChild(b);
    }
}

function renderReactants() {
const box = document.getElementById("reactants");
if (!box) return;
box.innerHTML = "";

Game.selectedReactants.forEach((id, index) => {
    const d = document.createElement("div");
    d.className = "reactant-item";
    d.innerHTML = `<span>${esc(formula(id))}</span><button type="button">×</button>`;
    d.querySelector("button").onclick = () => {
        Game.selectedReactants.splice(index,1);
        renderReactants();
    };
    box.appendChild(d);
});
}
function addReactant(id) {

    id = String(id);

    const compound = getCompound(id);

    if (!compound) {
        console.error("Compound not found:", id);
        showMessage("Could not find this chemical.");
        return;
    }

    if (Game.selectedReactants.length >= MAX_REACTANTS) {
        showMessage("Maximum 5 reactants.");
        return;
    }

    Game.selectedReactants.push(id);

    console.log(
        "Reactant added:",
        compound.formula || compound.name,
        Game.selectedReactants
    );

    renderReactants();
}

    const rid = String(reaction.id);
    const firstReaction = !Game.discoveredReactions.has(rid);
    Game.discoveredReactions.add(rid);

    Game.xp += newCompound ? 35 : 10;

    const oldLevel = Game.level;
    const newLevel = Math.min(5,
        Game.xp >= 1000 ? 5 :
        Game.xp >= 700 ? 4 :
        Game.xp >= 450 ? 3 :
        Game.xp >= 250 ? 2 : 1
    );

    Game.reactionHistory.unshift({
        reactionID: rid,
        equation: reaction.equation || "",
        reactants: [...Game.selectedReactants],
        products,
        timestamp: new Date().toISOString()
    });

    if (Game.reactionHistory.length > 100) Game.reactionHistory.length = 100;

    if (newLevel > oldLevel) {
        Game.level = newLevel;
        await loadLevel(newLevel);
        saveGame();
        renderInventory();
        renderReactants();
        updateStats();
        showReactionResult(reaction, products, newCompound, firstReaction);
        showLevelUnlock(newLevel);
        return;
    }

    saveGame();
    renderInventory();
    updateStats();
    showReactionResult(reaction, products, newCompound, firstReaction);
}

function showReactionResult(reaction, products, newCompound, firstReaction) {
    const box = document.getElementById("reaction-result");
    if (!box) return;

    box.innerHTML = `
        ${newCompound ? "<h3>🎉 NEW COMPOUND DISCOVERED!</h3>" : ""}
        ${firstReaction ? "<p>New reaction discovered!</p>" : ""}
        <p><strong>${esc(reaction.equation || "Reaction complete")}</strong></p>
        <h4>Products</h4>
        ${products.map(id => `<div><strong>${esc(formula(id))}</strong> — ${esc(name(id))}</div>`).join("")}
        ${reaction.conditions ? `<p><strong>Conditions:</strong> ${esc(reaction.conditions)}</p>` : ""}
    `;
}

function updateStats() {
    const l = document.getElementById("level");
    const x = document.getElementById("xp");
    const c = document.getElementById("compound-count");
    const r = document.getElementById("reaction-count");

    if (l) l.textContent = Game.level;
    if (x) x.textContent = Game.xp;
    if (c) c.textContent = `${Game.discoveredCompounds.size}/${Game.compounds.length}`;
    if (r) r.textContent = `${Game.discoveredReactions.size}/${Game.reactions.length}`;
}

function showMessage(text) {
    const box = document.getElementById("message");
    if (box) box.textContent = text;
    console.log(text);
}

function setupUI() {
    const search = document.getElementById("compound-search");
    if (search) search.oninput = () => renderInventory(search.value);

    const react = document.getElementById("react-button");
    if (react) react.onclick = performReaction;

    const clear = document.getElementById("clear-button");
    if (clear) clear.onclick = () => {
        Game.selectedReactants = [];
        renderReactants();
    };

    const reset = document.getElementById("reset-button");
    if (reset) reset.onclick = resetGame;
}

function resetGame() {
    if (!confirm("Reset all ChemCraft progress?")) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
}

async function init() {
    try {
        loadSave();
        setupUI();

        /* Only level 1 is downloaded initially. */
        await loadLevel(1);

        /* Level-1 elements are available immediately.
           No compounds are marked discovered. */
        renderInventory();
        renderReactants();
        updateStats();
        showLevelUnlock(1);

        /*
          If an old save is at a higher level, load only those
          level files now, one by one. Nothing is discovered
          automatically.
        */
        for (let l = 2; l <= Game.level; l++) {
            await loadLevel(l);
        }

        renderInventory();
        updateStats();

        /* New game: reactions are already loaded for level 1.
           Higher-level files are loaded only when the player
           reaches those levels. */
    } catch (e) {
        console.error(e);
        const err = document.getElementById("error");
        if (err) {
            err.style.display = "block";
            err.textContent = e.message;
        }
        showMessage("Could not load the current level database.");
    }
}

document.addEventListener("DOMContentLoaded", init);

window.ChemCraft = {
    Game,
    addReactant,
    performReaction,
    resetGame,
    renderInventory,
    renderReactants
};
