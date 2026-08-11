"use strict";

const CONFIG = {
    STORAGE_KEY: "chemcraft_save_v2",
    MAX_REACTANTS: 5,

    STARTING_ELEMENTS: new Set([
        "H", "Li", "Be", "B", "C", "N", "O", "F",
        "Na", "Mg", "Al", "Si", "P", "S", "Cl",
        "K", "Ca", "Ti", "Fe", "Co", "Ni", "Cu",
        "Zn", "Ga", "Br", "Au", "I", "Cs", "Ba",
        "Hg", "Pb", "Sn"
    ])
};

const Game = {
    compounds: [],
    reactions: [],

    compoundMap: new Map(),

    selectedReactants: [],

    discoveredCompounds: new Set(),
    discoveredReactions: new Set(),

    currentXP: 0,
    level: 1,

    reactionHistory: [],

    initialized: false
};


/* =========================
   LOAD DATABASE
========================= */

async function loadJSON(file) {

    const response = await fetch(
        file + "?v=" + Date.now()
    );

    if (!response.ok) {
        throw new Error(
            "Could not load " +
            file +
            " (" +
            response.status +
            ")"
        );
    }

    return await response.json();
}


async function loadDatabase() {

    console.log("Loading chemistry database...");

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

    console.log(
        "Compounds loaded:",
        Game.compounds.length
    );

    console.log(
        "Reactions loaded:",
        Game.reactions.length
    );
}


/* =========================
   INDEX DATABASE
========================= */

function buildIndexes() {

    Game.compoundMap.clear();

    for (const compound of Game.compounds) {

        if (compound && compound.id) {

            Game.compoundMap.set(
                String(compound.id),
                compound
            );
        }
    }
}


/* =========================
   COMPOUND HELPERS
========================= */

function getCompound(id) {

    return Game.compoundMap.get(
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
        id
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
        compound.name ||
        id
    );
}


/* =========================
   ELEMENT DETECTION
========================= */

function isElement(compound) {

    if (!compound) {
        return false;
    }

    /*
       Your database uses:

       category: "element"

       But we also support the old:

       type: "element"
    */

    if (
        compound.category === "element" ||
        compound.type === "element"
    ) {
        return true;
    }

    /*
       Extra safety:
       If the formula itself is one of
       our allowed elemental symbols,
       treat it as an element.
    */

    const formula =
        String(
            compound.formula || ""
        ).trim();

    return CONFIG.STARTING_ELEMENTS.has(
        formula
    );
}


/* =========================
   STARTING INVENTORY
========================= */

function getStartingElements() {

    const elements = [];

    for (const compound of Game.compounds) {

        if (!isElement(compound)) {
            continue;
        }

        const formula =
            String(
                compound.formula || ""
            ).trim();

        if (
            CONFIG.STARTING_ELEMENTS.has(
                formula
            )
        ) {
            elements.push(
                String(compound.id)
            );
        }
    }

    console.log(
        "Starting elements:",
        elements
    );

    return elements;
}


/* =========================
   SAVE
========================= */

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
            Game.reactionHistory
    };

    localStorage.setItem(
        CONFIG.STORAGE_KEY,
        JSON.stringify(save)
    );
}


/* =========================
   LOAD SAVE
========================= */

function loadSave() {

    /*
       IMPORTANT:

       Always start with the elements.
       This prevents an old/empty save from
       making the inventory disappear.
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


    const oldSave =
        localStorage.getItem(
            CONFIG.STORAGE_KEY
        );

    if (!oldSave) {
        return;
    }

    try {

        const save =
            JSON.parse(oldSave);

        /*
           Restore previously discovered
           compounds.
        */

        if (
            Array.isArray(
                save.discoveredCompounds
            )
        ) {

            for (
                const id
                of save.discoveredCompounds
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
                save.discoveredReactions
            )
        ) {

            Game.discoveredReactions =
                new Set(
                    save.discoveredReactions
                );
        }


        Game.currentXP =
            Number(
                save.currentXP
            ) || 0;


        Game.level =
            Number(
                save.level
            ) || 1;


        if (
            Array.isArray(
                save.reactionHistory
            )
        ) {

            Game.reactionHistory =
                save.reactionHistory;
        }

    }

    catch (error) {

        console.warn(
            "Old save could not be read."
        );
    }
}


/* =========================
   INVENTORY
========================= */

function renderCompounds(
    search = ""
) {

    const container =
        document.getElementById(
            "compound-list"
        );

    if (!container) {

        console.error(
            "HTML element #compound-list not found."
        );

        return;
    }


    container.innerHTML = "";


    const query =
        search
            .trim()
            .toLowerCase();


    const visible =
        Game.compounds.filter(
            compound => {

                /*
                   Elements are always visible.
                */

                const element =
                    isElement(compound);


                /*
                   Compounds are visible only
                   after discovery.
                */

                const discovered =
                    Game.discoveredCompounds.has(
                        String(compound.id)
                    );


                if (
                    !element &&
                    !discovered
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


    console.log(
        "Inventory items:",
        visible.length
    );


    if (!visible.length) {

        container.innerHTML = `
            <div>
                Inventory empty.
            </div>
        `;

        return;
    }


    for (
        const compound
        of visible
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.type = "button";

        button.className =
            "compound-button";


        button.dataset.id =
            compound.id;


        button.innerHTML = `
            <strong>
                ${escapeHTML(
                    compound.formula ||
                    compound.name ||
                    compound.id
                )}
            </strong>

            <span>
                ${escapeHTML(
                    compound.name ||
                    compound.id
                )}
            </span>
        `;


        button.onclick = function () {

            addReactant(
                compound.id
            );
        };


        container.appendChild(
            button
        );
    }
}


/* =========================
   ADD REACTANT
========================= */

function addReactant(id) {

    if (
        !Game.discoveredCompounds.has(
            String(id)
        )
    ) {

        return;
    }


    if (
        Game.selectedReactants.length >=
        CONFIG.MAX_REACTANTS
    ) {

        showMessage(
            "Maximum reactants reached."
        );

        return;
    }


    Game.selectedReactants.push(
        String(id)
    );


    renderReactants();
}


/* =========================
   REACTANTS
========================= */

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

                <button type="button">
                    ×
                </button>
            `;


            div.querySelector(
                "button"
            ).onclick = function () {

                Game.selectedReactants.splice(
                    index,
                    1
                );

                renderReactants();
            };


            container.appendChild(
                div
            );
        }
    );
}


/* =========================
   FIND REACTION
========================= */

function getReactionReactants(
    reaction
) {

    return (
        reaction.reactants || []
    )
    .map(item => {

        if (
            typeof item === "string"
        ) {
            return item;
        }

        return (
            item.compound ||
            item.id
        );
    })
    .filter(Boolean);
}


function getReactionProducts(
    reaction
) {

    return (
        reaction.products || []
    )
    .map(item => {

        if (
            typeof item === "string"
        ) {
            return item;
        }

        return (
            item.compound ||
            item.id
        );
    })
    .filter(Boolean);
}


function sameReactants(
    a,
    b
) {

    const A =
        [...a]
        .map(String)
        .sort();

    const B =
        [...b]
        .map(String)
        .sort();


    if (
        A.length !==
        B.length
    ) {

        return false;
    }


    for (
        let i = 0;
        i < A.length;
        i++
    ) {

        if (
            A[i] !== B[i]
        ) {

            return false;
        }
    }


    return true;
}


function findReaction() {

    for (
        const reaction
        of Game.reactions
    ) {

        const reactants =
            getReactionReactants(
                reaction
            );


        if (
            sameReactants(
                Game.selectedReactants,
                reactants
            )
        ) {

            return reaction;
        }
    }


    return null;
}


/* =========================
   PERFORM REACTION
========================= */

function performReaction() {

    if (
        Game.selectedReactants.length === 0
    ) {

        showMessage(
            "Add reactants first."
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
        getReactionProducts(
            reaction
        );


    let newDiscovery =
        false;


    for (
        const product
        of products
    ) {

        if (
            !Game.discoveredCompounds.has(
                String(product)
            )
        ) {

            Game.discoveredCompounds.add(
                String(product)
            );

            newDiscovery = true;
        }
    }


    const reactionID =
        String(
            reaction.id
        );


    Game.discoveredReactions.add(
        reactionID
    );


    Game.currentXP +=
        newDiscovery
            ? 35
            : 10;


    Game.level =
        Math.floor(
            Game.currentXP / 100
        ) + 1;


    Game.reactionHistory.unshift({

        reaction:
            reaction.equation || "",

        reactants:
            [...Game.selectedReactants],

        products:
            [...products],

        time:
            new Date().toISOString()
    });


    saveGame();


    showReactionResult(
        reaction,
        products,
        newDiscovery
    );


    renderCompounds();

    updateStats();
}


/* =========================
   RESULT
========================= */

function showReactionResult(
    reaction,
    products,
    newDiscovery
) {

    const container =
        document.getElementById(
            "reaction-result"
        );


    if (!container) {
        return;
    }


    const productHTML =
        products
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
        .join("");


    container.innerHTML = `

        ${
            newDiscovery
                ? `
                    <div>
                        <strong>
                            NEW COMPOUND DISCOVERED!
                        </strong>
                    </div>
                  `
                : ""
        }

        <div>
            ${
                escapeHTML(
                    reaction.equation ||
                    "Reaction complete"
                )
            }
        </div>

        <div>
            ${productHTML}
        </div>

    `;
}


/* =========================
   RESET
========================= */

function resetGame() {

    if (
        !confirm(
            "Reset ChemCraft?"
        )
    ) {

        return;
    }


    localStorage.removeItem(
        CONFIG.STORAGE_KEY
    );


    Game.selectedReactants = [];


    /*
       CRITICAL:
       Reset to the 32 elements,
       NOT an empty Set.
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


    saveGame();


    refreshUI();


    showMessage(
        "Reset complete. Elements restored."
    );
}


/* =========================
   SEARCH
========================= */

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
        function () {

            renderCompounds(
                input.value
            );
        }
    );
}


/* =========================
   STATS
========================= */

function updateStats() {

    const compoundCount =
        document.getElementById(
            "compound-count"
        );


    if (compoundCount) {

        compoundCount.textContent =
            Game.discoveredCompounds.size;
    }


    const reactionCount =
        document.getElementById(
            "reaction-count"
        );


    if (reactionCount) {

        reactionCount.textContent =
            Game.discoveredReactions.size;
    }


    const level =
        document.getElementById(
            "level"
        );


    if (level) {

        level.textContent =
            Game.level;
    }


    const xp =
        document.getElementById(
            "xp"
        );


    if (xp) {

        xp.textContent =
            Game.currentXP;
    }
}


/* =========================
   MESSAGE
========================= */

function showMessage(
    message
) {

    console.log(
        message
    );


    const element =
        document.getElementById(
            "message"
        );


    if (element) {

        element.textContent =
            message;
    }
}


/* =========================
   REFRESH
========================= */

function refreshUI() {

    renderCompounds();

    renderReactants();

    updateStats();
}


/* =========================
   BUTTONS
========================= */

function setupButtons() {

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
}


/* =========================
   ESCAPE HTML
========================= */

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


/* =========================
   START GAME
========================= */

async function initGame() {

    try {

        await loadDatabase();

        buildIndexes();

        loadSave();

        setupButtons();

        setupSearch();

        Game.initialized =
            true;


        console.log(
            "================================"
        );

        console.log(
            "CHEMCRAFT READY"
        );

        console.log(
            "Compounds:",
            Game.compounds.length
        );

        console.log(
            "Reactions:",
            Game.reactions.length
        );

        console.log(
            "Starting inventory:",
            Game.discoveredCompounds.size
        );

        console.log(
            "================================"
        );


        refreshUI();

    }

    catch (error) {

        console.error(
            "CHEMCRAFT ERROR:",
            error
        );


        showMessage(
            "Database could not be loaded. " +
            "Keep compounds.json and reactions.json " +
            "beside index.html."
        );
    }
}


document.addEventListener(
    "DOMContentLoaded",
    initGame
);


/* =========================
   GLOBAL ACCESS
========================= */

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
