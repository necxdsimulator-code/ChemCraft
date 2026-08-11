"use strict";

const CONFIG = {
    STORAGE_KEY: "chemcraft_save_v3",
    MAX_REACTANTS: 5,

    STARTING_ELEMENTS: [
        "H", "Li", "Be", "B", "C", "N", "O", "F",
        "Na", "Mg", "Al", "Si", "P", "S", "Cl",
        "K", "Ca", "Ti", "Fe", "Co", "Ni", "Cu",
        "Zn", "Ga", "Br", "Au", "I", "Cs", "Ba",
        "Hg", "Pb", "Sn"
    ]
};

const Game = {
    compounds: [],
    reactions: [],

    compoundMap: new Map(),

    discoveredCompounds: new Set(),
    discoveredReactions: new Set(),

    selectedReactants: [],

    currentXP: 0,
    level: 1,

    reactionHistory: [],

    initialized: false
};


/* =========================================
   DATABASE
========================================= */

async function loadJSON(file) {

    const response = await fetch(
        file + "?v=" + Date.now()
    );

    if (!response.ok) {
        throw new Error(
            "Cannot load " + file
        );
    }

    return await response.json();
}


async function loadDatabase() {

    const compoundsData =
        await loadJSON("compounds.json");

    const reactionsData =
        await loadJSON("reactions.json");

    Game.compounds =
        Array.isArray(compoundsData)
            ? compoundsData
            : compoundsData.compounds || [];

    Game.reactions =
        Array.isArray(reactionsData)
            ? reactionsData
            : reactionsData.reactions || [];

    Game.compoundMap.clear();

    Game.compounds.forEach(compound => {

        if (compound.id !== undefined) {

            Game.compoundMap.set(
                String(compound.id),
                compound
            );
        }
    });

    console.log(
        "Loaded compounds:",
        Game.compounds.length
    );

    console.log(
        "Loaded reactions:",
        Game.reactions.length
    );
}


/* =========================================
   HELPERS
========================================= */

function getCompound(id) {

    return Game.compoundMap.get(
        String(id)
    );
}


function getFormula(id) {

    const c = getCompound(id);

    return c
        ? (c.formula || c.name || id)
        : id;
}


function getName(id) {

    const c = getCompound(id);

    return c
        ? (c.name || c.formula || id)
        : id;
}


/* =========================================
   ELEMENT DETECTION
========================================= */

function isStartingElement(compound) {

    if (!compound) {
        return false;
    }

    const formula =
        String(
            compound.formula || ""
        ).trim();

    const symbol =
        String(
            compound.symbol || ""
        ).trim();

    /*
       Support ALL common ways the
       database may describe an element.
    */

    if (
        CONFIG.STARTING_ELEMENTS.includes(
            formula
        )
    ) {
        return true;
    }

    if (
        CONFIG.STARTING_ELEMENTS.includes(
            symbol
        )
    ) {
        return true;
    }

    if (
        compound.category === "element" &&
        CONFIG.STARTING_ELEMENTS.includes(
            formula
        )
    ) {
        return true;
    }

    if (
        compound.type === "element" &&
        CONFIG.STARTING_ELEMENTS.includes(
            formula
        )
    ) {
        return true;
    }

    return false;
}


function getStartingElements() {

    const result = [];

    for (
        const compound
        of Game.compounds
    ) {

        if (
            isStartingElement(
                compound
            )
        ) {

            result.push(
                String(compound.id)
            );
        }
    }

    console.log(
        "FOUND STARTING ELEMENTS:",
        result.length
    );

    console.log(
        result.map(
            id => getFormula(id)
        )
    );

    return result;
}


/* =========================================
   SAVE / LOAD
========================================= */

function saveGame() {

    localStorage.setItem(
        CONFIG.STORAGE_KEY,

        JSON.stringify({

            discoveredCompounds:
                [...Game.discoveredCompounds],

            discoveredReactions:
                [...Game.discoveredReactions],

            currentXP:
                Game.currentXP,

            level:
                Game.level,

            reactionHistory:
                Game.reactionHistory
        })
    );
}


function loadSave() {

    /*
       ALWAYS start with the elements.
    */

    Game.discoveredCompounds =
        new Set(
            getStartingElements()
        );

    Game.discoveredReactions =
        new Set();

    Game.currentXP = 0;

    Game.level = 1;

    Game.reactionHistory = [];


    const saved =
        localStorage.getItem(
            CONFIG.STORAGE_KEY
        );

    if (!saved) {
        return;
    }

    try {

        const data =
            JSON.parse(saved);


        if (
            Array.isArray(
                data.discoveredCompounds
            )
        ) {

            data.discoveredCompounds.forEach(
                id => {

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
            );
        }


        if (
            Array.isArray(
                data.discoveredReactions
            )
        ) {

            Game.discoveredReactions =
                new Set(
                    data.discoveredReactions
                );
        }


        Game.currentXP =
            Number(
                data.currentXP
            ) || 0;


        Game.level =
            Number(
                data.level
            ) || 1;


        if (
            Array.isArray(
                data.reactionHistory
            )
        ) {

            Game.reactionHistory =
                data.reactionHistory;
        }

    } catch (error) {

        console.log(
            "Starting fresh."
        );
    }
}


/* =========================================
   INVENTORY
========================================= */

function renderCompounds() {

    const list =
        document.getElementById(
            "compound-list"
        );

    if (!list) {

        console.error(
            "compound-list not found"
        );

        return;
    }


    list.innerHTML = "";


    const search =
        document.getElementById(
            "compound-search"
        );


    const query =
        search
            ? search.value
                .toLowerCase()
                .trim()
            : "";


    let count = 0;


    for (
        const compound
        of Game.compounds
    ) {

        const id =
            String(compound.id);


        const element =
            isStartingElement(
                compound
            );


        const discovered =
            Game.discoveredCompounds.has(
                id
            );


        /*
           IMPORTANT:

           Elements are visible immediately.

           Other compounds are visible
           only after discovery.
        */

        if (
            !element &&
            !discovered
        ) {

            continue;
        }


        const searchable =
            (
                (compound.name || "") +
                " " +
                (compound.formula || "")
            )
            .toLowerCase();


        if (
            query &&
            !searchable.includes(
                query
            )
        ) {

            continue;
        }


        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";

        button.className =
            "compound-button";


        button.innerHTML = `
            <strong>
                ${escapeHTML(
                    compound.formula ||
                    compound.name ||
                    id
                )}
            </strong>

            <span>
                ${escapeHTML(
                    compound.name ||
                    id
                )}
            </span>
        `;


        button.onclick =
            function () {

                addReactant(id);
            };


        list.appendChild(
            button
        );


        count++;
    }


    if (count === 0) {

        list.innerHTML = `
            <p>
                No chemicals found.
            </p>
        `;
    }


    console.log(
        "Inventory displayed:",
        count
    );
}


/* =========================================
   SEARCH
========================================= */

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
        renderCompounds
    );
}


/* =========================================
   REACTANTS
========================================= */

function addReactant(id) {

    if (
        Game.selectedReactants.length >=
        CONFIG.MAX_REACTANTS
    ) {

        showMessage(
            "Maximum 5 reactants."
        );

        return;
    }


    if (
        !Game.discoveredCompounds.has(
            String(id)
        )
    ) {

        return;
    }


    Game.selectedReactants.push(
        String(id)
    );


    renderReactants();
}


function renderReactants() {

    const area =
        document.getElementById(
            "reactants"
        );

    if (!area) {
        return;
    }


    area.innerHTML = "";


    Game.selectedReactants.forEach(
        (id, index) => {

            const div =
                document.createElement(
                    "div"
                );


            div.innerHTML = `
                <span>
                    ${escapeHTML(
                        getFormula(id)
                    )}
                </span>

                <button
                    type="button">
                    ×
                </button>
            `;


            div.querySelector(
                "button"
            ).onclick =
                function () {

                    Game.selectedReactants.splice(
                        index,
                        1
                    );

                    renderReactants();
                };


            area.appendChild(
                div
            );
        }
    );
}


/* =========================================
   REACTION
========================================= */

function getReactantIDs(reaction) {

    return (
        reaction.reactants || []
    )
    .map(item => {

        if (
            typeof item === "string"
        ) {
            return String(item);
        }

        return String(
            item.compound ||
            item.id
        );
    });
}


function getProductIDs(reaction) {

    return (
        reaction.products || []
    )
    .map(item => {

        if (
            typeof item === "string"
        ) {
            return String(item);
        }

        return String(
            item.compound ||
            item.id
        );
    });
}


function findReaction() {

    const selected =
        [...Game.selectedReactants]
        .sort();


    for (
        const reaction
        of Game.reactions
    ) {

        const expected =
            getReactantIDs(
                reaction
            )
            .sort();


        if (
            JSON.stringify(
                selected
            ) ===
            JSON.stringify(
                expected
            )
        ) {

            return reaction;
        }
    }


    return null;
}


function performReaction() {

    if (
        Game.selectedReactants.length === 0
    ) {

        showMessage(
            "Add chemicals first."
        );

        return;
    }


    const reaction =
        findReaction();


    if (!reaction) {

        showMessage(
            "No reaction found."
        );

        return;
    }


    const products =
        getProductIDs(
            reaction
        );


    let newCompound =
        false;


    products.forEach(
        id => {

            if (
                !Game.discoveredCompounds.has(
                    id
                )
            ) {

                Game.discoveredCompounds.add(
                    id
                );

                newCompound = true;
            }
        }
    );


    Game.discoveredReactions.add(
        String(reaction.id)
    );


    Game.currentXP +=
        newCompound
            ? 35
            : 10;


    Game.level =
        Math.floor(
            Game.currentXP / 100
        ) + 1;


    Game.reactionHistory.unshift({

        equation:
            reaction.equation || "",

        reactants:
            [...Game.selectedReactants],

        products:
            [...products],

        date:
            new Date().toISOString()
    });


    saveGame();


    showReactionResult(
        reaction,
        products,
        newCompound
    );


    renderCompounds();

    updateStats();
}


/* =========================================
   RESULT
========================================= */

function showReactionResult(
    reaction,
    products,
    newCompound
) {

    const result =
        document.getElementById(
            "reaction-result"
        );

    if (!result) {
        return;
    }


    result.innerHTML = `

        ${
            newCompound
                ? `
                    <h3>
                        NEW COMPOUND DISCOVERED!
                    </h3>
                  `
                : ""
        }

        <p>
            ${escapeHTML(
                reaction.equation ||
                "Reaction complete"
            )}
        </p>

        <div>
            ${products
                .map(
                    id => `
                        <div>
                            <strong>
                                ${escapeHTML(
                                    getFormula(id)
                                )}
                            </strong>

                            ${escapeHTML(
                                getName(id)
                            )}
                        </div>
                    `
                )
                .join("")
            }
        </div>
    `;
}


/* =========================================
   STATS
========================================= */

function updateStats() {

    const level =
        document.getElementById(
            "level"
        );

    const xp =
        document.getElementById(
            "xp"
        );

    const compounds =
        document.getElementById(
            "compound-count"
        );

    const reactions =
        document.getElementById(
            "reaction-count"
        );


    if (level) {

        level.textContent =
            Game.level;
    }


    if (xp) {

        xp.textContent =
            Game.currentXP;
    }


    if (compounds) {

        compounds.textContent =
            Game.discoveredCompounds.size +
            "/" +
            Game.compounds.length;
    }


    if (reactions) {

        reactions.textContent =
            Game.discoveredReactions.size +
            "/" +
            Game.reactions.length;
    }
}


/* =========================================
   MESSAGE
========================================= */

function showMessage(
    text
) {

    const message =
        document.getElementById(
            "message"
        );

    if (message) {

        message.textContent =
            text;
    }

    console.log(text);
}


/* =========================================
   RESET
========================================= */

function resetGame() {

    if (
        !confirm(
            "Reset all ChemCraft progress?"
        )
    ) {

        return;
    }


    localStorage.removeItem(
        CONFIG.STORAGE_KEY
    );


    Game.selectedReactants = [];

    Game.discoveredReactions =
        new Set();

    Game.currentXP = 0;

    Game.level = 1;

    Game.reactionHistory = [];


    /*
       Restore the starting elements.
    */

    Game.discoveredCompounds =
        new Set(
            getStartingElements()
        );


    saveGame();

    renderCompounds();

    renderReactants();

    updateStats();

    showMessage(
        "Progress reset. Elements restored."
    );
}


/* =========================================
   REFRESH
========================================= */

function refreshUI() {

    renderCompounds();

    renderReactants();

    updateStats();
}


/* =========================================
   START
========================================= */
async function startChemCraft() {

    try {

        console.log("Starting ChemCraft...");

        /*
         * STEP 1
         * Load ONLY compounds first.
         */
        const compoundsData =
            await loadJSON("compounds.json");

        Game.compounds =
            Array.isArray(compoundsData)
                ? compoundsData
                : compoundsData.compounds || [];


        /*
         * Build the compound lookup table.
         */
        Game.compoundMap.clear();

        for (
            const compound
            of Game.compounds
        ) {

            if (
                compound &&
                compound.id
            ) {

                Game.compoundMap.set(
                    String(compound.id),
                    compound
                );
            }
        }


        /*
         * STEP 2
         * Load the saved inventory.
         *
         * At this point we already have
         * compounds.json, so the 32 elements
         * can be displayed.
         */
        loadSave();


        /*
         * STEP 3
         * Mark the game as usable.
         */
        Game.initialized = true;


        /*
         * Set up the interface.
         */
        setupSearch();


        const reactButton =
            document.getElementById(
                "react-button"
            );

        if (reactButton) {

            reactButton.onclick =
                performReaction;
        }


        const clearButton =
            document.getElementById(
                "clear-button"
            );

        if (clearButton) {

            clearButton.onclick =
                function () {

                    Game.selectedReactants =
                        [];

                    renderReactants();
                };
        }


        const resetButton =
            document.getElementById(
                "reset-button"
            );

        if (resetButton) {

            resetButton.onclick =
                resetGame;
        }


        /*
         * STEP 4
         * SHOW THE INVENTORY NOW.
         *
         * We do NOT wait for reactions.json.
         */
        refreshUI();


        console.log(
            "Inventory displayed!"
        );

        console.log(
            "Starting elements:",
            getStartingElements().length
        );


        /*
         * STEP 5
         * NOW load reactions in the background.
         *
         * The user can already see the inventory
         * while this is happening.
         */
        loadJSON("reactions.json")
            .then(function (reactionsData) {

                Game.reactions =
                    Array.isArray(reactionsData)
                        ? reactionsData
                        : reactionsData.reactions || [];


                console.log(
                    "Reactions loaded:",
                    Game.reactions.length
                );


                updateStats();


                showMessage(
                    "Chemistry database ready!"
                );

            })
            .catch(function (error) {

                console.error(
                    "Could not load reactions:",
                    error
                );

                showMessage(
                    "Inventory ready. Reactions are still loading."
                );
            });


    }

    catch (error) {

        console.error(
            "ChemCraft startup error:",
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
            "Could not load chemistry database."
        );
    }
}

/* =========================================
   SECURITY
========================================= */

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


document.addEventListener(
    "DOMContentLoaded",
    startChemCraft
);


/* Global functions */

window.Game =
    Game;

window.performReaction =
    performReaction;

window.resetGame =
    resetGame;

window.addReactant =
    addReactant;

window.refreshUI =
    refreshUI;
   
       saveGame,
   
       refreshUI
   };
