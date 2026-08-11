"use strict";

/* =========================================================
   CHEMCRAFT
   New Level-Based Chemistry System

   LEVEL = ELEMENTS AVAILABLE
   DISCOVERY = COMPOUNDS YOU HAVE ACTUALLY MADE

   Level 1 : H C N O Na Cl K Ca
   Level 2 : Mg Al S P F Li
   Level 3 : Fe Cu Zn Si Ti Br
   Level 4 : Co Ni Be B Ga I
   Level 5 : Au Cs Ba Hg Pb Sn
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const CONFIG = {

    SAVE_KEY: "chemcraft_level_system_v1",

    MAX_REACTANTS: 5,

    ELEMENTS_BY_LEVEL: {

        1: [
            "H",
            "C",
            "N",
            "O",
            "Na",
            "Cl",
            "K",
            "Ca"
        ],

        2: [
            "Mg",
            "Al",
            "S",
            "P",
            "F",
            "Li"
        ],

        3: [
            "Fe",
            "Cu",
            "Zn",
            "Si",
            "Ti",
            "Br"
        ],

        4: [
            "Co",
            "Ni",
            "Be",
            "B",
            "Ga",
            "I"
        ],

        5: [
            "Au",
            "Cs",
            "Ba",
            "Hg",
            "Pb",
            "Sn"
        ]
    }
};


/* =========================================================
   GAME STATE
   ========================================================= */

const Game = {

    /* Database */

    compounds: [],

    reactions: [],

    compoundMap: new Map(),

    /* Progress */

    level: 1,

    xp: 0,

    /* Things the player has actually discovered */

    discoveredCompounds: new Set(),

    discoveredReactions: new Set(),

    /* Currently selected reactants */

    selectedReactants: [],

    /* History */

    reactionHistory: [],

    /* Loading */

    compoundsLoaded: false,

    reactionsLoaded: false,

    initialized: false
};


/* =========================================================
   DATABASE LOADING
   ========================================================= */

async function loadJSON(filename) {

    const response = await fetch(
        filename + "?v=" + Date.now()
    );

    if (!response.ok) {

        throw new Error(
            "Could not load " +
            filename +
            " (HTTP " +
            response.status +
            ")"
        );
    }

    return await response.json();
}


/* ---------------------------------------------------------
   LOAD COMPOUNDS
   --------------------------------------------------------- */

async function loadCompounds() {

    console.log(
        "Loading compounds.json..."
    );

    const data =
        await loadJSON(
            "compounds.json"
        );


    /*
       Support both:

       [
          {...},
          {...}
       ]

       and:

       {
          "compounds": [...]
       }
    */

    if (Array.isArray(data)) {

        Game.compounds = data;

    } else {

        Game.compounds =
            data.compounds || [];
    }


    /*
       Build ID -> compound lookup.
    */

    Game.compoundMap.clear();


    for (
        const compound
        of Game.compounds
    ) {

        if (
            compound &&
            compound.id !== undefined
        ) {

            Game.compoundMap.set(
                String(compound.id),
                compound
            );
        }
    }


    Game.compoundsLoaded = true;


    console.log(
        "Compounds loaded:",
        Game.compounds.length
    );
}


/* ---------------------------------------------------------
   LOAD REACTIONS
   --------------------------------------------------------- */

async function loadReactions() {

    console.log(
        "Loading reactions.json..."
    );


    try {

        const data =
            await loadJSON(
                "reactions.json"
            );


        if (Array.isArray(data)) {

            Game.reactions = data;

        } else {

            Game.reactions =
                data.reactions || [];
        }


        Game.reactionsLoaded = true;


        console.log(
            "Reactions loaded:",
            Game.reactions.length
        );


        updateStats();


        showMessage(
            "ChemCraft ready!"
        );


    } catch (error) {

        console.error(
            "Reaction database error:",
            error
        );

        showMessage(
            "Elements loaded. Reactions are still unavailable."
        );
    }
}


/* =========================================================
   COMPOUND HELPERS
   ========================================================= */

function getCompound(id) {

    return Game.compoundMap.get(
        String(id)
    );
}


function getFormula(id) {

    const compound =
        getCompound(id);


    if (!compound) {

        return String(id);
    }


    return (
        compound.formula ||
        compound.symbol ||
        compound.name ||
        String(id)
    );
}


function getName(id) {

    const compound =
        getCompound(id);


    if (!compound) {

        return String(id);
    }


    return (
        compound.name ||
        compound.common_name ||
        compound.formula ||
        String(id)
    );
}


/* =========================================================
   LEVEL SYSTEM
   ========================================================= */

/*
   Return ALL elements unlocked up to the
   player's current level.
*/

function getUnlockedElementSymbols() {

    const symbols = [];


    for (
        let level = 1;
        level <= Game.level;
        level++
    ) {

        const elements =
            CONFIG.ELEMENTS_BY_LEVEL[
                level
            ] || [];


        for (
            const symbol
            of elements
        ) {

            if (
                !symbols.includes(symbol)
            ) {

                symbols.push(symbol);
            }
        }
    }


    return symbols;
}


/* ---------------------------------------------------------
   Find the actual database IDs of the
   elements unlocked at the current level.
   --------------------------------------------------------- */

function getUnlockedElementIDs() {

    const symbols =
        getUnlockedElementSymbols();


    const ids = [];


    for (
        const compound
        of Game.compounds
    ) {

        const formula =
            String(
                compound.formula || ""
            ).trim();


        const symbol =
            String(
                compound.symbol || ""
            ).trim();


        if (
            symbols.includes(formula) ||
            symbols.includes(symbol)
        ) {

            ids.push(
                String(compound.id)
            );
        }
    }


    return ids;
}


/* =========================================================
   LEVEL UP
   ========================================================= */

/*
   XP requirements:

   Level 1 -> 100 XP
   Level 2 -> 250 XP
   Level 3 -> 450 XP
   Level 4 -> 700 XP
   Level 5 -> 1000 XP

   After level 5 the game stays at level 5.
*/

function calculateLevel(xp) {

    if (xp >= 1000) return 5;

    if (xp >= 700) return 4;

    if (xp >= 450) return 3;

    if (xp >= 250) return 2;

    return 1;
}


function updateLevel() {

    const oldLevel =
        Game.level;


    const newLevel =
        calculateLevel(
            Game.xp
        );


    Game.level =
        newLevel;


    if (
        newLevel > oldLevel
    ) {

        const newElements =
            CONFIG
                .ELEMENTS_BY_LEVEL[
                    newLevel
                ] || [];


        showMessage(
            "LEVEL " +
            newLevel +
            "! New elements unlocked: " +
            newElements.join(", ")
        );


        /*
           Newly unlocked elements are
           automatically available.

           NOTHING else is automatically
           discovered.
        */

        renderInventory();
    }
}


/* =========================================================
   SAVE SYSTEM
   ========================================================= */

function saveGame() {

    const saveData = {

        level:
            Game.level,

        xp:
            Game.xp,

        discoveredCompounds:
            Array.from(
                Game.discoveredCompounds
            ),

        discoveredReactions:
            Array.from(
                Game.discoveredReactions
            ),

        reactionHistory:
            Game.reactionHistory
    };


    localStorage.setItem(
        CONFIG.SAVE_KEY,
        JSON.stringify(
            saveData
        )
    );
}


/* ---------------------------------------------------------
   LOAD SAVE
   --------------------------------------------------------- */

function loadGame() {

    /*
       Start from a completely clean
       level-1 state.
    */

    Game.level = 1;

    Game.xp = 0;

    Game.discoveredCompounds =
        new Set();

    Game.discoveredReactions =
        new Set();

    Game.reactionHistory = [];


    const saved =
        localStorage.getItem(
            CONFIG.SAVE_KEY
        );


    if (!saved) {

        console.log(
            "No ChemCraft save found."
        );

        return;
    }


    try {

        const data =
            JSON.parse(saved);


        Game.level =
            Number(
                data.level
            ) || 1;


        Game.xp =
            Number(
                data.xp
            ) || 0;


        /*
           Restore only compounds that
           actually exist in the database.
        */

        if (
            Array.isArray(
                data.discoveredCompounds
            )
        ) {

            for (
                const id
                of data.discoveredCompounds
            ) {

                if (
                    Game.compoundMap.has(
                        String(id)
                    )
                ) {

                    Game.discoveredCompounds.add(
                        String(id)
                    );
                }
            }
        }


        if (
            Array.isArray(
                data.discoveredReactions
            )
        ) {

            Game.discoveredReactions =
                new Set(
                    data.discoveredReactions
                        .map(String)
                );
        }


        if (
            Array.isArray(
                data.reactionHistory
            )
        ) {

            Game.reactionHistory =
                data.reactionHistory;
        }


        /*
           Safety:
           Level can never be outside 1-5.
        */

        Game.level =
            Math.max(
                1,
                Math.min(
                    5,
                    Game.level
                )
            );


        console.log(
            "Save loaded.",
            "Level:",
            Game.level,
            "XP:",
            Game.xp
        );


    } catch (error) {

        console.warn(
            "Save was invalid. Starting fresh."
        );


        Game.level = 1;

        Game.xp = 0;

        Game.discoveredCompounds =
            new Set();

        Game.discoveredReactions =
            new Set();

        Game.reactionHistory = [];
    }
}


/* =========================================================
   INVENTORY LOGIC
   ========================================================= */

/*
   IMPORTANT:

   A substance is visible if:

   1. It is an element unlocked by level

   OR

   2. It is a compound that the player
      has actually discovered.
*/

function isAvailableInInventory(
    compound
) {

    const id =
        String(
            compound.id
        );


    /*
       Previously discovered compound.
    */

    if (
        Game.discoveredCompounds.has(
            id
        )
    ) {

        return true;
    }


    /*
       Is it an unlocked element?
    */

    const unlockedElements =
        getUnlockedElementSymbols();


    const formula =
        String(
            compound.formula || ""
        ).trim();


    const symbol =
        String(
            compound.symbol || ""
        ).trim();


    if (
        unlockedElements.includes(
            formula
        ) ||
        unlockedElements.includes(
            symbol
        )
    ) {

        return true;
    }


    return false;
}


/* =========================================================
   RENDER INVENTORY
   ========================================================= */

function renderInventory(
    searchText = ""
) {

    const container =
        document.getElementById(
            "compound-list"
        );


    if (!container) {

        console.error(
            "Could not find #compound-list"
        );

        return;
    }


    container.innerHTML = "";


    const query =
        String(
            searchText
        )
        .trim()
        .toLowerCase();


    /*
       Only render things that are
       currently available.
    */

    const available =
        Game.compounds.filter(
            compound => {

                if (
                    !isAvailableInInventory(
                        compound
                    )
                ) {

                    return false;
                }


                if (!query) {

                    return true;
                }


                const text =
                    (
                        (compound.name || "") +
                        " " +
                        (compound.formula || "")
                    )
                    .toLowerCase();


                return text.includes(
                    query
                );
            }
        );


    /*
       If there is nothing available,
       something is wrong.
    */

    if (
        available.length === 0
    ) {

        container.innerHTML = `
            <p>
                No chemicals available.
            </p>
        `;

        console.warn(
            "Inventory is empty."
        );

        return;
    }


    /*
       Create actual usable buttons.
    */

    for (
        const compound
        of available
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.className =
            "compound-button";


        button.dataset.id =
            compound.id;


        button.innerHTML = `

            <strong>
                ${escapeHTML(
                    compound.formula ||
                    compound.symbol ||
                    compound.name
                )}
            </strong>

            <span>
                ${escapeHTML(
                    compound.name ||
                    ""
                )}
            </span>

        `;


        button.addEventListener(
            "click",
            function () {

                addReactant(
                    compound.id
                );
            }
        );


        container.appendChild(
            button
        );
    }


    console.log(
        "Inventory rendered:",
        available.length,
        "items"
    );
}


/* =========================================================
   SEARCH
   ========================================================= */

function setupSearch() {

    const search =
        document.getElementById(
            "compound-search"
        );


    if (!search) {

        return;
    }


    search.addEventListener(
        "input",
        function () {

            renderInventory(
                search.value
            );
        }
    );
}


/* =========================================================
   REACTANT SELECTION
   ========================================================= */

function addReactant(
    id
) {

    const compound =
        getCompound(id);


    if (!compound) {

        return;
    }


    if (
        Game.selectedReactants.length
        >=
        CONFIG.MAX_REACTANTS
    ) {

        showMessage(
            "You can select a maximum of 5 reactants."
        );

        return;
    }


    /*
       Don't allow a hidden compound
       to be manually added.
    */

    if (
        !isAvailableInInventory(
            compound
        )
    ) {

        showMessage(
            "You have not discovered this compound yet."
        );

        return;
    }


    Game.selectedReactants.push(
        String(id)
    );


    renderReactants();
}


/* ---------------------------------------------------------
   RENDER SELECTED REACTANTS
   --------------------------------------------------------- */

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
        function (
            id,
            index
        ) {

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
                    type="button">
                    ×
                </button>

            `;


            const removeButton =
                div.querySelector(
                    "button"
                );


            removeButton.addEventListener(
                "click",
                function () {

                    Game.selectedReactants.splice(
                        index,
                        1
                    );


                    renderReactants();
                }
            );


            container.appendChild(
                div
            );
        }
    );
}


/* =========================================================
   REACTION DATA HELPERS
   ========================================================= */

function getReactionReactants(
    reaction
) {

    return (
        reaction.reactants || []
    )
    .map(
        function (item) {

            if (
                typeof item ===
                "string"
            ) {

                return String(item);
            }


            return String(
                item.compound ||
                item.id ||
                ""
            );
        }
    )
    .filter(Boolean);
}


function getReactionProducts(
    reaction
) {

    return (
        reaction.products || []
    )
    .map(
        function (item) {

            if (
                typeof item ===
                "string"
            ) {

                return String(item);
            }


            return String(
                item.compound ||
                item.id ||
                ""
            );
        }
    )
    .filter(Boolean);
}


/* =========================================================
   REACTION MATCHING
   ========================================================= */

function arraysEqual(
    a,
    b
) {

    if (
        a.length !==
        b.length
    ) {

        return false;
    }


    for (
        let i = 0;
        i < a.length;
        i++
    ) {

        if (
            String(a[i]) !==
            String(b[i])
        ) {

            return false;
        }
    }


    return true;
}


function findMatchingReaction() {

    if (
        !Game.reactionsLoaded
    ) {

        showMessage(
            "Reactions are still loading..."
        );

        return null;
    }


    const selected =
        Game.selectedReactants
            .map(String)
            .sort();


    for (
        const reaction
        of Game.reactions
    ) {

        const expected =
            getReactionReactants(
                reaction
            )
            .map(String)
            .sort();


        if (
            arraysEqual(
                selected,
                expected
            )
        ) {

            return reaction;
        }
    }


    return null;
}


/* =========================================================
   PERFORM REACTION
   ========================================================= */

function performReaction() {

    if (
        Game.selectedReactants.length
        === 0
    ) {

        showMessage(
            "Select at least one reactant."
        );

        return;
    }


    if (
        !Game.reactionsLoaded
    ) {

        showMessage(
            "Reactions are still loading. Please wait a moment."
        );

        return;
    }


    const reaction =
        findMatchingReaction();


    if (!reaction) {

        showMessage(
            "No reaction found for these reactants."
        );

        return;
    }


    const products =
        getReactionProducts(
            reaction
        );


    let newCompound =
        false;


    /*
       ONLY HERE do compounds become
       discovered.
    */

    for (
        const productID
        of products
    ) {

        if (
            !Game.discoveredCompounds.has(
                String(productID)
            )
        ) {

            /*
               Safety: don't add an ID
               that doesn't exist.
            */

            if (
                Game.compoundMap.has(
                    String(productID)
                )
            ) {

                Game.discoveredCompounds.add(
                    String(productID)
                );

                newCompound = true;
            }
        }
    }


    const reactionID =
        String(
            reaction.id
        );


    const firstReaction =
        !Game.discoveredReactions.has(
            reactionID
        );


    Game.discoveredReactions.add(
        reactionID
    );


    /*
       XP

       New compound:
       +35 XP

       Known compound:
       +10 XP
    */

    if (
        newCompound
    ) {

        Game.xp += 35;

    } else {

        Game.xp += 10;
    }


    const oldLevel =
        Game.level;


    updateLevel();


    /*
       If level didn't change,
       still refresh stats.
    */

    if (
        Game.level === oldLevel
    ) {

        updateStats();
    }


    /*
       Save the discovery.
    */

    Game.reactionHistory.unshift({

        reactionID:
            reactionID,

        equation:
            reaction.equation || "",

        reactants:
            [...Game.selectedReactants],

        products:
            [...products],

        timestamp:
            new Date().toISOString()
    });


    /*
       Don't let history become enormous.
    */

    Game.reactionHistory =
        Game.reactionHistory.slice(
            0,
            100
        );


    saveGame();


    showReactionResult(
        reaction,
        products,
        newCompound,
        firstReaction
    );


    /*
       Newly discovered compounds
       now appear in inventory.
    */

    renderInventory();

    updateStats();
}


/* =========================================================
   REACTION RESULT
   ========================================================= */

function showReactionResult(
    reaction,
    products,
    newCompound,
    firstReaction
) {

    const container =
        document.getElementById(
            "reaction-result"
        );


    if (!container) {

        return;
    }


    let html = "";


    if (
        newCompound
    ) {

        html += `
            <h3>
                🎉 NEW COMPOUND DISCOVERED!
            </h3>
        `;
    }


    if (
        firstReaction
    ) {

        html += `
            <p>
                New reaction discovered!
            </p>
        `;
    }


    if (
        reaction.equation
    ) {

        html += `
            <p>
                <strong>
                    ${escapeHTML(
                        reaction.equation
                    )}
                </strong>
            </p>
        `;
    }


    html += `
        <h4>
            Products
        </h4>
    `;


    for (
        const id
        of products
    ) {

        html += `
            <div>
                <strong>
                    ${escapeHTML(
                        getFormula(id)
                    )}
                </strong>

                —
                ${escapeHTML(
                    getName(id)
                )}
            </div>
        `;
    }


    if (
        reaction.conditions
    ) {

        html += `
            <p>
                <strong>
                    Conditions:
                </strong>

                ${escapeHTML(
                    reaction.conditions
                )}
            </p>
        `;
    }


    container.innerHTML =
        html;
}


/* =========================================================
   STATS
   ========================================================= */

function updateStats() {

    const level =
        document.getElementById(
            "level"
        );


    const xp =
        document.getElementById(
            "xp"
        );


    const compoundCount =
        document.getElementById(
            "compound-count"
        );


    const reactionCount =
        document.getElementById(
            "reaction-count"
        );


    if (level) {

        level.textContent =
            Game.level;
    }


    if (xp) {

        xp.textContent =
            Game.xp;
    }


    if (compoundCount) {

        compoundCount.textContent =
            Game.discoveredCompounds.size +
            "/" +
            Game.compounds.length;
    }


    if (reactionCount) {

        reactionCount.textContent =
            Game.discoveredReactions.size +
            "/" +
            Game.reactions.length;
    }
}


/* =========================================================
   MESSAGE
   ========================================================= */

function showMessage(
    message
) {

    const element =
        document.getElementById(
            "message"
        );


    if (element) {

        element.textContent =
            message;
    }


    console.log(
        message
    );
}


/* =========================================================
   RESET
   ========================================================= */

function resetGame() {

    const confirmed =
        confirm(
            "Reset all ChemCraft progress?"
        );


    if (!confirmed) {

        return;
    }


    localStorage.removeItem(
        CONFIG.SAVE_KEY
    );


    Game.level = 1;

    Game.xp = 0;

    Game.discoveredCompounds =
        new Set();

    Game.discoveredReactions =
        new Set();

    Game.selectedReactants =
        [];

    Game.reactionHistory =
        [];


    saveGame();


    renderInventory();

    renderReactants();

    updateStats();


    showMessage(
        "Progress reset. Level 1 elements restored."
    );
}


/* =========================================================
   REFRESH UI
   ========================================================= */

function refreshUI() {

    renderInventory();

    renderReactants();

    updateStats();
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
            function () {

                Game.selectedReactants =
                    [];

                renderReactants();
            }
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
   HTML SAFETY
   ========================================================= */

function escapeHTML(
    value
) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initChemCraft() {

    console.log(
        "================================"
    );

    console.log(
        "CHEMCRAFT STARTING"
    );

    console.log(
        "================================"
    );


    try {

        /*
           STEP 1

           Load compounds first.

           This is only 825 compounds.
        */

        await loadCompounds();


        /*
           STEP 2

           Load saved progress.
        */

        loadGame();


        /*
           STEP 3

           Set up UI.
        */

        setupButtons();

        setupSearch();


        /*
           STEP 4

           Immediately render the
           currently available elements
           and discovered compounds.
        */

        Game.initialized =
            true;


        renderInventory();

        renderReactants();

        updateStats();


        console.log(
            "Inventory ready."
        );


        console.log(
            "Current level:",
            Game.level
        );


        console.log(
            "Available elements:",
            getUnlockedElementSymbols()
        );


        /*
           STEP 5

           Load the 1,600 reactions
           AFTER the inventory is visible.
        */

        loadReactions();


    } catch (error) {

        console.error(
            "CHEMCRAFT STARTUP ERROR:",
            error
        );


        const errorBox =
            document.getElementById(
                "error"
            );


        if (errorBox) {

            errorBox.style.display =
                "block";


            errorBox.textContent =
                error.message;
        }


        showMessage(
            "Could not load the chemistry database."
        );
    }
}


/* =========================================================
   START
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initChemCraft
);


/* =========================================================
   GLOBAL ACCESS
   ========================================================= */

window.ChemCraft = {

    Game,

    addReactant,

    performReaction,

    resetGame,

    refreshUI,

    renderInventory,

    renderReactants,

    getCompound,

    getFormula,

    getName
};
   
       saveGame,
   
       refreshUI
   };
