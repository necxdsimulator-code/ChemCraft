/* =========================================================
   CHEMCRAFT - PROGRESSIVE 5-LEVEL ENGINE
   ---------------------------------------------------------
   - Shows 8 starter elements immediately.
   - Loads only level 1 data initially.
   - Elements unlock by level.
   - Compounds unlock only when discovered by reactions.
   - Inventory buttons show FORMULA ONLY.
   - Higher-level datasets load when that level is reached.
   ========================================================= */

"use strict";

/* ----------------------------- CONFIG ----------------------------- */

const MAX_REACTANTS = 5;
const SAVE_KEY = "chemcraft_progressive_v2";

const XP_LEVELS = {
    1: 0,
    2: 500,
    3: 900,
    4: 1200,
    5: 2000
};

/*
 * Playable elemental substances.
 *
 * Important:
 * H, N, O and Cl are represented by their elemental molecular
 * forms H2, N2, O2 and Cl2.
 */
const LEVEL_STARTERS = {
    1: ["h2", "c", "n2", "o2", "na", "cl2", "k", "ca"],
    2: ["li", "f2", "mg", "al", "p4", "s8"],
    3: ["si", "ti", "fe", "cu", "zn", "br2"],
    4: ["be", "b", "co", "ni", "ga", "i2"],
    5: ["sn", "cs", "ba", "ag", "hg", "pb"]
};


/*
 * These are used immediately while the JSON files are
 * still loading.
 */
const STARTER_META = {

    h2: {
        id: "h2",
        name: "Hydrogen",
        formula: "H₂",
        category: "elemental_form"
    },

    c: {
        id: "c",
        name: "Carbon",
        formula: "C",
        category: "element"
    },

    n2: {
        id: "n2",
        name: "Nitrogen",
        formula: "N₂",
        category: "elemental_form"
    },

    o2: {
        id: "o2",
        name: "Oxygen",
        formula: "O₂",
        category: "elemental_form"
    },

    na: {
        id: "na",
        name: "Sodium",
        formula: "Na",
        category: "element"
    },

    cl2: {
        id: "cl2",
        name: "Chlorine",
        formula: "Cl₂",
        category: "elemental_form"
    },

    k: {
        id: "k",
        name: "Potassium",
        formula: "K",
        category: "element"
    },

    ca: {
        id: "ca",
        name: "Calcium",
        formula: "Ca",
        category: "element"
    },


    li: {
        id: "li",
        name: "Lithium",
        formula: "Li",
        category: "element"
    },

    f2: {
        id: "f2",
        name: "Fluorine",
        formula: "F₂",
        category: "elemental_form"
    },

    mg: {
        id: "mg",
        name: "Magnesium",
        formula: "Mg",
        category: "element"
    },

    al: {
        id: "al",
        name: "Aluminium",
        formula: "Al",
        category: "element"
    },

    p4: {
        id: "p4",
        name: "Phosphorus",
        formula: "P₄",
        category: "elemental_form"
    },

    s8: {
        id: "s8",
        name: "Sulfur",
        formula: "S₈",
        category: "elemental_form"
    },


    si: {
        id: "si",
        name: "Silicon",
        formula: "Si",
        category: "element"
    },

    ti: {
        id: "ti",
        name: "Titanium",
        formula: "Ti",
        category: "element"
    },

    fe: {
        id: "fe",
        name: "Iron",
        formula: "Fe",
        category: "element"
    },

    cu: {
        id: "cu",
        name: "Copper",
        formula: "Cu",
        category: "element"
    },

    zn: {
        id: "zn",
        name: "Zinc",
        formula: "Zn",
        category: "element"
    },

    br2: {
        id: "br2",
        name: "Bromine",
        formula: "Br₂",
        category: "elemental_form"
    },


    be: {
        id: "be",
        name: "Beryllium",
        formula: "Be",
        category: "element"
    },

    b: {
        id: "b",
        name: "Boron",
        formula: "B",
        category: "element"
    },

    co: {
        id: "co",
        name: "Cobalt",
        formula: "Co",
        category: "element"
    },

    ni: {
        id: "ni",
        name: "Nickel",
        formula: "Ni",
        category: "element"
    },

    ga: {
        id: "ga",
        name: "Gallium",
        formula: "Ga",
        category: "element"
    },

    i2: {
        id: "i2",
        name: "Iodine",
        formula: "I₂",
        category: "elemental_form"
    },


    sn: {
        id: "sn",
        name: "Tin",
        formula: "Sn",
        category: "element"
    },

    cs: {
        id: "cs",
        name: "Cesium",
        formula: "Cs",
        category: "element"
    },

    ba: {
        id: "ba",
        name: "Barium",
        formula: "Ba",
        category: "element"
    },

    ag: {
        id: "ag",
        name: "Silver",
        formula: "Ag",
        category: "element"
    },

    hg: {
        id: "hg",
        name: "Mercury",
        formula: "Hg",
        category: "element"
    },

    pb: {
        id: "pb",
        name: "Lead",
        formula: "Pb",
        category: "element"
    }
};


/* ----------------------------- STATE ------------------------------ */

const Game = {

    level: 1,

    xp: 0,

    compounds: [],

    compoundMap: new Map(),

    reactions: [],

    reactionMap: new Map(),

    selectedReactants: [],

    discoveredCompounds: new Set(),

    discoveredReactions: new Set(),

    reactionHistory: [],

    loadedLevels: new Set(),

    loadingLevels: new Map()
};


/* -------------------------- SMALL HELPERS ------------------------- */

function esc(value) {

    return String(value ?? "")

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");
}


function getCompound(id) {

    return Game.compoundMap.get(
        String(id)
    );
}


function formula(id) {

    const compound =
        getCompound(id);


    if (compound) {

        return (
            compound.formula ||
            compound.symbol ||
            compound.name ||
            String(id)
        );
    }


    const fallback =
        STARTER_META[String(id)];


    return fallback
        ? fallback.formula
        : String(id);
}


function name(id) {

    const compound =
        getCompound(id);


    if (compound) {

        return (
            compound.name ||
            compound.formula ||
            String(id)
        );
    }


    const fallback =
        STARTER_META[String(id)];


    return fallback
        ? fallback.name
        : String(id);
}


function showMessage(text) {

    const box =
        document.getElementById(
            "message"
        );


    if (box) {

        box.textContent =
            text;
    }


    console.log(text);
}


function setStat(
    id,
    value
) {

    const node =
        document.getElementById(id);


    if (node) {

        node.textContent =
            value;
    }
}


/* ------------------------ LEVEL / XP HELPERS ---------------------- */

function levelForXP(xp) {

    if (
        xp >= XP_LEVELS[5]
    ) {
        return 5;
    }


    if (
        xp >= XP_LEVELS[4]
    ) {
        return 4;
    }


    if (
        xp >= XP_LEVELS[3]
    ) {
        return 3;
    }


    if (
        xp >= XP_LEVELS[2]
    ) {
        return 2;
    }


    return 1;
}


function starterIDsUpToLevel(
    level
) {

    const ids = [];


    for (
        let l = 1;
        l <= level;
        l++
    ) {

        for (
            const id
            of (
                LEVEL_STARTERS[l] ||
                []
            )
        ) {

            if (
                !ids.includes(id)
            ) {

                ids.push(id);
            }
        }
    }


    return ids;
}


/* ----------------------- DATABASE LOADING ------------------------- */

async function loadJSON(file) {

    const response =
        await fetch(
            file,
            {
                cache: "no-store"
            }
        );


    if (!response.ok) {

        throw new Error(
            `Could not load ${file}: HTTP ${response.status}`
        );
    }


    const data =
        await response.json();


    if (!Array.isArray(data)) {

        throw new Error(
            `${file} is not a JSON array.`
        );
    }


    return data;
}


/*
 * Seed starter compounds immediately.
 */
function seedStarterCompounds(
    level
) {

    for (
        const id
        of starterIDsUpToLevel(level)
    ) {

        if (
            !Game.compoundMap.has(id) &&
            STARTER_META[id]
        ) {

            const copy =
                {
                    ...STARTER_META[id]
                };


            Game.compounds.push(
                copy
            );


            Game.compoundMap.set(
                id,
                copy
            );
        }
    }
}


/*
 * Load one level only.
 */
async function loadLevel(
    level
) {

    level =
        Number(level);


    if (
        level < 1 ||
        level > 5
    ) {

        return;
    }


    if (
        Game.loadedLevels.has(level)
    ) {

        return;
    }


    if (
        Game.loadingLevels.has(level)
    ) {

        return Game.loadingLevels.get(
            level
        );
    }


    /*
     * Seed buttons before database
     * finishes downloading.
     */

    seedStarterCompounds(level);

    renderInventory();

    updateStats();


    const promise =
        (async () => {

            const [
                compoundData,
                reactionData
            ] =
                await Promise.all([

                    loadJSON(
                        `level${level}_compounds.json`
                    ),

                    loadJSON(
                        `level${level}_reactions.json`
                    )

                ]);


            /*
             * Add/replace compounds.
             */

            for (
                const compound
                of compoundData
            ) {

                if (
                    !compound ||
                    !compound.id
                ) {

                    continue;
                }


                const id =
                    String(
                        compound.id
                    );


                Game.compoundMap.set(
                    id,
                    compound
                );


                const index =
                    Game.compounds.findIndex(
                        c =>
                            String(c.id)
                            === id
                    );


                if (
                    index === -1
                ) {

                    Game.compounds.push(
                        compound
                    );

                } else {

                    Game.compounds[index] =
                        compound;
                }
            }


            /*
             * Add reactions.
             */

            for (
                const reaction
                of reactionData
            ) {

                if (
                    !reaction ||
                    !reaction.id
                ) {

                    continue;
                }


                const id =
                    String(
                        reaction.id
                    );


                if (
                    !Game.reactionMap.has(
                        id
                    )
                ) {

                    Game.reactions.push(
                        reaction
                    );


                    Game.reactionMap.set(
                        id,
                        reaction
                    );
                }
            }


            Game.loadedLevels.add(
                level
            );


            console.log(
                `Level ${level} loaded: ` +
                `${compoundData.length} compounds, ` +
                `${reactionData.length} reactions`
            );


            renderInventory();

            updateStats();

        })();


    Game.loadingLevels.set(
        level,
        promise
    );


    try {

        await promise;

    } finally {

        Game.loadingLevels.delete(
            level
        );
    }
}


/* ---------------------- DISCOVERY / INVENTORY --------------------- */

function isStarterElement(
    id
) {

    return starterIDsUpToLevel(
        Game.level
    ).includes(
        String(id)
    );
}


function isAvailable(
    id
) {

    const sid =
        String(id);


    return (
        isStarterElement(sid) ||
        Game.discoveredCompounds.has(sid)
    );
}


/*
 * Add new level's actual element substances
 * to discovered inventory.
 *
 * Compounds are NOT added here.
 */
function addStarterElementsForLevel(
    level
) {

    for (
        const id
        of (
            LEVEL_STARTERS[level] ||
            []
        )
    ) {

        Game.discoveredCompounds.add(
            id
        );
    }
}


/* -------------------------- INVENTORY ----------------------------- */

function renderInventory(
    search = ""
) {

    const box =
        document.getElementById(
            "compound-list"
        );


    if (!box) {

        return;
    }


    box.innerHTML =
        "";


    const q =
        String(search)
            .trim()
            .toLowerCase();


    const unique =
        new Map();


    /*
     * Show available elements and
     * discovered compounds.
     */

    for (
        const c
        of Game.compounds
    ) {

        const id =
            String(c.id);


        if (
            !isAvailable(id)
        ) {

            continue;
        }


        if (q) {

            const haystack =
                `${c.formula || ""} ${c.name || ""}`
                    .toLowerCase();


            if (
                !haystack.includes(q)
            ) {

                continue;
            }
        }


        /*
         * Do not show atomic duplicates
         * when molecular elemental form exists.
         */

        if (
            id === "h" &&
            unique.has("h2")
        ) {

            continue;
        }


        if (
            id === "n" &&
            unique.has("n2")
        ) {

            continue;
        }


        if (
            id === "o" &&
            unique.has("o2")
        ) {

            continue;
        }


        if (
            id === "cl" &&
            unique.has("cl2")
        ) {

            continue;
        }


        unique.set(
            id,
            c
        );
    }


    /*
     * Ensure starter elements are shown
     * even while JSON is loading.
     */

    for (
        const id
        of starterIDsUpToLevel(
            Game.level
        )
    ) {

        if (
            !unique.has(id) &&
            STARTER_META[id]
        ) {

            unique.set(
                id,
                STARTER_META[id]
            );
        }
    }


    const items =
        [...unique.values()];


    if (
        !items.length
    ) {

        box.innerHTML =
            "<p>No chemicals available yet.</p>";

        return;
    }


    for (
        const compound
        of items
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.className =
            "compound-button";


        /*
         * FORMULA ONLY.
         *
         * H₂
         * O₂
         * Na
         * Ca
         * Na₂O
         */

        button.textContent =
            compound.formula ||
            compound.symbol ||
            compound.name ||
            compound.id;


        button.onclick =
            () =>
                addReactant(
                    compound.id
                );


        box.appendChild(
            button
        );
    }
}


/* ----------------------- REACTANT AREA ---------------------------- */

function renderReactants() {

    const box =
        document.getElementById(
            "reactants"
        );


    if (!box) {

        return;
    }


    box.innerHTML =
        "";


    if (
        Game.selectedReactants.length
        === 0
    ) {

        box.innerHTML =
            "<p>No reactants selected.</p>";

        return;
    }


    Game.selectedReactants.forEach(
        (
            id,
            index
        ) => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "reactant-item";


            const label =
                document.createElement(
                    "span"
                );


            label.textContent =
                formula(id);


            const remove =
                document.createElement(
                    "button"
                );


            remove.type =
                "button";


            remove.textContent =
                "×";


            remove.onclick =
                () => {

                    Game.selectedReactants.splice(
                        index,
                        1
                    );


                    renderReactants();
                };


            item.appendChild(
                label
            );


            item.appendChild(
                remove
            );


            box.appendChild(
                item
            );
        }
    );
}


function addReactant(
    id
) {

    const sid =
        String(id);


    if (
        Game.selectedReactants.length
        >= MAX_REACTANTS
    ) {

        showMessage(
            `Maximum ${MAX_REACTANTS} reactants.`
        );

        return;
    }


    if (
        !isAvailable(sid)
    ) {

        showMessage(
            "You have not discovered this compound yet."
        );

        return;
    }


    Game.selectedReactants.push(
        sid
    );


    renderReactants();
}


/* -------------------------- REACTION MATCH ------------------------ */

function reactionSideIDs(
    items
) {

    if (
        !Array.isArray(items)
    ) {

        return [];
    }


    return items

        .flatMap(
            item => {

                if (
                    typeof item ===
                    "string"
                ) {

                    return [
                        String(item)
                    ];
                }


                if (
                    item &&
                    item.compound
                ) {

                    const coefficient =
                        Math.max(
                            1,
                            Number(
                                item.coefficient
                            ) || 1
                        );


                    return Array(
                        coefficient
                    )
                    .fill(
                        String(
                            item.compound
                        )
                    );
                }


                return [];
            }
        )

        .filter(Boolean);
}


function normalizedUnique(
    items
) {

    return [
        ...new Set(
            items.map(String)
        )
    ].sort();
}


/*
 * Match the selected substances against
 * reaction reactants.
 *
 * Coefficients are ignored for selection,
 * because the player chooses substances,
 * not stoichiometric quantities.
 */
function findReaction() {

    if (
        Game.selectedReactants.length
        === 0
    ) {

        return null;
    }


    const selected =
        normalizedUnique(
            Game.selectedReactants
        );


    const candidates =
        Game.reactions.filter(
            reaction => {

                const required =
                    normalizedUnique(
                        reactionSideIDs(
                            reaction.reactants
                        )
                    );


                return (
                    required.length ===
                    selected.length &&

                    required.every(
                        (
                            id,
                            index
                        ) =>
                            id ===
                            selected[index]
                    )
                );
            }
        );


    return (
        candidates[0] ||
        null
    );
}


/* ---------------------------- REACT ------------------------------- */

async function performReaction() {

    if (
        Game.selectedReactants.length
        === 0
    ) {

        showMessage(
            "Select at least one reactant."
        );

        return;
    }


    /*
     * Don't say "No reaction" while
     * the database is still loading.
     */

    if (
        !Game.loadedLevels.has(
            Game.level
        )
    ) {

        showMessage(
            "Reactions are still loading..."
        );

        return;
    }


    const reaction =
        findReaction();


    if (!reaction) {

        showNoReaction();


        showMessage(
            "No reaction found for these reactants."
        );


        return;
    }


    /*
     * Extract actual products.
     */

    const products =
        reactionSideIDs(
            reaction.products
        );


    let newCompound =
        false;


    /*
     * Every product is a newly discovered
     * compound unless already discovered.
     */

    for (
        const id
        of products
    ) {

        if (
            !Game.discoveredCompounds.has(
                id
            )
        ) {

            Game.discoveredCompounds.add(
                id
            );


            newCompound =
                true;
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
     * XP
     */

    Game.xp +=
        newCompound
            ? 35
            : 10;


    /*
     * Determine whether level
     * has changed.
     */

    const oldLevel =
        Game.level;


    const newLevel =
        levelForXP(
            Game.xp
        );


    /*
     * History
     */

    Game.reactionHistory.unshift({

        reactionID,

        equation:
            reaction.equation ||
            "",

        reactants:
            [
                ...Game.selectedReactants
            ],

        products:
            [
                ...products
            ],

        timestamp:
            new Date().toISOString()
    });


    if (
        Game.reactionHistory.length
        > 100
    ) {

        Game.reactionHistory.length =
            100;
    }


    saveGame();


    /*
     * Show reaction result.
     */

    showReactionResult(

        reaction,

        products,

        newCompound,

        firstReaction

    );


    renderInventory();

    renderReactants();

    updateStats();


    /*
     * Level up.
     */

    if (
        newLevel > oldLevel
    ) {

        Game.level =
            newLevel;


        /*
         * Unlock ONLY the new
         * elemental substances.
         */

        addStarterElementsForLevel(
            newLevel
        );


        /*
         * Show popup immediately.
         */

        showLevelUnlock(
            newLevel
        );


        renderInventory();

        updateStats();


        /*
         * Load new level's database
         * without blocking the popup/UI.
         */

        loadLevel(
            newLevel
        )
        .catch(
            error => {

                console.error(
                    `Level ${newLevel} load failed:`,
                    error
                );


                showMessage(
                    `Level ${newLevel} elements unlocked, ` +
                    `but the database failed to load.`
                );
            }
        );


        saveGame();
    }
}


/* ------------------------- REACTION RESULT ------------------------ */

function showReactionResult(
    reaction,
    products,
    newCompound,
    firstReaction
) {

    const box =
        document.getElementById(
            "reaction-result"
        );


    if (!box) {

        return;
    }


    const productHTML =
        (
            products ||
            []
        )

        .map(
            id => {

                return `
                    <div class="product-result">
                        <strong>
                            ${esc(
                                formula(id)
                            )}
                        </strong>
                    </div>
                `;
            }
        )

        .join("");


    box.innerHTML = `

        ${
            newCompound
                ? "<h3>🎉 NEW COMPOUND DISCOVERED!</h3>"
                : ""
        }

        ${
            firstReaction
                ? "<p>New reaction discovered!</p>"
                : ""
        }

        <p>
            <strong>
                ${esc(
                    reaction.equation ||
                    "Reaction complete"
                )}
            </strong>
        </p>

        <h4>
            Products
        </h4>

        ${
            productHTML ||
            "<p>No products recorded.</p>"
        }

        ${
            reaction.conditions
                ? `
                    <p>
                        <strong>
                            Conditions:
                        </strong>

                        ${esc(
                            reaction.conditions
                        )}
                    </p>
                `
                : ""
        }

    `;
}


/* --------------------------- NO REACTION -------------------------- */

function showNoReaction() {

    const box =
        document.getElementById(
            "reaction-result"
        );


    if (!box) {

        return;
    }


    box.innerHTML = `

        <h3>
            No Reaction
        </h3>

        <p>
            These chemicals do not have a reaction
            registered in the loaded database.
        </p>

    `;
}


/* ----------------------- LEVEL UNLOCK POPUP ----------------------- */

function showLevelUnlock(
    level
) {

    const old =
        document.getElementById(
            "level-unlock-popup"
        );


    if (old) {

        old.remove();
    }


    const ids =
        LEVEL_STARTERS[level] ||
        [];


    const labels =
        ids

            .map(
                id =>
                    formula(id)
            )

            .join(
                " . "
            );


    const popup =
        document.createElement(
            "div"
        );


    popup.id =
        "level-unlock-popup";


    popup.innerHTML = `

        <div style="
            position:fixed;
            inset:0;
            z-index:9999;
            background:rgba(0,0,0,.68);
            display:flex;
            align-items:center;
            justify-content:center;
            padding:20px;
            font-family:inherit;
        ">

            <div style="
                width:min(520px, 100%);
                padding:30px;
                background:#fff;
                color:#111;
                border-radius:18px;
                text-align:center;
                box-shadow:0 15px 60px rgba(0,0,0,.4);
            ">

                <h2 style="margin-top:0">

                    🎉 You reached Level ${level}!

                </h2>

                <p style="font-size:18px">

                    ${
                        level === 1
                            ? "Your starting elements:"
                            : "New elements unlocked:"
                    }

                </p>

                <p style="
                    font-size:28px;
                    font-weight:700;
                    line-height:1.7;
                ">

                    ${esc(labels)}

                </p>

                <button
                    id="level-unlock-close"
                    type="button"
                    style="
                        padding:10px 24px;
                        font-size:16px;
                        cursor:pointer;
                    "
                >

                    Continue

                </button>

            </div>

        </div>
    `;


    document.body.appendChild(
        popup
    );


    const close =
        document.getElementById(
            "level-unlock-close"
        );


    if (close) {

        close.onclick =
            () =>
                popup.remove();
    }
}


/* --------------------------- STATS -------------------------------- */

function updateStats() {

    setStat(
        "level",
        Game.level
    );


    setStat(
        "xp",
        Game.xp
    );


    setStat(
        "compound-count",
        `${Game.discoveredCompounds.size}/${Game.compounds.length}`
    );


    setStat(
        "reaction-count",
        `${Game.discoveredReactions.size}/${Game.reactions.length}`
    );
}


/* -------------------------- HISTORY -------------------------------- */

function renderHistory() {

    const box =
        document.getElementById(
            "reaction-history"
        );


    if (!box) {

        return;
    }


    if (
        !Game.reactionHistory.length
    ) {

        box.innerHTML =
            "<p>No reactions discovered yet.</p>";

        return;
    }


    box.innerHTML =
        "";


    for (
        const entry
        of Game.reactionHistory
    ) {

        const row =
            document.createElement(
                "div"
            );


        row.className =
            "history-item";


        row.textContent =
            entry.equation ||
            "Reaction";


        box.appendChild(
            row
        );
    }
}


/* --------------------------- SAVE --------------------------------- */

function saveGame() {

    localStorage.setItem(

        SAVE_KEY,

        JSON.stringify({

            level:
                Game.level,

            xp:
                Game.xp,

            discoveredCompounds:
                [
                    ...Game.discoveredCompounds
                ],

            discoveredReactions:
                [
                    ...Game.discoveredReactions
                ],

            reactionHistory:
                Game.reactionHistory.slice(
                    0,
                    100
                )

        })
    );
}


function loadSave() {

    Game.level =
        1;


    Game.xp =
        0;


    Game.discoveredCompounds =
        new Set();


    Game.discoveredReactions =
        new Set();


    Game.reactionHistory =
        [];


    try {

        const raw =
            localStorage.getItem(
                SAVE_KEY
            );


        if (!raw) {

            return;
        }


        const save =
            JSON.parse(raw);


        Game.level =
            Math.max(
                1,
                Math.min(
                    5,
                    Number(
                        save.level
                    ) || 1
                )
            );


        Game.xp =
            Math.max(
                0,
                Number(
                    save.xp
                ) || 0
            );


        Game.discoveredCompounds =
            new Set(

                Array.isArray(
                    save.discoveredCompounds
                )

                    ? save.discoveredCompounds
                        .map(String)

                    : []

            );


        Game.discoveredReactions =
            new Set(

                Array.isArray(
                    save.discoveredReactions
                )

                    ? save.discoveredReactions
                        .map(String)

                    : []

            );


        Game.reactionHistory =

            Array.isArray(
                save.reactionHistory
            )

                ? save.reactionHistory

                : [];


    } catch (error) {

        console.warn(
            "Save was invalid; starting a new game.",
            error
        );
    }
}


/* --------------------------- RESET -------------------------------- */

function resetGame() {

    if (
        !confirm(
            "Reset all ChemCraft progress?"
        )
    ) {

        return;
    }


    localStorage.removeItem(
        SAVE_KEY
    );


    location.reload();
}


/* -------------------------- UI SETUP ------------------------------ */

function setupUI() {

    const search =
        document.getElementById(
            "compound-search"
        );


    if (search) {

        search.oninput =
            () =>
                renderInventory(
                    search.value
                );
    }


    const react =
        document.getElementById(
            "react-button"
        );


    if (react) {

        react.onclick =
            performReaction;
    }


    const clear =
        document.getElementById(
            "clear-button"
        );


    if (clear) {

        clear.onclick =
            () => {

                Game.selectedReactants =
                    [];


                renderReactants();
            };
    }


    const reset =
        document.getElementById(
            "reset-button"
        );


    if (reset) {

        reset.onclick =
            resetGame;
    }
}


/* ----------------------------- INIT ------------------------------- */

async function init() {

    try {

        /*
         * Load saved progress FIRST.
         */

        loadSave();


        /*
         * Seed currently unlocked
         * elemental substances immediately.
         */

        seedStarterCompounds(
            Game.level
        );


        addStarterElementsForLevel(
            Game.level
        );


        setupUI();


        /*
         * Render BEFORE JSON loading.
         */

        renderInventory();

        renderReactants();

        updateStats();

        renderHistory();


        /*
         * New player gets the Level 1 popup.
         */

        if (
            Game.level === 1
        ) {

            showLevelUnlock(1);
        }


        /*
         * Load already unlocked level
         * datasets.
         */

        const levelPromises = [];


        for (
            let level = 1;
            level <= Game.level;
            level++
        ) {

            levelPromises.push(
                loadLevel(level)
            );
        }


        await Promise.all(
            levelPromises
        );


        renderInventory();

        updateStats();

        renderHistory();


        console.log(
            "ChemCraft ready."
        );


    } catch (error) {

        console.error(
            "ChemCraft initialization failed:",
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
            "ChemCraft could not load its database."
        );
    }
}


/* ------------------------- START --------------------------------- */

document.addEventListener(
    "DOMContentLoaded",
    init
);


/* ------------------------- GLOBAL API ----------------------------- */

window.ChemCraft = {

    Game,

    loadLevel,

    addReactant,

    performReaction,

    resetGame,

    saveGame,

    renderInventory,

    renderReactants

};
