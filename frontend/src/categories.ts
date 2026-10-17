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
  detersivi: { key: "detersivi", label: "Pulizia casa", emoji: "🧴", color: "#3F7FBF", bg: "#DEEBF8" },
  igiene: { key: "igiene", label: "Igiene & bagno", emoji: "🪥", color: "#2BA3A3", bg: "#D9F1F1" },
  usaegetta: { key: "usaegetta", label: "Usa e getta", emoji: "🧻", color: "#8D7B68", bg: "#EFE8E0" },
  casa: { key: "casa", label: "Casa & cucina", emoji: "🧽", color: "#5C6BC0", bg: "#E3E5F5" },
  altro: { key: "altro", label: "Altro", emoji: "🛒", color: "#7E8480", bg: "#EEEDE8" },
};

const KEYWORDS: [string, string[]][] = [
  // non-food first: their names are more specific (e.g. "tovaglioli" contains "aglio")
  ["detersivi", ["detersiv", "candeggina", "ammorbidente", "sgrassator", "anticalcare", "lavastoviglie", "brillantante", "pavimenti", "vetri", "spugn", "panno", "panni", "guanti", "scopa", "mocio", "detergente", "disinfettante", "deodorante ambient", "insetticid", "lucida", "sapone piatti", "piatti liquido"]],
  ["igiene", ["dentifricio", "spazzolino", "shampoo", "balsamo", "bagnoschiuma", "doccia", "sapone", "deodorante", "rasoio", "schiuma da barba", "assorbent", "pannolin", "salviett", "cotone", "cotton fioc", "crema mani", "crema corpo", "crema viso", "collutorio", "filo interdentale", "igiene"]],
  ["usaegetta", ["carta igienica", "scottex", "carta casa", "tovagliol", "fazzolett", "piatti di carta", "bicchieri di plastica", "bicchieri di carta", "posate di plastica", "sacchetti", "sacchi", "pellicola", "alluminio", "carta forno", "stuzzicadent", "cannucce", "pirottin", "usa e getta", "monouso"]],
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
  ["casa", ["lampadin", "batterie", "pile", "fiammifer", "accendin", "candel", "nastro adesivo", "colla", "filtri", "igiene"]],
];

const AISLE_TO_CAT: Record<string, string> = {
  "Frutta e verdura": "verdura", "Carne e pesce": "carne", "Latticini": "latticini", "Pane e cereali": "pane",
  "Surgelati": "surgelati", "Bevande": "bevande", "Dispensa": "condimenti", "Pulizia casa": "detersivi",
  "Igiene e bagno": "igiene", "Usa e getta": "usaegetta", "Altro": "altro",
};

/** Pantry sections (tabs). Non-food sections track "when it runs out" instead of a printed expiry. */
export const LOCATIONS = [
  { key: "pantry", label: "Dispensa", icon: "cube-outline", emoji: "🥫", food: true },
  { key: "fridge", label: "Frigo", icon: "snow-outline", emoji: "🧊", food: true },
  { key: "freezer", label: "Freezer", icon: "ice-cream-outline", emoji: "❄️", food: true },
  { key: "cleaning", label: "Pulizia", icon: "water-outline", emoji: "🧴", food: false },
  { key: "hygiene", label: "Bagno", icon: "sparkles-outline", emoji: "🪥", food: false },
  { key: "disposable", label: "Usa e getta", icon: "trash-bin-outline", emoji: "🧻", food: false },
  { key: "home", label: "Casa", icon: "home-outline", emoji: "🏠", food: false },
] as const;
export type LocationKey = (typeof LOCATIONS)[number]["key"];
export const isFoodLocation = (key: string) => LOCATIONS.find((l) => l.key === key)?.food !== false;
export const locationLabel = (key: string) => LOCATIONS.find((l) => l.key === key)?.label || key;

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

/** Category → shopping aisle (inverse of AISLE_TO_CAT, with sensible extras). */
const CAT_TO_AISLE: Record<string, string> = {
  verdura: "Frutta e verdura", frutta: "Frutta e verdura", carne: "Carne e pesce", salumi: "Carne e pesce", pesce: "Carne e pesce",
  formaggi: "Latticini", latticini: "Latticini", pane: "Pane e cereali", pasta: "Pane e cereali", dolci: "Dispensa", bevande: "Bevande",
  surgelati: "Surgelati", condimenti: "Dispensa", conserve: "Dispensa", detersivi: "Pulizia casa", igiene: "Igiene e bagno", usaegetta: "Usa e getta", casa: "Altro",
};
export function categoryAisle(catKey: string): string | null {
  return CAT_TO_AISLE[catKey] || null;
}
