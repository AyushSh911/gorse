const DEITY_RULES = [
  [["banke bihari", "radha raman", "radha vallabh", "gopinath", "dwarkadhish", "dwarka", "khatu shyam", "khatushyam", "jagannath", "vitthal", "krishna", "radha", "kanha", "shyam", "meera"], "Krishna"],
  [["ram mandir", "ayodhya", "sita", "janaki", "ramayan", "shri ram", "raghunath", "hanuman garhi", "ram "], "Rama"],
  [["badrinath", "narayana", "vishnu", "dashavatar", "narayan"], "Vishnu"],
  [["vaishno", "harsiddhi", "bhadrakali", "ambaji", "ashapura", "chamunda", "baglamukhi", "annapurna", "sharda", "mahalaxmi", "mahalakshmi", "durga", "devi", "shakti", "mata"], "Devi"],
  [["ganesh", "ganpati", "vinayak", "siddhivinayak"], "Ganesha"],
  [["hanuman", "bajrangbali", "balaji", "bageshwar", "salasar"], "Hanuman"],
  [["surya"], "Surya"],
  [["sai baba", "sai "], "Sai"],
  [["mahakal", "mahadev", "shiva", "shankar", "jyotirling", "omkareshwar", "kedarnath", "trimbak", "bhimashankar", "somnath", "nageshwar", "grishneshwar", "baidyanath", "rameshwar", "pashupatinath", "bhairav"], "Shiva"],
];

const SECT_FROM_DEITY = {
  Shiva: "Shaiva",
  Vishnu: "Vaishnava",
  Krishna: "Vaishnava",
  Rama: "Vaishnava",
  Devi: "Shakta",
  Ganesha: "Smarta",
  Hanuman: "Vaishnava",
  Surya: "Smarta",
  Sai: "Smarta",
};

const TEMPLE_RULES = [
  ["mahakaleshwar", "mahakaleshwar-ujjain", "Ujjain"],
  ["mahakal", "mahakaleshwar-ujjain", "Ujjain"],
  ["omkareshwar", "omkareshwar", "Omkareshwar"],
  ["bhimashankar", "bhimashankar", "Bhimashankar"],
  ["trimbak", "trimbakeshwar", "Trimbak"],
  ["kedarnath", "kedarnath", "Kedarnath"],
  ["badrinath", "badrinath", "Badrinath"],
  ["yamunotri", "yamunotri", "Yamunotri"],
  ["gangotri", "gangotri", "Gangotri"],
  ["somnath", "somnath", "Somnath"],
  ["nageshwar", "nageshwar-dwarka", "Dwarka"],
  ["grishneshwar", "grishneshwar", "Verul"],
  ["baidyanath", "baidyanath-deoghar", "Deoghar"],
  ["rameshwar", "rameshwaram", "Rameshwaram"],
  ["kashi vishwanath", "kashi-vishwanath", "Varanasi"],
  ["vaishnodevi", "vaishno-devi", "Katra"],
  ["vaishno", "vaishno-devi", "Katra"],
  ["banke bihari", "banke-bihari-vrindavan", "Vrindavan"],
  ["dwarkadhish", "dwarkadhish", "Dwarka"],
  ["dwarka", "dwarkadhish", "Dwarka"],
  ["ram mandir", "ram-mandir-ayodhya", "Ayodhya"],
  ["siddhivinayak", "siddhivinayak-mumbai", "Mumbai"],
  ["jagannath", "jagannath-puri", "Puri"],
  ["khatu shyam", "khatu-shyam", "Khatushyam"],
  ["harsiddhi", "harsiddhi-ujjain", "Ujjain"],
  ["ambaji", "ambaji", "Ambaji"],
  ["mahalaxmi", "mahalaxmi-kolhapur", "Kolhapur"],
];

const CITY_STATE = {
  ujjain: ["Ujjain", "MP"],
  omkareshwar: ["Omkareshwar", "MP"],
  ayodhya: ["Ayodhya", "UP"],
  varanasi: ["Varanasi", "UP"],
  kashi: ["Varanasi", "UP"],
  vrindavan: ["Vrindavan", "UP"],
  mumbai: ["Mumbai", "MH"],
  dwarka: ["Dwarka", "GJ"],
  somnath: ["Somnath", "GJ"],
  kedarnath: ["Kedarnath", "UK"],
  badrinath: ["Badrinath", "UK"],
  katra: ["Katra", "JK"],
  puri: ["Puri", "OD"],
};

const CIRCUIT_TEMPLES = {
  "12-jyotirlinga": [
    "mahakaleshwar-ujjain",
    "omkareshwar",
    "bhimashankar",
    "trimbakeshwar",
    "kedarnath",
    "somnath",
    "nageshwar-dwarka",
    "grishneshwar",
    "baidyanath-deoghar",
    "rameshwaram",
    "kashi-vishwanath",
  ],
  "char-dham": ["yamunotri", "gangotri", "kedarnath", "badrinath"],
  "shakti-peeth": ["harsiddhi-ujjain", "ambaji", "vaishno-devi", "mahalaxmi-kolhapur"],
  "sapta-puri": ["ram-mandir-ayodhya", "kashi-vishwanath", "dwarkadhish", "mahakaleshwar-ujjain", "jagannath-puri"],
};

function norm(s) {
  return String(s || "").toLowerCase();
}

export function inferDeities(title, extraText = "") {
  const n = `${norm(title)} ${norm(extraText)}`;
  const out = [];
  for (const [needles, deity] of DEITY_RULES) {
    if (needles.some((x) => n.includes(x))) out.push(deity);
  }
  return [...new Set(out)];
}

export function inferTemple(title, cityHint = "") {
  const n = `${norm(title)} ${norm(cityHint)}`;
  for (const [needle, templeId, city] of TEMPLE_RULES) {
    if (n.includes(needle)) return { templeId, city: city || cityHint || "" };
  }
  return { templeId: "", city: cityHint || "" };
}

export function inferCityState(cityRaw, title = "") {
  const key = norm(cityRaw || title).trim();
  for (const [k, pair] of Object.entries(CITY_STATE)) {
    if (key.includes(k)) return { city: pair[0], state: pair[1] };
  }
  return { city: cityRaw || "", state: "" };
}

export function inferCircuits(templeId) {
  const out = [];
  for (const [circuit, temples] of Object.entries(CIRCUIT_TEMPLES)) {
    if (temples.includes(templeId)) out.push(circuit);
  }
  return out;
}

export function inferRitual(title, flags = {}, kind = "", contentKind = "") {
  const n = norm(title);
  if (contentKind === "abhishek" || n.includes("abhishek")) return "abhishek";
  if (flags.isAarti || n.includes("aarti") || n.includes("aarti")) return "aarti";
  if (n.includes("katha") || n.includes("ramayan")) return "katha";
  if (contentKind === "aaj-ke-darshan") return "darshan-yatra";
  if (kind === "vr360") return "darshan-yatra";
  return "darshan-yatra";
}

export function buildLabels({
  kind,
  appId,
  title,
  location,
  namespace,
  showKind,
  contentKind,
  metaTags = [],
  flags = {},
  seriesId,
  episodeIndex,
  extra = {},
}) {
  const loc = typeof location === "object" ? location?.en || location?.hi || "" : location || "";
  const { templeId, city: templeCity } = inferTemple(title, loc);
  const { city, state } = inferCityState(templeCity || loc, title);
  const deities = extra.deities || inferDeities(title, (metaTags || []).join(" "));
  const circuits = extra.sacred_circuits || inferCircuits(templeId);
  const ritual = extra.ritual_format || inferRitual(title, flags, showKind, contentKind);
  const sect = deities.map((d) => SECT_FROM_DEITY[d]).filter(Boolean)[0] || "";
  const search_tags = [
    ...deities,
    templeId,
    ritual,
    city,
    state,
    contentKind,
    kind,
    namespace,
    showKind,
    ...(metaTags || []),
    ...(circuits || []),
  ].filter(Boolean);

  return {
    app_id: appId,
    kind,
    namespace: namespace || "",
    surface: namespace || extra.surface || "",
    card_kind: showKind || kind,
    content_kind: contentKind,
    deities,
    sect,
    sacred_circuits: circuits,
    temple_id: templeId,
    state,
    city,
    ritual_format: ritual,
    series_id: seriesId || "",
    episode_index: episodeIndex ?? null,
    search_tags,
    metaTags: metaTags || [],
    isFree: flags.isFree ? 1 : 0,
    isAarti: flags.isAarti ? 1 : 0,
    ...extra,
  };
}
