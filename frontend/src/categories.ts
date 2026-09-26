/**
 * Food categories: emoji icon + identity colors (same in light/dark, like brand colors).
 * Used for shopping list rows/aisles, pantry rows and recipe ingredients.
 */
export type Category = { key: string; label: string; emoji: string; color: string; bg: string };

export const CATEGORIES: Record<string, Category> = {
  verdura: { key: "verdura", label: "Ortaggi", emoji: "🥦", color: "#4F8A4C", bg: "#E3F1DF" },
  frutta: { key: "frutta", label: "Frutta", emoji: "🍎", color: "#D9534F", bg: "#FBE3E1" },
  carne: { key: "carne", label: "Carne", emoji: "🥩", color: "#B23A48", bg: "#F8DEE2" },
  salumi: { key: "salumi", label: "Salumi", emoji: "🥓", color: "#C75146", bg: "#FAE1DC" },
  pesce: { key: "pesce", label: "Pesce", emoji: "🐟", color: "#2E86AB", bg: "#DDEEF6" },
  formaggi: { key: "formaggi", label: "Formaggi", emoji: "🧀", color: "#E0A100", bg: "#FCF1CC" },
  latticini: { key: "latticini", label: "Latticini & uova", emoji: "🥛", color: "#6C8EBF", bg: "#E4EBF6" },
  pane: { key: "pane", label: "Pane & forno", emoji: "🍞", color: "#B07D3B", bg: "#F6E9D7" },
  pasta: { key: "pasta", label: "Pasta, riso & cereali", emoji: "🍝", color: "#D98324", bg: "#FBE8D2" },
  dolci: { key: "dolci", label: "Dolci & snack", emoji: "🍪", color: "#9C6B98", bg: "#F0E4EF" },
  bevande: { key: "bevande", label: "Bevande", emoji: "🧃", color: "#1F8A70", bg: "#D9F0EA" },
  surgelati: { key: "surgelati", label: "Surgelati", emoji: "🧊", color: "#3F8EDB", bg: "#DFECFA" },
  condimenti: { key: "condimenti", label: "Condimenti & spezie", emoji: "🧂", color: "#8A6D3B", bg: "#F1E9DA" },
  conserve: { key: "conserve", label: "Legumi & conserve", emoji: "🥫", color: "#C0392B", bg: "#F9DDD9" },
  casa: { key: "casa", label: "Casa & igiene", emoji: "🧼", color: "#5C6BC0", bg: "#E3E5F5" },
  altro: { key: "altro", label: "Altro", emoji: "🛒", color: "#7E8480", bg: "#EEEDE8" },
};

const KEYWORDS: [string, string[]][] = [
  ["salumi", ["prosciutto", "speck", "pancetta", "salame", "salsiccia", "mortadella", "bresaola", "wurstel", "guanciale", "coppa", "salumi", "affettat"]],
  ["formaggi", ["formaggio", "parmigian", "grana", "mozzarell", "ricotta", "pecorino", "gorgonzola", "stracchino", "scamorza", "feta", "brie", "mascarpone", "provol", "burrata", "caciocav", "emmental", "fontina", "taleggio"]],
  ["latticini", ["latte", "burro", "yogurt", "panna", "uova", "uovo", "kefir", "latticin"]],
  ["pesce", ["salmone", "tonno", "merluzzo", "gamber", "cozze", "vongole", "pesce", "orata", "branzino", "calamar", "seppie", "polpo", "acciugh", "alici", "sgombro", "baccal"]],
  ["carne", ["pollo", "manzo", "maiale", "tacchino", "carne", "bistecca", "macinat", "agnello", "vitello", "coniglio", "hamburger", "arrosto", "costine", "fettine", "petto", "cosce"]],
  ["surgelati", ["surgelat", "gelato", "congelat", "bastoncin", "pisell surg"]],
  ["frutta", ["mela", "mele", "banan", "limon", "arancia", "arance", "fragol", "pera", "pere", "pesca", "pesche", "uva", "kiwi", "anguria", "melone", "ananas", "ciliegi", "albicocc", "prugn", "mandarin", "pompelmo", "frutti di bosco", "mirtill", "lampon", "fico", "fichi", "avocado", "frutta", "mango", "cocco", "melagran", "cachi"]],
  ["verdura", ["pomodor", "cipoll", "aglio", "insalat", "zucchin", "melanzan", "peperon", "carot", "patat", "spinac", "basilic", "prezzemol", "funghi", "sedano", "broccol", "cavol", "zucca", "lattuga", "rucola", "finocchi", "porro", "verdur", "erbe", "rosmarin", "salvia", "menta", "peperoncin", "asparag", "carciof", "fagiolin", "bietol", "radicchio", "cetriol", "ravanell", "scalogno", "verza", "cime di rapa", "ortagg", "timo", "origano fresco", "erba cipoll"]],
  ["pasta", ["pasta", "riso", "spaghett", "penne", "fusilli", "rigaton", "linguine", "tagliatell", "lasagn", "gnocch", "tortellin", "ravioli", "orzo", "farro", "couscous", "quinoa", "cereali", "avena", "polenta", "farina", "semola", "bulgur", "mais", "fiocchi"]],
  ["pane", ["pane", "pancarr", "piadin", "crackers", "fette biscottate", "grissin", "focaccia", "panin", "tortilla", "pizza", "brioche", "cornett", "toast", "baguette", "lievito"]],
  ["dolci", ["biscott", "cioccolat", "torta", "merendin", "caramell", "zucchero", "miele", "marmellata", "nutella", "crema spalmabile", "gelatin", "wafer", "snack", "patatine", "cracker", "dolce", "dolci", "budino", "cacao", "savoiardi", "amarett"]],
  ["bevande", ["acqua", "vino", "birra", "succo", "caffè", "caffe", "tè", "the ", "tisana", "bibita", "cola", "aranciata", "spremuta", "latte di", "bevanda", "prosecco", "spumante", "aperitivo", "energy"]],
  ["conserve", ["fagiol", "lenticchi", "ceci", "passata", "pelati", "polpa", "conserva", "legumi", "tonno in scatola", "mais in scatola", "olive", "capperi", "sottoli", "sottaceti", "sugo pronto", "pesto", "brodo", "dado", "zuppa pronta", "scatol"]],
  ["condimenti", ["olio", "sale", "pepe", "aceto", "spezie", "curry", "paprika", "origano", "senape", "maionese", "ketchup", "soia", "salsa", "noce moscata", "cannella", "curcuma", "zafferano", "cumino", "alloro", "condiment", "vaniglia", "bicarbonato", "aromi", "peperoncino secco", "sesamo", "semi di", "tahina", "wasabi"]],
  ["casa", ["detersivo", "sapone", "carta igienica", "scottex", "spugna", "sacchetti", "pellicola", "alluminio", "shampoo", "dentifricio", "candeggina", "ammorbidente", "tovaglioli", "piatti di carta", "lavastoviglie", "detergente", "igiene"]],
];

const AISLE_TO_CAT: Record<string, string> = {
  "Frutta e verdura": "verdura", "Carne e pesce": "carne", "Latticini": "latticini", "Pane e cereali": "pane",
  "Surgelati": "surgelati", "Bevande": "bevande", "Dispensa": "condimenti", "Altro": "altro",
};

export function categorize(name?: string | null, aisle?: string | null): Category {
  const n = (name || "").toLowerCase();
  if (n) {
    for (const [key, kws] of KEYWORDS) {
      if (kws.some((k) => n.includes(k))) return CATEGORIES[key];
    }
  }
  if (aisle && AISLE_TO_CAT[aisle]) return CATEGORIES[AISLE_TO_CAT[aisle]];
  return CATEGORIES.altro;
}

/** Aisle (backend grouping) → representative category for headers. */
export function aisleCategory(aisle: string): Category {
  return CATEGORIES[AISLE_TO_CAT[aisle] || "altro"];
}
