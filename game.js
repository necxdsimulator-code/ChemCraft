/* =========================================================
   CHEMCRAFT — FIVE-LEVEL GAME ENGINE
   ---------------------------------------------------------
   Database files used:
     level1_compounds.json / level1_reactions.json
     level2_compounds.json / level2_reactions.json
     level3_compounds.json / level3_reactions.json
     level4_compounds.json / level4_reactions.json
     level5_compounds.json / level5_reactions.json
     missions.json
     achievements.json

   No master compounds.json or reactions.json is required.
   ========================================================= */

"use strict";

const LEVELS = [1, 2, 3, 4, 5];
const XP_TO_LEVEL = { 1: 0, 2: 250, 3: 450, 4: 700, 5: 1000 };
const MAX_REACTANTS = 5;
const SAVE_KEY = "chemcraft_progressive_v1";

const Game = {
    level: 1,
    xp: 0,

    compounds: [],
    reactions: [],
    missions: [],
    achievements: [],

    compoundMap: new Map(),
    loadedLevels: new Set(),

    selectedReactants: [],
    discoveredCompounds: new Set(),
    discoveredReactions: new Set(),
    completedMissions: new Set(),
    completedAchievements: new Set(),

    activeMission: null,
    reactionsSinceMission: 0,
    totalReactionsPerformed: 0,
    missionsCompleted: 0,
    reactionHistory: [],
    listMode: "elements",
    initialized: false
};

/* ----------------------------- Utilities ----------------------------- */

async function loadJSON(file) {
    const response = await fetch(file + "?v=" + Date.now());
    if (!response.ok) throw new Error(`Could not load ${file}`);
    return response.json();
}

function esc(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getCompound(id) {
    return Game.compoundMap.get(String(id));
}

function formula(id) {
    const c = getCompound(id);
    return c?.formula || c?.symbol || c?.name || String(id);
}

function name(id) {
    const c = getCompound(id);
    return c?.name || c?.formula || String(id);
}

function isElement(c) {
    return c?.category === "element" || c?.category === "elemental_form";
}

function isMolecularElement(c) {
    return c?.category === "elemental_form";
}

/*
 * Playable elemental form preference.
 * The database contains both atomic records (H, N, O, Cl, ...)
 * and their actual molecular forms (H₂, N₂, O₂, Cl₂, P₄, S₈).
 * The Play list should show the form used as a reactant in chemistry
 * reactions, not both representations.
 */
function molecularElementFor(c) {
    if (!c || c.category !== "element") return null;

    const atomicFormula = String(
        c.formula || c.symbol || ""
    ).trim();

    return Game.compounds.find(x => {
        if (x.category !== "elemental_form") return false;

        const molecularFormula = String(
            x.formula || ""
        ).trim();

        const withoutSubscripts = molecularFormula
            .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, "");

        return withoutSubscripts === atomicFormula;
    }) || null;
}

function reactionKey(reaction) {
    return `${reaction._level}:${reaction.id}`;
}

function ids(items) {
    if (!Array.isArray(items)) return [];
    return items.flatMap(item => {
        if (typeof item === "string") return [item];
        if (!item?.compound) return [];
        const n = Math.max(1, Number(item.coefficient) || 1);
        return Array.from({ length: n }, () => String(item.compound));
    });
}

function sameMultiset(a, b) {
    const A = [...a].map(String).sort();
    const B = [...b].map(String).sort();
    return A.length === B.length && A.every((x, i) => x === B[i]);
}

function getLevelForXP(xp) {
    if (xp >= XP_TO_LEVEL[5]) return 5;
    if (xp >= XP_TO_LEVEL[4]) return 4;
    if (xp >= XP_TO_LEVEL[3]) return 3;
    if (xp >= XP_TO_LEVEL[2]) return 2;
    return 1;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

/* ----------------------------- Loading ----------------------------- */

async function loadMeta() {
    const [missions, achievements] = await Promise.all([
        loadJSON("missions.json"),
        loadJSON("achievements.json")
    ]);

    Game.missions = Array.isArray(missions) ? missions : missions.missions || [];
    Game.achievements = Array.isArray(achievements) ? achievements : achievements.achievements || [];
}

async function loadLevel(level) {
    if (!LEVELS.includes(level) || Game.loadedLevels.has(level)) return;

    const [compoundData, reactionData] = await Promise.all([
        loadJSON(`level${level}_compounds.json`),
        loadJSON(`level${level}_reactions.json`)
    ]);

    const compounds = Array.isArray(compoundData)
        ? compoundData
        : compoundData.compounds || [];

    const reactions = Array.isArray(reactionData)
        ? reactionData
        : reactionData.reactions || [];

    for (const compound of compounds) {
        const id = String(compound.id);
        if (!Game.compoundMap.has(id)) {
            Game.compoundMap.set(id, compound);
            Game.compounds.push({ ...compound, _level: level });
        }
    }

    for (const reaction of reactions) {
        Game.reactions.push({ ...reaction, _level: level });
    }

    Game.loadedLevels.add(level);
    console.log(`Level ${level} loaded: ${compounds.length} compounds, ${reactions.length} reactions`);
}

async function loadThroughLevel(level) {
    const target = Math.max(1, Math.min(5, Number(level) || 1));
    for (let n = 1; n <= target; n++) await loadLevel(n);
}

/* ----------------------------- Save / Load ----------------------------- */

function saveGame() {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
        level: Game.level,
        xp: Game.xp,
        discoveredCompounds: [...Game.discoveredCompounds],
        discoveredReactions: [...Game.discoveredReactions],
        completedMissions: [...Game.completedMissions],
        completedAchievements: [...Game.completedAchievements],
        activeMission: Game.activeMission,
        reactionsSinceMission: Game.reactionsSinceMission,
        totalReactionsPerformed: Game.totalReactionsPerformed,
        missionsCompleted: Game.missionsCompleted,
        reactionHistory: Game.reactionHistory.slice(0, 100)
    }));
}

function loadSave() {
    Game.level = 1;
    Game.xp = 0;
    Game.discoveredCompounds = new Set();
    Game.discoveredReactions = new Set();
    Game.completedMissions = new Set();
    Game.completedAchievements = new Set();
    Game.activeMission = null;
    Game.reactionsSinceMission = 0;
    Game.totalReactionsPerformed = 0;
    Game.missionsCompleted = 0;
    Game.reactionHistory = [];

    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const save = JSON.parse(raw);

        Game.level = Math.max(1, Math.min(5, Number(save.level) || 1));
        Game.xp = Math.max(0, Number(save.xp) || 0);
        Game.discoveredCompounds = new Set((save.discoveredCompounds || []).map(String));
        Game.discoveredReactions = new Set((save.discoveredReactions || []).map(String));
        Game.completedMissions = new Set((save.completedMissions || []).map(String));
        Game.completedAchievements = new Set((save.completedAchievements || []).map(String));
        Game.activeMission = save.activeMission || null;
        Game.reactionsSinceMission = Math.max(0, Number(save.reactionsSinceMission) || 0);
        Game.totalReactionsPerformed = Math.max(0, Number(save.totalReactionsPerformed) || 0);
        Game.missionsCompleted = Math.max(0, Number(save.missionsCompleted) || 0);
        Game.reactionHistory = Array.isArray(save.reactionHistory) ? save.reactionHistory : [];
    } catch (error) {
        console.warn("Invalid ChemCraft save; starting fresh.", error);
    }
}

function migrateLegacyReactionIDs() {
    /* Old versions stored only reaction IDs. New versions store level:id.
       Convert an old ID only when it maps to exactly one loaded reaction. */
    const raw = [...Game.discoveredReactions];
    for (const id of raw) {
        if (id.includes(":")) continue;
        const matches = Game.reactions.filter(r => String(r.id) === id);
        if (matches.length === 1) {
            Game.discoveredReactions.delete(id);
            Game.discoveredReactions.add(reactionKey(matches[0]));
        }
    }
}

/* ----------------------------- Availability ----------------------------- */

function reactionUses(id) {
    const target = String(id);
    return Game.reactions.some(r => ids(r.reactants).includes(target));
}

function molecularFormFor(c) {
    return molecularElementFor(c);
}

function shouldShowElement(c) {
    if (!isElement(c)) return false;

    /* Always show the molecular/standard playable form itself. */
    if (isMolecularElement(c)) return true;

    /*
     * If an atomic record has a corresponding molecular form,
     * hide the atomic placeholder from the Play palette.
     *
     * Examples:
       H  -> H₂
       N  -> N₂
       O  -> O₂
       Cl -> Cl₂
       F  -> F₂
       Br -> Br₂
       I  -> I₂
       P  -> P₄
       S  -> S₈
     *
     * Elements without a molecular-form record remain visible,
     * e.g. C, Na, K, Ca, Fe, Cu.
     */
    return !molecularFormFor(c);
}

function isAvailable(c) {
    if (!c) return false;
    if (isElement(c)) return shouldShowElement(c);
    return Game.discoveredCompounds.has(String(c.id));
}

function getVisibleCompounds(search = "") {
    const query = String(search).trim().toLowerCase();

    return Game.compounds.filter(c => {
        if (Game.listMode === "elements") {
            if (!shouldShowElement(c)) return false;
        } else {
            if (isElement(c) || !Game.discoveredCompounds.has(String(c.id))) return false;
        }

        if (!isAvailable(c)) return false;
        if (!query) return true;

        return `${c.name || ""} ${c.formula || ""} ${c.id || ""}`
            .toLowerCase()
            .includes(query);
    });
}

/* ----------------------------- Play UI ----------------------------- */

function renderCompounds(search = "") {
    const container = document.getElementById("compound-list");
    if (!container) return;

    container.innerHTML = "";
    const items = getVisibleCompounds(search);

    if (!items.length) {
        container.innerHTML = `<p style="color:var(--muted);padding:12px;text-align:center;grid-column:1/-1;">No chemicals available.</p>`;
        return;
    }

    for (const compound of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "compound-button";
        button.dataset.id = compound.id;
        const displayCompound =
            (
                Game.listMode === "elements" &&
                compound.category === "element" &&
                molecularFormFor(compound)
            )
                ? molecularFormFor(compound)
                : compound;

        button.innerHTML = `
            <strong>${esc(displayCompound.formula || displayCompound.name)}</strong>
            <span>${esc(displayCompound.name || "")}</span>
        `;
        button.onclick = () => addReactant(compound.id);
        container.appendChild(button);
    }
}

function renderReactants() {
    const container = document.getElementById("reactants");
    if (!container) return;
    container.innerHTML = "";

    Game.selectedReactants.forEach((id, index) => {
        const item = document.createElement("div");
        item.className = "reactant-item";
        item.innerHTML = `
            <span>${esc(formula(id))}</span>
            <button type="button" aria-label="Remove reactant">×</button>
        `;
        item.querySelector("button").onclick = () => {
            Game.selectedReactants.splice(index, 1);
            renderReactants();
        };
        container.appendChild(item);
    });
}

function addReactant(id) {
    id = String(id);
    const compound = getCompound(id);

    if (!compound || !isAvailable(compound)) {
        showMessage("You have not unlocked this substance yet.");
        return;
    }

    if (Game.selectedReactants.length >= MAX_REACTANTS) {
        showMessage("Maximum 5 reactants.");
        return;
    }

    Game.selectedReactants.push(id);
    renderReactants();
}

function clearReactants() {
    Game.selectedReactants = [];
    renderReactants();
}

function findReaction() {
    if (!Game.selectedReactants.length) return null;
    return Game.reactions.find(r => sameMultiset(Game.selectedReactants, ids(r.reactants))) || null;
}

/* ----------------------------- Reaction result ----------------------------- */

function reactionConditions(reaction) {
    if (Array.isArray(reaction.conditions)) return reaction.conditions.join(", ");
    return reaction.conditions || "—";
}

function renderReactionResult(reaction, products, isNewCompound, isNewReaction) {
    const output = document.getElementById("reaction-result");
    if (!output) return;

    const productHTML = products.map(id => `
        <div class="product">
            <strong>${esc(formula(id))}</strong>
            <span>${esc(name(id))}</span>
        </div>
    `).join("");

    output.innerHTML = `
        <div class="reaction-card">
            ${isNewCompound ? `<div class="new-reaction">NEW COMPOUND DISCOVERED!</div>` : ""}
            ${isNewReaction ? `<div class="new-reaction">NEW REACTION DISCOVERED!</div>` : ""}
            <h2>${esc(reaction.equation || createEquation(reaction))}</h2>
            <p><strong>Type:</strong> ${esc(reaction.type || reaction.reaction_type || "Reaction")}</p>
            ${reaction.observation ? `<p><strong>Observation:</strong> ${esc(reaction.observation)}</p>` : ""}
            ${reaction.explanation ? `<p><strong>Explanation:</strong> ${esc(reaction.explanation)}</p>` : ""}
            <h3>Products</h3>
            <div class="products">${productHTML}</div>
        </div>
    `;

    setText("reaction-equation", reaction.equation || createEquation(reaction));
    setText("reaction-conditions", reactionConditions(reaction));
    setText("reaction-description", reaction.observation || reaction.explanation || reaction.type || "—");
}

function createEquation(reaction) {
    return `${formatSide(reaction.reactants)} → ${formatSide(reaction.products)}`;
}

function formatSide(items) {
    return (items || []).map(item => {
        const id = typeof item === "string" ? item : item?.compound;
        const coefficient = typeof item === "object" ? Number(item.coefficient) || 1 : 1;
        return coefficient === 1 ? formula(id) : `${coefficient}${formula(id)}`;
    }).join(" + ");
}

/* ----------------------------- XP / Levels ----------------------------- */

function addXP(amount) {
    Game.xp += Math.max(0, Number(amount) || 0);
}

async function updateLevel() {
    const oldLevel = Game.level;
    const newLevel = getLevelForXP(Game.xp);
    Game.level = newLevel;

    if (newLevel > oldLevel) {
        await loadThroughLevel(newLevel);
        showLevelUnlock(newLevel);
    }

    return newLevel;
}

/* ----------------------------- Missions ----------------------------- */

function missionCanBeCompleted(mission) {
    const target = String(mission?.target_compound || "");
    if (!target) return false;
    if (Number(mission.min_level || 1) > Game.level) return false;
    if (Game.completedMissions.has(String(mission.id))) return false;
    if (Game.discoveredCompounds.has(target)) return false;
    if (!getCompound(target)) return false;

    /* Only offer missions for compounds produced by a loaded reaction. */
    return Game.reactions.some(r => ids(r.products).includes(target));
}

function missionCandidates() {
    return Game.missions.filter(missionCanBeCompleted);
}

function offerMissionIfReady() {
    if (Game.activeMission) return false;
    if (Game.reactionsSinceMission < 7) return false;

    const candidates = missionCandidates();
    if (!candidates.length) return false;

    const mission = candidates[Math.floor(Math.random() * candidates.length)];
    Game.activeMission = mission;
    Game.reactionsSinceMission = 0;
    saveGame();
    showMissionPopup(mission);
    renderMissionBanner();
    return true;
}

function completeActiveMission() {
    const mission = Game.activeMission;
    if (!mission) return false;

    const target = String(mission.target_compound || "");
    if (!Game.discoveredCompounds.has(target)) return false;

    Game.completedMissions.add(String(mission.id));
    Game.missionsCompleted += 1;
    Game.activeMission = null;
    Game.reactionsSinceMission = 0;

    const reward = Number(mission.xp_reward) || 0;
    addXP(reward);
    showMissionCompletePopup(mission, reward);
    renderMissionBanner();
    return true;
}

/* ----------------------------- Achievements ----------------------------- */

function achievementValue(achievement) {
    const type = achievement?.criteria?.type;
    switch (type) {
        case "reactions_performed": return Game.totalReactionsPerformed;
        case "compounds_discovered": return discoveredCompoundCount();
        case "unique_reactions": return discoveredReactionCount();
        case "missions_completed": return Game.missionsCompleted;
        default: return 0;
    }
}

function checkAchievements() {
    const unlocked = [];

    for (const achievement of Game.achievements) {
        const id = String(achievement.id || "");
        const goal = Number(achievement?.criteria?.value) || 0;
        if (!id || Game.completedAchievements.has(id)) continue;
        if (achievementValue(achievement) < goal) continue;

        Game.completedAchievements.add(id);
        addXP(Number(achievement.xp_reward) || 0);
        unlocked.push(achievement);
    }

    if (unlocked.length) showAchievementPopup(unlocked);
    return unlocked;
}

function discoveredCompoundCount() {
    return [...Game.discoveredCompounds].filter(id => getCompound(id)).length;
}

function discoveredReactionCount() {
    return Game.reactions.filter(r =>
        Game.discoveredReactions.has(reactionKey(r)) ||
        Game.discoveredReactions.has(String(r.id))
    ).length;
}

/* ----------------------------- Play action ----------------------------- */

async function performReaction() {
    if (!Game.initialized) {
        showMessage("ChemCraft is still loading.");
        return;
    }

    if (!Game.selectedReactants.length) {
        showMessage("Select at least one reactant.");
        return;
    }

    const reaction = findReaction();
    if (!reaction) {
        showNoReaction();
        showMessage("No reaction found for these reactants.");
        return;
    }

    const products = ids(reaction.products);
    const key = reactionKey(reaction);
    const isNewReaction = !Game.discoveredReactions.has(key) && !Game.discoveredReactions.has(String(reaction.id));
    let isNewCompound = false;

    Game.discoveredReactions.add(key);

    for (const id of new Set(products)) {
        if (!Game.discoveredCompounds.has(id)) {
            Game.discoveredCompounds.add(id);
            isNewCompound = true;
        }
    }

    addXP(isNewCompound ? 35 : 10);
    Game.totalReactionsPerformed += 1;
    Game.reactionsSinceMission += 1;

    Game.reactionHistory.unshift({
        reactionID: key,
        equation: reaction.equation || createEquation(reaction),
        reactants: [...Game.selectedReactants],
        products: [...products],
        timestamp: new Date().toISOString()
    });
    Game.reactionHistory = Game.reactionHistory.slice(0, 100);

    const missionCompleted = completeActiveMission();
    checkAchievements();
    const oldLevel = Game.level;
    await updateLevel();

    saveGame();
    renderCompounds(document.getElementById("compound-search")?.value || "");
    renderReactants();
    updateStats();
    renderReactionResult(reaction, [...new Set(products)], isNewCompound, isNewReaction);

    if (!missionCompleted) offerMissionIfReady();
    if (Game.level > oldLevel) renderCompounds(document.getElementById("compound-search")?.value || "");
}

/* ----------------------------- Statistics ----------------------------- */

function updateStats() {
    setText("level", Game.level);
    setText("xp", Game.xp);
    setText("compound-count", `${currentLevelDiscoveredCount()}/${currentLevelCompoundCount()}`);
    setText("reaction-count", `${currentLevelDiscoveredReactionCount()}/${currentLevelReactionCount()}`);
}

function currentLevelDiscoveredCount() {
    return Game.compounds.filter(c => c._level === Game.level && Game.discoveredCompounds.has(String(c.id))).length;
}

function currentLevelCompoundCount() {
    return Game.compounds.filter(c => c._level === Game.level).length;
}

function currentLevelDiscoveredReactionCount() {
    return Game.reactions.filter(r => r._level === Game.level && (
        Game.discoveredReactions.has(reactionKey(r)) ||
        Game.discoveredReactions.has(String(r.id))
    )).length;
}

function currentLevelReactionCount() {
    return Game.reactions.filter(r => r._level === Game.level).length;
}

function showMessage(message) {
    const el = document.getElementById("message");
    if (el) el.textContent = message;
    console.log(message);
}

function showNoReaction() {
    const box = document.getElementById("reaction-result");
    if (!box) return;
    box.innerHTML = `
        <div class="no-reaction">
            <h2>No Reaction</h2>
            <p>These substances do not have a reaction registered in the current level database.</p>
        </div>
    `;
}

/* ----------------------------- Popups ----------------------------- */

function popupBase(id) {
    const old = document.getElementById(id);
    if (old) old.remove();

    const popup = document.createElement("div");
    popup.id = id;
    popup.innerHTML = `
        <div style="position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;padding:20px;">
            <div style="max-width:520px;width:100%;padding:28px;background:#07111f;color:#eaf7ff;border:1px solid #18bfff;border-radius:16px;box-shadow:0 0 40px rgba(0,191,255,.16);">
                <div id="${id}-content"></div>
                <div style="margin-top:20px;text-align:right;"><button id="${id}-close" style="border:1px solid #18bfff;background:#0b8fe5;color:#fff;padding:10px 20px;border-radius:9px;cursor:pointer;font-weight:800;">Continue</button></div>
            </div>
        </div>`;
    document.body.appendChild(popup);
    document.getElementById(`${id}-close`).onclick = () => popup.remove();
    return popup;
}

function showLevelUnlock(level) {
    const popup = popupBase("level-unlock-popup");
    const newItems = Game.compounds.filter(c => c._level === level && isElement(c));
    document.getElementById("level-unlock-popup-content").innerHTML = `
        <div style="color:#6fd8ff;font-weight:900;letter-spacing:1px;">LEVEL UNLOCKED</div>
        <h2>Level ${level}</h2>
        <p>New elements and chemistry have been unlocked.</p>
        <p style="font-size:20px;font-weight:900;line-height:1.7;">${newItems.map(c => esc(c.formula || c.name)).join(" &nbsp; ")}</p>
    `;
}

function showMissionPopup(mission) {
    const popup = popupBase("mission-popup");
    const c = getCompound(mission.target_compound);
    document.getElementById("mission-popup-content").innerHTML = `
        <div style="color:#6fd8ff;font-weight:900;letter-spacing:1px;">NEW MISSION</div>
        <h2>${esc(mission.title || `Discover ${c?.formula || mission.target_compound}`)}</h2>
        <p style="font-size:18px;line-height:1.5;">${esc(mission.description || `Discover ${c?.name || mission.target_compound}.`)}</p>
        <p style="color:#9bb6cc;">Reward: +${Number(mission.xp_reward) || 0} XP</p>
    `;
}

function showMissionCompletePopup(mission, reward) {
    const popup = popupBase("mission-complete-popup");
    const c = getCompound(mission.target_compound);
    document.getElementById("mission-complete-popup-content").innerHTML = `
        <div style="color:#42ed68;font-weight:900;letter-spacing:1px;">MISSION COMPLETE</div>
        <h2>${esc(c?.formula || mission.target_compound)} discovered!</h2>
        <p>Bonus reward: +${reward} XP</p>
    `;
}

function showAchievementPopup(list) {
    const popup = popupBase("achievement-popup");
    const rows = list.map(a => `
        <div style="padding:10px 0;border-bottom:1px solid #17405a;">
            <strong>${esc(a.name || "Achievement")}</strong>
            <div style="margin-top:4px;color:#9bb6cc;">${esc(a.description || "")}</div>
            <div style="margin-top:4px;color:#6fd8ff;">+${Number(a.xp_reward) || 0} XP</div>
        </div>
    `).join("");
    document.getElementById("achievement-popup-content").innerHTML = `
        <div style="color:#ffd968;font-weight:900;letter-spacing:1px;">ACHIEVEMENT UNLOCKED</div>
        <h2>${list.length === 1 ? esc(list[0].name) : `${list.length} achievements`}</h2>
        ${rows}
    `;
}

function renderMissionBanner() {
    let banner = document.getElementById("mission-banner");

    if (!Game.activeMission) {
        if (banner) banner.remove();
        return;
    }

    if (!banner) {
        banner = document.createElement("div");
        banner.id = "mission-banner";
        banner.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:9998;width:min(340px,calc(100vw - 40px));background:#07111f;color:#eaf7ff;border:1px solid #18bfff;border-radius:12px;padding:15px 17px;box-shadow:0 0 25px rgba(0,191,255,.12);";
        document.body.appendChild(banner);
    }

    const c = getCompound(Game.activeMission.target_compound);
    banner.innerHTML = `
        <div style="font-size:12px;color:#6fd8ff;font-weight:900;letter-spacing:1px;">ACTIVE MISSION</div>
        <div style="font-size:18px;font-weight:900;margin-top:5px;">Discover ${esc(c?.name || Game.activeMission.target_compound)}</div>
        <div style="color:#9bb6cc;margin-top:3px;">${esc(c?.formula || "")} • +${Number(Game.activeMission.xp_reward) || 0} XP</div>
    `;
}

/* ----------------------------- UI setup ----------------------------- */

function setupUI() {
    const search = document.getElementById("compound-search");
    if (search) search.oninput = () => renderCompounds(search.value);

    const react = document.getElementById("react-button");
    if (react) react.onclick = performReaction;

    const clear = document.getElementById("clear-button");
    if (clear) clear.onclick = clearReactants;

    const modeButtons = document.querySelectorAll(".segmented button");
    modeButtons.forEach(button => {
        button.onclick = () => {
            modeButtons.forEach(x => x.classList.remove("active"));
            button.classList.add("active");
            Game.listMode = button.textContent.trim().toLowerCase().startsWith("compound")
                ? "compounds"
                : "elements";
            renderCompounds(search?.value || "");
        };
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") clearReactants();
        if (event.key === "Enter" && event.target?.tagName !== "INPUT") performReaction();
    });
}

/* ----------------------------- Start ----------------------------- */

async function init() {
    try {
        loadSave();
        setupUI();
        await loadMeta();
        await loadThroughLevel(Game.level);
        migrateLegacyReactionIDs();

        Game.initialized = true;
        await updateLevel();

        renderCompounds();
        renderReactants();
        updateStats();
        renderMissionBanner();

        console.log(`ChemCraft ready — Level ${Game.level}`);
        console.log(`Loaded compounds: ${Game.compounds.length}`);
        console.log(`Loaded reactions: ${Game.reactions.length}`);
    } catch (error) {
        console.error("ChemCraft initialization failed:", error);
        const err = document.getElementById("error");
        if (err) {
            err.style.display = "block";
            err.textContent = error.message;
        }
        showMessage("Could not load the five-level chemistry database.");
    }
}

document.addEventListener("DOMContentLoaded", init);

window.ChemCraft = {
    Game,
    addReactant,
    removeReactant(index) {
        if (index >= 0 && index < Game.selectedReactants.length) {
            Game.selectedReactants.splice(index, 1);
            renderReactants();
        }
    },
    clearReactants,
    performReaction,
    getCompound,
    formula,
    name,
    updateStats,
    renderCompounds,
    renderInventory: renderCompounds,
    renderReactants,
    getCompoundFormula: formula,
    getCompoundName: name,
    offerMissionIfReady,
    completeActiveMission,
    checkAchievements,
    saveGame,
    resetGame() {
        localStorage.removeItem(SAVE_KEY);
        location.reload();
    }
};
