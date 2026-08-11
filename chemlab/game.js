console.log("CHEMCRAFT JS LOADED");
/* =========================================================
   CHEMCRAFT - CHEMISTRY REACTION ENGINE
   =========================================================

   Loads:
     database/compounds.json
     database/reactions.json
     database/missions.json
     database/achievements.json

   Designed for:
     - Up to 5 reactants
     - Up to 5 products
     - Reaction discovery
     - Balanced equations
     - Compound discovery
     - Missions
     - XP
     - Reaction history
     - No images required

   ========================================================= */

   "use strict";

   /* =========================================================
      GAME STATE
      ========================================================= */
   
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
   
   
   /* =========================================================
      CONFIGURATION
      ========================================================= */
   
   const CONFIG = {
       MAX_REACTANTS: 5,
       MAX_PRODUCTS: 5,
   
       XP_PER_DISCOVERY: 25,
       XP_PER_REACTION: 10,
   
       STORAGE_KEY: "chemcraft_save_v1"
   };
   
   
   /* =========================================================
      INITIALIZATION
      ========================================================= */
   
   async function initGame() {
       console.log("Starting ChemCraft...");
   
       try {
           await loadDatabase();
   
           buildIndexes();
   
           loadSave();
   
           Game.initialized = true;
   
           console.log("ChemCraft initialized.");
           console.log(`Compounds: ${Game.compounds.length}`);
           console.log(`Reactions: ${Game.reactions.length}`);
   
           refreshUI();
   
       } catch (error) {
           console.error("ChemCraft failed to initialize:", error);
   
           showError(
               "Could not load the chemistry database. " +
               "Make sure the database folder is beside your HTML file."
           );
       }
   }
   
   
   /* =========================================================
      DATABASE LOADING
      ========================================================= */
   
   async function loadJSON(path) {
       const response = await fetch(path);
   
       if (!response.ok) {
           throw new Error(
               `Could not load ${path}: HTTP ${response.status}`
           );
       }
   
       return await response.json();
   }
   
   
  async function loadDatabase() {

    console.log("Loading compounds...");

    const compounds =
        await loadJSON("compounds.json");

    console.log(
        "Compounds loaded:",
        compounds.length
    );


    console.log("Loading reactions...");

    const reactions =
        await loadJSON("reactions.json");

    console.log(
        "Reactions loaded:",
        reactions.length
    );


    console.log("Loading missions...");

    const missions =
        await loadJSON("missions.json");

    console.log(
        "Missions loaded:",
        missions.length
    );


    console.log("Loading achievements...");

    const achievements =
        await loadJSON("achievements.json");

    console.log(
        "Achievements loaded:",
        achievements.length
    );


    Game.compounds =
        Array.isArray(compounds)
            ? compounds
            : compounds.compounds || [];


    Game.reactions =
        Array.isArray(reactions)
            ? reactions
            : reactions.reactions || [];


    Game.missions =
        Array.isArray(missions)
            ? missions
            : missions.missions || [];


    Game.achievements =
        Array.isArray(achievements)
            ? achievements
            : achievements.achievements || [];


    console.log("DATABASE COMPLETE");
}
   
   
   /* =========================================================
      INDEX DATABASE
      ========================================================= */
   
   function buildIndexes() {
   
       Game.compoundMap.clear();
       Game.reactionMap.clear();
   
       for (const compound of Game.compounds) {
   
           if (!compound.id) {
               continue;
           }
   
           Game.compoundMap.set(
               compound.id,
               compound
           );
       }
   
       for (const reaction of Game.reactions) {
   
           if (!reaction.id) {
               continue;
           }
   
           Game.reactionMap.set(
               reaction.id,
               reaction
           );
       }
   }
   
   
   /* =========================================================
      COMPOUND HELPERS
      ========================================================= */
   
   function getCompound(id) {
       return Game.compoundMap.get(id);
   }
   
   
   function getCompoundName(id) {
   
       const compound = getCompound(id);
   
       if (!compound) {
           return id;
       }
   
       return compound.name ||
              compound.common_name ||
              compound.formula ||
              id;
   }
   
   
   function getCompoundFormula(id) {
   
       const compound = getCompound(id);
   
       if (!compound) {
           return id;
       }
   
       return compound.formula || compound.name || id;
   }
   
   
   /* =========================================================
      SELECTING REACTANTS
      ========================================================= */
   
   function addReactant(compoundId) {
   
       if (!Game.initialized) {
           return;
       }
   
       if (Game.selectedReactants.length >= CONFIG.MAX_REACTANTS) {
   
           showMessage(
               `Maximum ${CONFIG.MAX_REACTANTS} reactants allowed.`
           );
   
           return;
       }
   
       if (!getCompound(compoundId)) {
   
           showMessage(
               "That compound does not exist in the database."
           );
   
           return;
       }
   
       Game.selectedReactants.push(compoundId);
   
       renderReactants();
   }
   
   
   /* =========================================================
      REMOVE REACTANT
      ========================================================= */
   
   function removeReactant(index) {
   
       if (
           index < 0 ||
           index >= Game.selectedReactants.length
       ) {
           return;
       }
   
       Game.selectedReactants.splice(index, 1);
   
       renderReactants();
   }
   
   
   /* =========================================================
      CLEAR REACTANTS
      ========================================================= */
   
   function clearReactants() {
   
       Game.selectedReactants = [];
   
       renderReactants();
   }
   
   
   /* =========================================================
      NORMALIZE REACTANTS
      =========================================================
   
      This makes:
   
          Na + Na + H2O
   
      equivalent to:
   
          Na + H2O
   
      when looking for reaction definitions.
   
      ========================================================= */
   
   function normalizeReactants(list) {
   
       return [...list].sort();
   }
   
   
   function reactantListsEqual(a, b) {
   
       const A = normalizeReactants(a);
       const B = normalizeReactants(b);
   
       if (A.length !== B.length) {
           return false;
       }
   
       for (let i = 0; i < A.length; i++) {
   
           if (A[i] !== B[i]) {
               return false;
           }
       }
   
       return true;
   }
   
   
   /* =========================================================
      FIND REACTIONS
      ========================================================= */
   
   function findMatchingReactions() {

    const selected = Game.selectedReactants;

    if (selected.length === 0) {
        return [];
    }

    const matches = [];

    for (const reaction of Game.reactions) {

        const reactants =
            reaction.reactants || [];

        // Get the unique substances involved.
        // Reaction coefficients such as 2Na are ignored
        // when deciding whether the player has the
        // required ingredients.
        const requiredIDs =
            reactants.map(item => {

                if (typeof item === "string") {
                    return item;
                }

                return item.compound;
            });

        const uniqueRequired =
            [...new Set(requiredIDs)].sort();

        const uniqueSelected =
            [...new Set(selected)].sort();

        if (
            uniqueRequired.length !==
            uniqueSelected.length
        ) {
            continue;
        }

        const matchesIngredients =
            uniqueRequired.every(
                id =>
                    uniqueSelected.includes(id)
            );

        if (matchesIngredients) {
            matches.push(reaction);
        }
    }

    return matches;
}
   
   
   /* =========================================================
      REACTANT ID EXTRACTION
      ========================================================= */
   
   function extractReactantIDs(reactants) {
   
       if (!Array.isArray(reactants)) {
           return [];
       }
   
       return reactants.flatMap(item => {
   
           if (typeof item === "string") {
               return [item];
           }
   
           if (
               item &&
               item.compound &&
               Number.isInteger(item.coefficient)
           ) {
   
               return Array(
                   Math.max(1, item.coefficient)
               ).fill(item.compound);
           }
   
           if (item && item.compound) {
               return [item.compound];
           }
   
           return [];
       });
   }
   
   
   /* =========================================================
      FIND RESULT
      ========================================================= */
   
   function performReaction() {
   
       if (Game.selectedReactants.length === 0) {
   
           showMessage(
               "Add at least one reactant."
           );
   
           return;
       }
   
       const matches = findMatchingReactions();
   
       if (matches.length === 0) {
   
           showNoReaction();
   
           return;
       }
   
       /*
          A combination can theoretically match multiple
          reactions. Show all of them.
       */
   
       for (const reaction of matches) {
           processReaction(reaction);
       }
   }
   
   
   /* =========================================================
      PROCESS REACTION
      ========================================================= */
   
   function processReaction(reaction) {
   
       const firstDiscovery =
           !Game.discoveredReactions.has(reaction.id);
   
       Game.discoveredReactions.add(reaction.id);
   
       const products =
           extractProductIDs(reaction.products);
   
       let newCompoundFound = false;
   
       for (const productId of products) {
   
           if (!Game.discoveredCompounds.has(productId)) {
   
               Game.discoveredCompounds.add(
                   productId
               );
   
               newCompoundFound = true;
   
               addXP(CONFIG.XP_PER_DISCOVERY);
           }
       }
   
       if (firstDiscovery) {
   
           addXP(
               reaction.xp ||
               CONFIG.XP_PER_REACTION
           );
       }
   
       const result = {
           reactionId: reaction.id,
           equation:
               reaction.balanced_equation ||
               createEquation(reaction),
           products,
           reactionType:
               reaction.reaction_type ||
               "Reaction",
           observation:
               reaction.observation || "",
           explanation:
               reaction.explanation || "",
           conditions:
               reaction.conditions || [],
           firstDiscovery,
           newCompoundFound
       };
   
       Game.reactionHistory.unshift(result);
   
       saveGame();
   
       showReactionResult(result);
   
       refreshUI();
   }
   
   
   /* =========================================================
      PRODUCT ID EXTRACTION
      ========================================================= */
   
   function extractProductIDs(products) {
   
       if (!Array.isArray(products)) {
           return [];
       }
   
       const result = [];
   
       for (const item of products) {
   
           if (typeof item === "string") {
   
               result.push(item);
   
               continue;
           }
   
           if (item && item.compound) {
   
               const coefficient =
                   Number(item.coefficient) || 1;
   
               for (
                   let i = 0;
                   i < coefficient;
                   i++
               ) {
                   result.push(item.compound);
               }
           }
       }
   
       return result;
   }
   
   
   /* =========================================================
      CREATE EQUATION FALLBACK
      ========================================================= */
   
   function createEquation(reaction) {
   
       const left =
           formatReactionSide(
               reaction.reactants
           );
   
       const right =
           formatReactionSide(
               reaction.products
           );
   
       return `${left} → ${right}`;
   }
   
   
   function formatReactionSide(items) {
   
       if (!Array.isArray(items)) {
           return "";
       }
   
       return items.map(item => {
   
           const id =
               typeof item === "string"
                   ? item
                   : item.compound;
   
           const coefficient =
               typeof item === "object"
                   ? Number(item.coefficient) || 1
                   : 1;
   
           const formula =
               getCompoundFormula(id);
   
           if (coefficient === 1) {
               return formula;
           }
   
           return `${coefficient}${formula}`;
   
       }).join(" + ");
   }
   
   
   /* =========================================================
      XP SYSTEM
      ========================================================= */
   
   function addXP(amount) {
   
       amount = Number(amount) || 0;
   
       Game.currentXP += amount;
   
       updateLevel();
   }
   
   
   function updateLevel() {
   
       /*
          Simple level curve.
   
          Level 1:
          0 XP
   
          Level 2:
          100 XP
   
          Level 3:
          250 XP
   
          etc.
       */
   
       let newLevel = 1;
   
       let required = 100;
   
       let xp = Game.currentXP;
   
       while (xp >= required) {
   
           newLevel++;
   
           xp -= required;
   
           required =
               100 +
               (newLevel - 2) * 50;
       }
   
       if (newLevel !== Game.level) {
   
           Game.level = newLevel;
   
           showMessage(
               `LEVEL UP! You are now level ${newLevel}!`
           );
       }
   }
   
   
   /* =========================================================
      SAVE SYSTEM
      ========================================================= */
   
   function saveGame() {
   
       const save = {
   
           discoveredCompounds:
               [...Game.discoveredCompounds],
   
           discoveredReactions:
               [...Game.discoveredReactions],
   
           currentXP:
               Game.currentXP,
   
           level:
               Game.level,
   
           reactionHistory:
               Game.reactionHistory.slice(0, 100)
       };
   
       localStorage.setItem(
           CONFIG.STORAGE_KEY,
           JSON.stringify(save)
       );
   }
   
   
   /* =========================================================
      LOAD SAVE
      ========================================================= */
   
function loadSave() {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);

    // Find all actual elements in the database.
    const elementIDs = Game.compounds
        .filter(compound =>
            compound.category === "element" ||
            compound.type === "element"
        )
        .map(compound => compound.id);

    if (!raw) {
        Game.discoveredCompounds = new Set(elementIDs);
        return;
    }

    try {
        const save = JSON.parse(raw);

        Game.discoveredCompounds = new Set(
            save.discoveredCompounds || elementIDs
        );

        // Always make sure the starting elements are available.
        for (const id of elementIDs) {
            Game.discoveredCompounds.add(id);
        }

        Game.discoveredReactions = new Set(
            save.discoveredReactions || []
        );

        Game.currentXP =
            Number(save.currentXP) || 0;

        Game.level =
            Number(save.level) || 1;

        Game.reactionHistory =
            save.reactionHistory || [];

    } catch (error) {
        console.warn(
            "Save file was invalid. Starting fresh.",
            error
        );

        Game.discoveredCompounds = new Set(elementIDs);
        Game.discoveredReactions = new Set();
        Game.currentXP = 0;
        Game.level = 1;
        Game.reactionHistory = [];
    }
}
   
   
   /* =========================================================
      RESET GAME
      ========================================================= */
   
   function resetGame() {
   
       const confirmed =
           confirm(
               "Are you sure you want to erase your ChemCraft progress?"
           );
   
       if (!confirmed) {
           return;
       }
   
       localStorage.removeItem(
           CONFIG.STORAGE_KEY
       );
   
       Game.selectedReactants = [];
       Game.discoveredCompounds = new Set();
       Game.discoveredReactions = new Set();
       Game.currentXP = 0;
       Game.level = 1;
       Game.reactionHistory = [];
   
       refreshUI();
   
       showMessage(
           "Game reset."
       );
   }
   
   
   /* =========================================================
      UI HELPERS
      ========================================================= */
   
   function showMessage(message) {
   
       console.log(message);
   
       const element =
           document.getElementById("message");
   
       if (element) {
           element.textContent = message;
       }
   }
   
   
   function showError(message) {
   
       console.error(message);
   
       const element =
           document.getElementById("error");
   
       if (element) {
   
           element.textContent = message;
   
           element.style.display =
               "block";
       } else {
   
           alert(message);
       }
   }
   
   
   /* =========================================================
      RENDER REACTANTS
      ========================================================= */
   
   function renderReactants() {
   
       const container =
           document.getElementById(
               "reactants"
           );
   
       if (!container) {
           return;
       }
   
       container.innerHTML = "";
   
       Game.selectedReactants.forEach(
           (id, index) => {
   
               const compound =
                   getCompound(id);
   
               const div =
                   document.createElement(
                       "div"
                   );
   
               div.className =
                   "reactant-item";
   
               div.innerHTML = `
                   <span>
                       ${escapeHTML(
                           compound?.formula ||
                           compound?.name ||
                           id
                       )}
                   </span>
   
                   <button
                       type="button"
                       data-remove="${index}">
                       ×
                   </button>
               `;
   
               div.querySelector(
                   "button"
               ).addEventListener(
                   "click",
                   () => removeReactant(index)
               );
   
               container.appendChild(div);
           }
       );
   }
   
   
   /* =========================================================
      RENDER COMPOUND LIST
      ========================================================= */
   
   function renderCompounds(
       searchText = ""
   ) {
   
       const container =
           document.getElementById(
               "compound-list"
           );
   
       if (!container) {
           return;
       }
   
       container.innerHTML = "";
   
       const query =
           searchText
               .trim()
               .toLowerCase();
   
       const filtered =
    Game.compounds.filter(
        compound => {

            // Elements are always available
            const isElement =
                compound.type === "element";

            // Compounds unlock after discovery
            const isDiscovered =
                Game.discoveredCompounds.has(
                    compound.id
                );

            // Hide undiscovered compounds
            if (
                !isElement &&
                !isDiscovered
            ) {
                return false;
            }

            // Search filter
            if (!query) {
                return true;
            }

            const text = [
                compound.name,
                compound.formula,
                compound.category,
                compound.type
            ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

            return text.includes(query);
        }
    );
   
       for (const compound of filtered) {
   
           const button =
               document.createElement(
                   "button"
               );
   
           button.className =
               "compound-button";
   
           button.dataset.id =
               compound.id;
   
           button.innerHTML = `
               <strong>
                   ${escapeHTML(
                       compound.formula ||
                       compound.name
                   )}
               </strong>
   
               <span>
                   ${escapeHTML(
                       compound.name ||
                       compound.id
                   )}
               </span>
           `;
   
           button.addEventListener(
               "click",
               () => addReactant(compound.id)
           );
   
           container.appendChild(button);
       }
   }
   
   
   /* =========================================================
      SEARCH
      ========================================================= */
   
   function setupSearch() {
   
       const input =
           document.getElementById(
               "compound-search"
           );
   
       if (!input) {
           return;
       }
   
       input.addEventListener(
           "input",
           () => {
               renderCompounds(
                   input.value
               );
           }
       );
   }
   
   
   /* =========================================================
      SHOW REACTION RESULT
      ========================================================= */
   
   function showReactionResult(result) {
   
       const container =
           document.getElementById(
               "reaction-result"
           );
   
       if (!container) {
   
           console.log(result);
   
           return;
       }
   
       const productsHTML =
           result.products
               .map(id => {
   
                   const compound =
                       getCompound(id);
   
                   return `
                       <div class="product">
                           <strong>
                               ${escapeHTML(
                                   compound?.formula ||
                                   id
                               )}
                           </strong>
   
                           <span>
                               ${escapeHTML(
                                   compound?.name ||
                                   id
                               )}
                           </span>
                       </div>
                   `;
               })
               .join("");
   
       const conditionsHTML =
           result.conditions.length
               ? `
                   <div>
                       <strong>Conditions:</strong>
                       ${result.conditions
                           .map(
                               escapeHTML
                           )
                           .join(", ")}
                   </div>
                 `
               : "";
   
       container.innerHTML = `
   
           <div class="reaction-card">
   
               ${
                   result.firstDiscovery
                       ? `<div class="new-reaction">
                           NEW REACTION DISCOVERED!
                          </div>`
                       : ""
               }
   
               <h2>
                   ${escapeHTML(
                       result.equation
                   )}
               </h2>
   
               <p>
                   <strong>Type:</strong>
                   ${escapeHTML(
                       result.reactionType
                   )}
               </p>
   
               ${conditionsHTML}
   
               ${
                   result.observation
                       ? `
                           <p>
                               <strong>
                                   Observation:
                               </strong>
   
                               ${escapeHTML(
                                   result.observation
                               )}
                           </p>
                         `
                       : ""
               }
   
               ${
                   result.explanation
                       ? `
                           <p>
                               <strong>
                                   Explanation:
                               </strong>
   
                               ${escapeHTML(
                                   result.explanation
                               )}
                           </p>
                         `
                       : ""
               }
   
               <h3>Products</h3>
   
               <div class="products">
                   ${productsHTML}
               </div>
   
           </div>
       `;
   }
   
   
   /* =========================================================
      NO REACTION
      ========================================================= */
   
   function showNoReaction() {
   
       const container =
           document.getElementById(
               "reaction-result"
           );
   
       if (!container) {
   
           showMessage(
               "No reaction found."
           );
   
           return;
       }
   
       container.innerHTML = `
   
           <div class="no-reaction">
   
               <h2>
                   No Reaction
               </h2>
   
               <p>
                   These substances do not have
                   a reaction registered in the
                   current chemistry database.
               </p>
   
           </div>
       `;
   }
   
   
   /* =========================================================
      STATISTICS
      ========================================================= */
   
   function getStatistics() {
   
       return {
   
           totalCompounds:
               Game.compounds.length,
   
           discoveredCompounds:
               Game.discoveredCompounds.size,
   
           totalReactions:
               Game.reactions.length,
   
           discoveredReactions:
               Game.discoveredReactions.size,
   
           xp:
               Game.currentXP,
   
           level:
               Game.level,
   
           reactionsPerformed:
               Game.reactionHistory.length
       };
   }
   
   
   /* =========================================================
      UPDATE STATISTICS UI
      ========================================================= */
   
   function updateStatistics() {
   
       const stats =
           getStatistics();
   
       setText(
           "compound-count",
           `${stats.discoveredCompounds}/${stats.totalCompounds}`
       );
   
       setText(
           "reaction-count",
           `${stats.discoveredReactions}/${stats.totalReactions}`
       );
   
       setText(
           "xp",
           stats.xp
       );
   
       setText(
           "level",
           stats.level
       );
   }
   
   
   function setText(id, value) {
   
       const element =
           document.getElementById(id);
   
       if (element) {
           element.textContent = value;
       }
   }
   
   
   /* =========================================================
      REACTION HISTORY
      ========================================================= */
   
   function renderHistory() {
   
       const container =
           document.getElementById(
               "reaction-history"
           );
   
       if (!container) {
           return;
       }
   
       container.innerHTML = "";
   
       if (
           Game.reactionHistory.length === 0
       ) {
   
           container.innerHTML =
               "<p>No reactions discovered yet.</p>";
   
           return;
       }
   
       for (
           const result
           of Game.reactionHistory
       ) {
   
           const item =
               document.createElement(
                   "div"
               );
   
           item.className =
               "history-item";
   
           item.textContent =
               result.equation;
   
           container.appendChild(item);
       }
   }
   
   
   /* =========================================================
      MISSIONS
      ========================================================= */
   
   function checkMissions() {
   
       for (const mission of Game.missions) {
   
           /*
              Mission formats can vary, so the engine
              supports several common structures.
           */
   
           if (!mission.id) {
               continue;
           }
   
           const requirement =
               mission.requirement ||
               mission.condition;
   
           if (!requirement) {
               continue;
           }
   
           let completed = false;
   
           if (
               requirement.type ===
               "discover_compound"
           ) {
   
               completed =
                   Game.discoveredCompounds.has(
                       requirement.compound
                   );
           }
   
           if (
               requirement.type ===
               "discover_reaction"
           ) {
   
               completed =
                   Game.discoveredReactions.has(
                       requirement.reaction
                   );
           }
   
           if (
               requirement.type ===
               "discover_count"
           ) {
   
               completed =
                   Game.discoveredCompounds.size >=
                   Number(requirement.count);
           }
   
           if (
               requirement.type ===
               "reaction_count"
           ) {
   
               completed =
                   Game.discoveredReactions.size >=
                   Number(requirement.count);
           }
   
           if (completed) {
   
               console.log(
                   `Mission completed: ${mission.name || mission.id}`
               );
           }
       }
   }
   
   
   /* =========================================================
      ACHIEVEMENTS
      ========================================================= */
   
   function checkAchievements() {
   
       for (
           const achievement
           of Game.achievements
       ) {
   
           if (!achievement.id) {
               continue;
           }
   
           /*
              Basic achievement support.
              Your teammate can expand this later.
           */
   
           const requirement =
               achievement.requirement;
   
           if (!requirement) {
               continue;
           }
   
           let unlocked = false;
   
           if (
               requirement.type ===
               "compounds"
           ) {
   
               unlocked =
                   Game.discoveredCompounds.size >=
                   Number(requirement.count);
           }
   
           if (
               requirement.type ===
               "reactions"
           ) {
   
               unlocked =
                   Game.discoveredReactions.size >=
                   Number(requirement.count);
           }
   
           if (unlocked) {
   
               console.log(
                   `Achievement unlocked: ${
                       achievement.name ||
                       achievement.id
                   }`
               );
           }
       }
   }
   
   
   /* =========================================================
      REFRESH EVERYTHING
      ========================================================= */
   
   function refreshUI() {
   
       renderReactants();
   
       renderCompounds();
   
       renderHistory();
   
       updateStatistics();
   
       checkMissions();
   
       checkAchievements();
   }
   
   
   /* =========================================================
      HTML SAFETY
      ========================================================= */
   
   function escapeHTML(value) {
   
       return String(value)
           .replaceAll("&", "&amp;")
           .replaceAll("<", "&lt;")
           .replaceAll(">", "&gt;")
           .replaceAll('"', "&quot;")
           .replaceAll("'", "&#039;");
   }
   
   
   /* =========================================================
      BUTTON SETUP
      ========================================================= */
   
   function setupButtons() {
   
       const reactButton =
           document.getElementById(
               "react-button"
           );
   
       if (reactButton) {
   
           reactButton.addEventListener(
               "click",
               performReaction
           );
       }
   
   
       const clearButton =
           document.getElementById(
               "clear-button"
           );
   
       if (clearButton) {
   
           clearButton.addEventListener(
               "click",
               clearReactants
           );
       }
   
   
       const resetButton =
           document.getElementById(
               "reset-button"
           );
   
       if (resetButton) {
   
           resetButton.addEventListener(
               "click",
               resetGame
           );
       }
   }
   
   
   /* =========================================================
      KEYBOARD SHORTCUTS
      ========================================================= */
   
   function setupKeyboard() {
   
       document.addEventListener(
           "keydown",
           event => {
   
               /*
                  ENTER = react
               */
   
               if (
                   event.key === "Enter" &&
                   event.target.tagName !== "INPUT"
               ) {
   
                   performReaction();
               }
   
   
               /*
                  ESC = clear
               */
   
               if (event.key === "Escape") {
   
                   clearReactants();
               }
           }
       );
   }
   
   
   /* =========================================================
      START GAME
      ========================================================= */
   
   document.addEventListener(
       "DOMContentLoaded",
       async () => {
   
           setupButtons();
   
           setupSearch();
   
           setupKeyboard();
   
           await initGame();
       }
   );
   
   
   /* =========================================================
      GLOBAL API
      =========================================================
   
      These are intentionally exposed so the HTML or
      another JS file can call them.
   
      Examples:
   
          addReactant("sodium");
   
          performReaction();
   
          clearReactants();
   
          resetGame();
   
      ========================================================= */
   
   window.ChemCraft = {
   
       Game,
   
       addReactant,
   
       removeReactant,
   
       clearReactants,
   
       performReaction,
   
       findMatchingReactions,
   
       getCompound,
   
       getCompoundName,
   
       getCompoundFormula,
   
       getStatistics,
   
       resetGame,
   
       saveGame,
   
       refreshUI
   };
