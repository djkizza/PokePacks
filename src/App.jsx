import { useMemo, useState, useEffect } from "react";

const CHECKED_STORAGE_KEY = "trip-packer-checked-v12";
const OVERRIDES_STORAGE_KEY = "trip-packer-bag-overrides-v12";

function makeId() {
  return `seg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parseISODateToUTC(iso) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`);
}

function tripDaysInclusive(startISO, endISO) {
  const start = parseISODateToUTC(startISO);
  const end = parseISODateToUTC(endISO);
  if (!start || !end) return 0;

  const ms = end.getTime() - start.getTime();
  const daysDiff = Math.floor(ms / (1000 * 60 * 60 * 24));
  return daysDiff >= 0 ? daysDiff + 1 : 0;
}

function safeParseNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeOverallTripWindow(segments) {
  const starts = segments.map((s) => s.startDate).filter(Boolean);
  const ends = segments.map((s) => s.endDate).filter(Boolean);
  if (starts.length === 0 || ends.length === 0) return { startISO: "", endISO: "" };

  const startISO = starts.reduce((min, d) => (d < min ? d : min), starts[0]);
  const endISO = ends.reduce((max, d) => (d > max ? d : max), ends[0]);
  return { startISO, endISO };
}

function computeWeatherSummary(segments) {
  let overallMin = null;
  let overallMax = null;
  let anyRain = false;
  let anySun = false;
  let anyHumid = false;

  for (const s of segments) {
    const minT = safeParseNumber(s.tempMin);
    const maxT = safeParseNumber(s.tempMax);

    if (minT !== null) overallMin = overallMin === null ? minT : Math.min(overallMin, minT);
    if (maxT !== null) overallMax = overallMax === null ? maxT : Math.max(overallMax, maxT);

    if (s.rainLikely) anyRain = true;
    if (s.hotSunLikely) anySun = true;
    if (s.humidLikely) anyHumid = true;
  }

  return { overallMin, overallMax, anyRain, anySun, anyHumid };
}

function dateInSegmentExclusive(dayISO, startISO, endISO) {
  // Used for daily arrays where "endDate" is treated as end boundary.
  if (!dayISO || !startISO || !endISO) return true;
  return dayISO >= startISO && dayISO < endISO;
}

function dateInSegmentInclusive(dayISO, startISO, endISO) {
  // Used for hourly filtering where you usually want to include the end day too.
  if (!dayISO || !startISO || !endISO) return true;
  return dayISO >= startISO && dayISO <= endISO;
}

function computeClothesMath(startISO, endISO, washes, includeSpareSet) {
  const days = tripDaysInclusive(startISO, endISO);

  const washCountRaw = Number(washes);
  const washCount = Number.isFinite(washCountRaw) ? washCountRaw : 0;

  const cycles = washCount + 1;
  const baseSets = days > 0 ? Math.ceil(days / cycles) : 0;
  const setsNeeded = includeSpareSet ? baseSets + 1 : baseSets;

  return { days, washCount, cycles, baseSets, setsNeeded };
}

// Default is checked (your preference).
function packItem(category, name, quantity = 1, bag = "checked") {
  return { category, name, quantity, bag };
}

// Stable key ignores bag, used for bag overrides.
function stableKey(item) {
  return `${item.category}__${item.name}`;
}

function uniqItemsByBag(items) {
  const map = new Map();
  for (const it of items) {
    const key = `${it.bag}__${it.category}__${it.name}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, quantity: (existing.quantity || 1) + (it.quantity || 1) });
    } else {
      map.set(key, { ...it, quantity: it.quantity ?? 1 });
    }
  }
  return Array.from(map.values());
}

function addWeatherClothes(items, minT, maxT, rainLikely, hotSunLikely) {
  // Cold layers (existing)
  if (minT !== null) {
    if (minT <= 5) {
      items.push(packItem("Clothes", "Warm jacket", 1, "checked"));
      items.push(packItem("Clothes", "Warm layer (jumper or hoodie)", 1, "checked"));
    } else if (minT <= 12) {
      items.push(packItem("Clothes", "Light jacket", 1, "checked"));
      items.push(packItem("Clothes", "Warm layer (jumper or hoodie)", 1, "checked"));
    } else if (minT <= 16) {
      items.push(packItem("Clothes", "Light layer (jumper or cardigan)", 1, "checked"));
    }

    // New rule: min temp at or below 10 means cold accessories
    if (minT <= 10) {
      items.push(packItem("Clothes", "Beanie", 1, "checked"));
      items.push(packItem("Clothes", "Scarf", 1, "checked"));
      items.push(packItem("Clothes", "Gloves", 1, "checked"));
    }
  }

  if (rainLikely) items.push(packItem("Clothes", "Umbrella or rain jacket", 1, "checked"));
  if (hotSunLikely) items.push(packItem("Clothes", "Sunglasses", 1, "checked"));

  if (maxT !== null) {
    if (maxT >= 32) items.push(packItem("Clothes", "Hat", 1, "checked"));
    else if (maxT >= 28) items.push(packItem("Clothes", "Hat (optional)", 1, "checked"));
  }
}

function generatePackingList(state) {
  const {
    segments,
    washes,
    includeSpareSet,
    pokemonGoNeeded,
    altAccount,
    eggWalker,
    tradeList,
    partnerPokemon,
    isInternational,
    isJapanTrip,
    bringTablet,
    bringWorkLaptop,
  } = state;

  const { startISO, endISO } = computeOverallTripWindow(segments);
  const maths = computeClothesMath(startISO, endISO, washes, includeSpareSet);
  const weather = computeWeatherSummary(segments);

  const items = [];

  // Tech: devices carry on
  items.push(packItem("Tech", "Main iPhone", 1, "carryOn"));
  items.push(packItem("Tech", "Apple Watch", 1, "carryOn"));
  items.push(packItem("Tech", "AirPods", 1, "carryOn"));
  items.push(packItem("Tech", "Viture neckband", 1, "carryOn"));
  items.push(packItem("Tech", "Viture glasses", 1, "carryOn"));
  if (bringTablet) items.push(packItem("Tech", "Tablet", 1, "carryOn"));
  if (bringWorkLaptop) items.push(packItem("Tech", "Work laptop", 1, "carryOn"));

  // Chargers: checked, except ONE iPhone cable in carry on
  items.push(packItem("Tech", "iPhone charger", 1, "checked"));
  items.push(packItem("Tech", "iPhone charging cable", 1, "carryOn"));
  items.push(packItem("Tech", "Apple Watch charger", 1, "checked"));
  if (bringTablet) {
    items.push(packItem("Tech", "Tablet charger", 1, "checked"));
    items.push(packItem("Tech", "Tablet charging cable", 1, "checked"));
  }
  if (bringWorkLaptop) {
    items.push(packItem("Tech", "Laptop charger", 1, "checked"));
  }

  if (isInternational) {
    items.push(packItem("Tech", "Travel adapter", 1, "checked"));
    items.push(packItem("Tech", "Chromecast", 1, "checked"));
  }

  // Documents and money (carry on)
  if (isInternational) {
    items.push(packItem("Documents", "Passport", 1, "carryOn"));
    items.push(packItem("Money", "Currency for destination (if you have any)", 1, "carryOn"));
    items.push(packItem("Money", "Money pouch", 1, "carryOn"));
    items.push(packItem("Documents", "Australian customs form (blank)", 1, "carryOn"));
    items.push(packItem("Documents", "Pen", 1, "carryOn"));
  }

  if (isJapanTrip) items.push(packItem("Misc", "Eki stamp book", 1, "carryOn"));

  // Misc
  items.push(packItem("Misc", "Pillow", 1, "checked"));

  // Toiletries
  items.push(packItem("Toiletries", "Toothbrush", 1, "checked"));
  items.push(packItem("Toiletries", "Toothpaste", 1, "checked"));
  items.push(packItem("Toiletries", "Deodorant", 1, "checked"));

  items.push(packItem("Toiletries", "Face masks", 1, "carryOn"));
  items.push(packItem("Toiletries", "Travel hand sanitiser (100ml or less)", 1, "carryOn"));

  items.push(packItem("Toiletries", "Body wash", 1, "checked"));
  items.push(packItem("Toiletries", "Beard wash", 1, "checked"));
  items.push(packItem("Toiletries", "Vitamins", 1, "checked"));
  items.push(packItem("Toiletries", "Paracetamol", 1, "carryOn"));
  items.push(packItem("Toiletries", "Band aids", 1, "checked"));
  items.push(packItem("Toiletries", "Lip balm", 1, "carryOn"));
  items.push(packItem("Toiletries", "Condoms", 1, "checked"));

  // Clothes
  if (maths.days > 0) {
    items.push(packItem("Clothes", "Underwear", maths.setsNeeded, "checked"));
    items.push(packItem("Clothes", "Socks", maths.setsNeeded, "checked"));
    items.push(packItem("Clothes", "Tops", maths.setsNeeded, "checked"));

    const needsJeans = weather.overallMin !== null && weather.overallMin <= 18;
    const needsShorts = weather.overallMax !== null && weather.overallMax >= 24;

    if (needsJeans) items.push(packItem("Clothes", "Jeans (or other long pants)", 1, "checked"));
    if (needsShorts) items.push(packItem("Clothes", "Shorts", 2, "checked"));
    if (!needsJeans && !needsShorts) {
      items.push(packItem("Clothes", "Bottoms", Math.max(1, Math.ceil(maths.setsNeeded / 2)), "checked"));
    }

    // New humidity rule: if any destination is humid and it is warm, add singlets
    // Quantity kept simple but tied to trip length
    if (weather.anyHumid && weather.overallMax !== null && weather.overallMax >= 26) {
      const singlets = Math.max(1, Math.min(2, maths.setsNeeded));
      items.push(packItem("Clothes", "Singlet", singlets, "checked"));
    }

    items.push(packItem("Clothes", "Sleepwear", 1, "checked"));
    addWeatherClothes(items, weather.overallMin, weather.overallMax, weather.anyRain, weather.anySun);
  }

  // Pokémon GO implies hat
  if (pokemonGoNeeded) items.push(packItem("Clothes", "Hat", 1, "checked"));

  // Pokémon GO
  if (pokemonGoNeeded) {
    items.push(packItem("Pokémon GO", "Power bank", 1, "carryOn"));
    items.push(packItem("Pokémon GO", "Pokémon GO Plus+", 1, "carryOn"));
    items.push(packItem("Pokémon GO", "Sunscreen", 1, "checked"));
    items.push(packItem("Pokémon GO", "Satchel", 1, "checked"));

    if (tradeList) {
      items.push(packItem("Pokémon GO", "Printed trade list", 1, "checked"));
      items.push(packItem("Pokémon GO", "Lanyard", 1, "checked"));
    }

    if (altAccount) {
      items.push(packItem("Pokémon GO", "Alt phone", 1, "carryOn"));
      items.push(packItem("Pokémon GO", "Alt phone charging cable", 1, "checked"));
    }

    if (eggWalker) {
      items.push(packItem("Pokémon GO", "Egg walker", 1, "carryOn"));
      items.push(packItem("Pokémon GO", "iPhone (for egg walker)", 2, "carryOn"));
      items.push(packItem("Pokémon GO", "iPhone charging cable (for egg walker)", 2, "checked"));
    }

    if (partnerPokemon) {
      items.push(packItem("Pokémon GO", "Partner Pokémon plush", 1, "checked"));
      // Magnet piece is implicit, not listed
    }
  }

  const cleaned = items.filter((x) => (x.quantity ?? 1) > 0);
  return uniqItemsByBag(cleaned).sort((a, b) => {
    if (a.bag !== b.bag) return a.bag.localeCompare(b.bag);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
}

function groupByCategory(items) {
  const catMap = new Map();
  for (const it of items) {
    if (!catMap.has(it.category)) catMap.set(it.category, []);
    catMap.get(it.category).push(it);
  }
  return catMap;
}

function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia?.("(max-width: 900px)")?.matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 900px)");
    if (!mq) return;
    const handler = (e) => setIsNarrow(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return isNarrow;
}

function buildExportText(items) {
  const carryOn = items.filter((x) => x.bag === "carryOn");
  const checked = items.filter((x) => x.bag === "checked");

  function section(title, list) {
    const catMap = groupByCategory(list);
    const lines = [`${title}`];

    for (const [cat, rows] of Array.from(catMap.entries())) {
      lines.push("");
      lines.push(`${cat}`);
      for (const it of rows) {
        const qty = it.quantity > 1 ? ` x${it.quantity}` : "";
        lines.push(`- ${it.name}${qty}`);
      }
    }

    return lines.join("\n");
  }

  return [section("Carry on", carryOn), "", section("Checked baggage", checked)].join("\n");
}

function BagSection({
  title,
  bagKey,
  items,
  checkedState,
  onToggleChecked,
  bagOverrides,
  onChangeBag,
  isPackingMode,
}) {
  const bagItems = items.filter((x) => x.bag === bagKey);
  const catMap = useMemo(() => groupByCategory(bagItems), [bagItems]);

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "44px 1fr auto",
    alignItems: "center",
    gap: 10,
    padding: "10px 0",
  };

  return (
    <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 14 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>

      {bagItems.length === 0 ? <div style={{ opacity: 0.7 }}>No items.</div> : null}

      {Array.from(catMap.entries()).map(([category, list]) => (
        <div key={category} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
          <h3 style={{ margin: "0 0 8px 0" }}>{category}</h3>

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {list.map((it) => {
              const id = `${it.bag}__${it.category}__${it.name}`;
              const isChecked = !!checkedState[id];
              const k = stableKey(it);

              return (
                <li key={id} style={rowStyle}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleChecked(id)}
                    style={{ width: 20, height: 20 }}
                    aria-label={`Mark ${it.name} as packed`}
                  />

                  <div style={{ minWidth: 0 }}>
                    <div style={{ textDecoration: isChecked ? "line-through" : "none" }}>
                      {it.name} {it.quantity > 1 ? <span style={{ opacity: 0.7 }}>x{it.quantity}</span> : null}
                    </div>
                  </div>

                  <select
                    value={bagOverrides[k] ?? it.bag}
                    onChange={(e) => onChangeBag(k, e.target.value)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #bbb",
                      background: "#fff",
                      fontSize: 14,
                      display: isPackingMode ? "none" : "block",
                    }}
                    aria-label={`Move ${it.name} to another bag`}
                  >
                    <option value="carryOn">Carry on</option>
                    <option value="checked">Checked</option>
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SegmentCard({ segment, index, onChange, onRemove, canRemove, onAutoWeather }) {
  const cardStyle = { padding: 12, border: "1px solid #ddd", borderRadius: 12, display: "grid", gap: 10 };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <strong>Destination {index + 1}</strong>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #333",
            background: canRemove ? "#fff" : "#eee",
            cursor: canRemove ? "pointer" : "not-allowed",
          }}
        >
          Remove
        </button>
      </div>

      <label>
        Location{" "}
        <input
          value={segment.location}
          onChange={(e) => onChange({ ...segment, location: e.target.value })}
          placeholder="e.g. Hong Kong, Tainan"
          style={{ width: "min(520px, 100%)", padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
        />
      </label>

      <div style={{ display: "grid", gap: 8 }}>
        <label>
          Start date{" "}
          <input
            type="date"
            value={segment.startDate}
            onChange={(e) => onChange({ ...segment, startDate: e.target.value })}
            style={{ padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
          />
        </label>
        <label>
          End date{" "}
          <input
            type="date"
            value={segment.endDate}
            onChange={(e) => onChange({ ...segment, endDate: e.target.value })}
            style={{ padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
          />
        </label>
      </div>

      <div style={{ padding: 10, border: "1px dashed #bbb", borderRadius: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <strong>Weather for this destination</strong>
          <button
            onClick={onAutoWeather}
            disabled={segment.weatherLoading}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #333",
              background: segment.weatherLoading ? "#eee" : "#fff",
              cursor: segment.weatherLoading ? "not-allowed" : "pointer",
            }}
          >
            {segment.weatherLoading ? "Fetching..." : "Auto fill weather (Open Meteo)"}
          </button>
        </div>

        {segment.weatherError ? <div style={{ color: "#b00020" }}>{segment.weatherError}</div> : null}
        {segment.resolvedName ? <div style={{ opacity: 0.8 }}>Matched to: {segment.resolvedName}</div> : null}

        <label>
          Min temp (°C){" "}
          <input
            type="number"
            value={segment.tempMin}
            onChange={(e) => onChange({ ...segment, tempMin: e.target.value })}
            style={{ width: 140, padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
          />
        </label>

        <label>
          Max temp (°C){" "}
          <input
            type="number"
            value={segment.tempMax}
            onChange={(e) => onChange({ ...segment, tempMax: e.target.value })}
            style={{ width: 140, padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
          />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={segment.rainLikely} onChange={(e) => onChange({ ...segment, rainLikely: e.target.checked })} />
          Rain likely
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={segment.hotSunLikely} onChange={(e) => onChange({ ...segment, hotSunLikely: e.target.checked })} />
          Hot sun likely
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={segment.humidLikely}
            onChange={(e) => onChange({ ...segment, humidLikely: e.target.checked })}
          />
          Humid likely
        </label>

        {segment.humidityNote ? <div style={{ opacity: 0.8 }}>{segment.humidityNote}</div> : null}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input type="checkbox" checked={segment.pokemonGo} onChange={(e) => onChange({ ...segment, pokemonGo: e.target.checked })} />
        Pokémon GO focused in this destination
      </label>
    </div>
  );
}

export default function App() {
  const isNarrow = useIsNarrow();

  const [segments, setSegments] = useState([
    {
      id: makeId(),
      location: "",
      startDate: "",
      endDate: "",
      tempMin: "",
      tempMax: "",
      rainLikely: false,
      hotSunLikely: false,
      humidLikely: false,
      humidityNote: "",
      pokemonGo: false,
      weatherLoading: false,
      weatherError: "",
      resolvedName: "",
      lat: null,
      lon: null,
    },
  ]);

  const [washes, setWashes] = useState(0);
  const [includeSpareSet, setIncludeSpareSet] = useState(true);

  const [isInternational, setIsInternational] = useState(false);
  const [isJapanTrip, setIsJapanTrip] = useState(false);

  const [bringTablet, setBringTablet] = useState(false);
  const [bringWorkLaptop, setBringWorkLaptop] = useState(false);

  const pokemonGoNeeded = segments.some((s) => s.pokemonGo);

  const [altAccount, setAltAccount] = useState(false);
  const [eggWalker, setEggWalker] = useState(false);
  const [tradeList, setTradeList] = useState(false);
  const [partnerPokemon, setPartnerPokemon] = useState(false);

  const [isPackingMode, setIsPackingMode] = useState(false);

  useEffect(() => {
    if (!pokemonGoNeeded) {
      setAltAccount(false);
      setEggWalker(false);
      setTradeList(false);
      setPartnerPokemon(false);
    }
  }, [pokemonGoNeeded]);

  useEffect(() => {
    if (!isInternational) setIsJapanTrip(false);
  }, [isInternational]);

  const [checkedState, setCheckedState] = useState(() => {
    try {
      const saved = localStorage.getItem(CHECKED_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [bagOverrides, setBagOverrides] = useState(() => {
    try {
      const saved = localStorage.getItem(OVERRIDES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [generated, setGenerated] = useState([]);

  const { startISO, endISO } = computeOverallTripWindow(segments);
  const maths = computeClothesMath(startISO, endISO, washes, includeSpareSet);

  function updateSegment(idx, next) {
    setSegments((prev) => prev.map((s, i) => (i === idx ? next : s)));
  }

  function addSegment() {
    setSegments((prev) => [
      ...prev,
      {
        id: makeId(),
        location: "",
        startDate: "",
        endDate: "",
        tempMin: "",
        tempMax: "",
        rainLikely: false,
        hotSunLikely: false,
        humidLikely: false,
        humidityNote: "",
        pokemonGo: false,
        weatherLoading: false,
        weatherError: "",
        resolvedName: "",
        lat: null,
        lon: null,
      },
    ]);
  }

  function removeSegment(idx) {
    setSegments((prev) => prev.filter((_, i) => i !== idx));
  }

  // Humidity rule A:
  // humidLikely if humidity >= 80% for at least half the hours in the destination date range.
  function computeHumidLikelyFromHourly(hourlyTimes, hourlyHum, seg) {
    if (!hourlyTimes?.length || !hourlyHum?.length) return { humidLikely: false, note: "" };

    const rows = hourlyTimes
      .map((t, i) => ({ t, hum: hourlyHum[i] }))
      .filter((r) => {
        const day = String(r.t).split("T")[0];
        return dateInSegmentInclusive(day, seg.startDate, seg.endDate);
      });

    const usable = rows.filter((r) => Number.isFinite(r.hum));
    if (usable.length === 0) return { humidLikely: false, note: "" };

    const humidHours = usable.filter((r) => r.hum >= 80).length;
    const fraction = humidHours / usable.length;
    const humidLikely = fraction >= 0.5;

    const pct = Math.round(fraction * 100);
    const note = `Humidity check: ${pct}% of hours are 80% or higher`;

    return { humidLikely, note };
  }

  async function autoFillWeather(idx) {
    const seg = segments[idx];
    const name = (seg.location || "").trim();

    if (!name) {
      updateSegment(idx, { ...seg, weatherError: "Enter a location first.", weatherLoading: false });
      return;
    }

    updateSegment(idx, { ...seg, weatherLoading: true, weatherError: "", humidityNote: "" });

    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) throw new Error("Geocoding request failed.");
      const geoJson = await geoRes.json();

      const first = geoJson?.results?.[0];
      if (!first) throw new Error("No matching location found. Try adding country or state.");

      const lat = first.latitude;
      const lon = first.longitude;
      const resolvedName = [first.name, first.admin1, first.country].filter(Boolean).join(", ");

      // Fetch daily temps + rain probability, plus hourly humidity
      const forecastUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
        `&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max` +
        `&hourly=relative_humidity_2m` +
        `&timezone=auto`;

      const fRes = await fetch(forecastUrl);
      if (!fRes.ok) throw new Error("Forecast request failed.");
      const fJson = await fRes.json();

      const times = fJson?.daily?.time || [];
      const mins = fJson?.daily?.temperature_2m_min || [];
      const maxs = fJson?.daily?.temperature_2m_max || [];
      const pop = fJson?.daily?.precipitation_probability_max || [];

      const hourlyTimes = fJson?.hourly?.time || [];
      const hourlyHum = fJson?.hourly?.relative_humidity_2m || [];

      if (times.length === 0 || mins.length === 0 || maxs.length === 0) {
        throw new Error("Forecast response missing daily values.");
      }

      const filteredDaily = times
        .map((t, i) => ({ t, min: mins[i], max: maxs[i], pop: pop[i] }))
        .filter((row) => dateInSegmentExclusive(row.t, seg.startDate, seg.endDate));

      const rowsDaily = filteredDaily.length > 0 ? filteredDaily : times.map((t, i) => ({ t, min: mins[i], max: maxs[i], pop: pop[i] }));

      let minTemp = null;
      let maxTemp = null;
      let rainLikely = false;
      let hotSunLikely = false;

      for (const r of rowsDaily) {
        if (Number.isFinite(r.min)) minTemp = minTemp === null ? r.min : Math.min(minTemp, r.min);
        if (Number.isFinite(r.max)) maxTemp = maxTemp === null ? r.max : Math.max(maxTemp, r.max);
        if (Number.isFinite(r.pop) && r.pop >= 50) rainLikely = true;
        if (Number.isFinite(r.max) && r.max >= 28) hotSunLikely = true;
      }

      const humidResult = computeHumidLikelyFromHourly(hourlyTimes, hourlyHum, seg);

      updateSegment(idx, {
        ...seg,
        weatherLoading: false,
        weatherError: "",
        resolvedName,
        lat,
        lon,
        tempMin: minTemp === null ? seg.tempMin : Math.round(minTemp),
        tempMax: maxTemp === null ? seg.tempMax : Math.round(maxTemp),
        rainLikely,
        hotSunLikely,
        humidLikely: humidResult.humidLikely,
        humidityNote: humidResult.note,
      });
    } catch (err) {
      updateSegment(idx, { ...seg, weatherLoading: false, weatherError: err?.message || "Weather lookup failed." });
    }
  }

  function applyOverrides(items, overrides) {
    return items.map((it) => {
      const k = stableKey(it);
      const forced = overrides[k];
      return forced ? { ...it, bag: forced } : it;
    });
  }

  function onGenerate() {
    const baseItems = generatePackingList({
      segments,
      washes,
      includeSpareSet,
      pokemonGoNeeded,
      altAccount,
      eggWalker,
      tradeList,
      partnerPokemon,
      isInternational,
      isJapanTrip,
      bringTablet,
      bringWorkLaptop,
    });

    const withOverrides = applyOverrides(baseItems, bagOverrides);
    setGenerated(withOverrides);

    setCheckedState({});
    localStorage.removeItem(CHECKED_STORAGE_KEY);

    setIsPackingMode(true);
  }

  function toggleChecked(id) {
    setCheckedState((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(CHECKED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function changeBagOverride(k, bag) {
    setBagOverrides((prev) => {
      const next = { ...prev, [k]: bag };
      localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });

    setGenerated((prev) =>
      prev.map((it) => {
        const itKey = stableKey(it);
        return itKey === k ? { ...it, bag } : it;
      })
    );

    setCheckedState({});
    localStorage.removeItem(CHECKED_STORAGE_KEY);
  }

  async function copyToClipboard() {
    const text = buildExportText(generated);
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard.");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        alert("Copied to clipboard.");
      } catch {
        alert("Could not copy. You can manually select and copy from the export preview.");
      }
    }
  }

  function printList() {
    const text = buildExportText(generated);
    const w = window.open("", "_blank");
    if (!w) {
      alert("Pop up blocked. Allow pop ups, or use Copy instead.");
      return;
    }

    const safe = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

    w.document.write(`
      <html>
        <head>
          <title>Packing list</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { font-family: system-ui, Arial; padding: 16px; }
            h1 { margin-top: 0; }
            .box { border: 1px solid #ddd; border-radius: 12px; padding: 14px; }
          </style>
        </head>
        <body>
          <h1>Packing list</h1>
          <div class="box">${safe}</div>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `);
    w.document.close();
  }

  const canGenerate = segments.every((s) => s.startDate && s.endDate) && maths.days > 0;
  const destinationsText = segments.map((s) => (s.location || "").trim()).filter(Boolean).join(" → ");

  const totalItems = generated.length;
  const packedCount = Object.values(checkedState).filter(Boolean).length;
  const progress = totalItems > 0 ? Math.round((packedCount / totalItems) * 100) : 0;

  const columnsStyle = isNarrow ? "1fr" : "1fr 1fr";
  const exportPreview = generated.length > 0 ? buildExportText(generated) : "";

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16, fontFamily: "system-ui, Arial" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>PokéPack</h1>

        <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={isPackingMode} onChange={(e) => setIsPackingMode(e.target.checked)} />
          Packing mode
        </label>
      </div>

      {generated.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 14 }}>
          <strong>Progress</strong>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 10, borderRadius: 999, background: "#eee", overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "#333" }} />
            </div>
            <div style={{ minWidth: 120, textAlign: "right", opacity: 0.85 }}>
              {packedCount} / {totalItems} ({progress}%)
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={copyToClipboard}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #333", background: "#fff", cursor: "pointer" }}
            >
              Copy list
            </button>

            <button
              onClick={printList}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #333", background: "#fff", cursor: "pointer" }}
            >
              Print / Save PDF
            </button>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>Export preview</summary>
            <pre style={{ whiteSpace: "pre-wrap", marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
              {exportPreview}
            </pre>
          </details>
        </div>
      )}

      {!isPackingMode && (
        <div style={{ marginTop: 12, display: "grid", gap: 12, padding: 16, border: "1px solid #ddd", borderRadius: 14 }}>
          <div style={{ display: "grid", gap: 12 }}>
            {segments.map((seg, idx) => (
              <SegmentCard
                key={seg.id}
                segment={seg}
                index={idx}
                onChange={(next) => updateSegment(idx, next)}
                onRemove={() => removeSegment(idx)}
                canRemove={segments.length > 1}
                onAutoWeather={() => autoFillWeather(idx)}
              />
            ))}

            <button
              onClick={addSegment}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid #333",
                background: "#fff",
                cursor: "pointer",
                width: "fit-content",
              }}
            >
              Add another destination
            </button>
          </div>

          <div style={{ padding: 12, border: "1px dashed #bbb", borderRadius: 14, display: "grid", gap: 8 }}>
            <strong>Trip summary</strong>
            <div style={{ opacity: 0.85 }}>Destinations: {destinationsText || "Enter locations"}</div>
            <div style={{ opacity: 0.85 }}>
              Overall dates: {startISO && endISO ? `${startISO} to ${endISO}` : "Enter dates in each destination"}
            </div>

            <div style={{ paddingTop: 6 }}>
              <strong>Packing maths</strong>
              <div style={{ opacity: 0.85 }}>Days away (end date included): {maths.days || "—"}</div>
              <div style={{ opacity: 0.85 }}>
                Washes: {maths.washCount} → Cycles: {maths.cycles}
              </div>
              <div style={{ opacity: 0.85 }}>
                Sets between washes: {maths.baseSets || "—"}
                {includeSpareSet ? " + 1 spare" : ""} = {maths.setsNeeded || "—"}
              </div>
            </div>
          </div>

          <label>
            Washes during trip{" "}
            <select value={washes} onChange={(e) => setWashes(Number(e.target.value))} style={{ padding: 8, borderRadius: 10 }}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3+</option>
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={includeSpareSet} onChange={(e) => setIncludeSpareSet(e.target.checked)} />
            Include a spare set (useful for laundry days)
          </label>

          <div style={{ padding: 12, border: "1px dashed #bbb", borderRadius: 14, display: "grid", gap: 10 }}>
            <strong>Trip wide questions</strong>

            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={isInternational} onChange={(e) => setIsInternational(e.target.checked)} />
              International trip
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 10, opacity: isInternational ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={isJapanTrip}
                disabled={!isInternational}
                onChange={(e) => setIsJapanTrip(e.target.checked)}
              />
              Trip includes Japan (Eki stamp book)
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={bringTablet} onChange={(e) => setBringTablet(e.target.checked)} />
              Bring tablet
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" checked={bringWorkLaptop} onChange={(e) => setBringWorkLaptop(e.target.checked)} />
              Bring work laptop
            </label>
          </div>

          {pokemonGoNeeded && (
            <div style={{ padding: 12, border: "1px dashed #bbb", borderRadius: 14, display: "grid", gap: 10 }}>
              <strong>Pokémon GO questions (trip wide)</strong>

              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={altAccount} onChange={(e) => setAltAccount(e.target.checked)} />
                Taking an alt account
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={eggWalker} onChange={(e) => setEggWalker(e.target.checked)} />
                Taking the egg walker (requires 2 iPhones)
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={tradeList} onChange={(e) => setTradeList(e.target.checked)} />
                Taking a printed trade list (requires lanyard)
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={partnerPokemon} onChange={(e) => setPartnerPokemon(e.target.checked)} />
                Taking partner Pokémon
              </label>
            </div>
          )}

          <button
            onClick={onGenerate}
            disabled={!canGenerate}
            style={{
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid #333",
              background: canGenerate ? "#fff" : "#eee",
              cursor: canGenerate ? "pointer" : "not-allowed",
            }}
          >
            Generate packing list
          </button>

          {!canGenerate && (
            <div style={{ opacity: 0.75, fontSize: 14 }}>
              Tip: Each destination needs a start date and end date (overall trip must be at least 1 day).
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: columnsStyle, gap: 16 }}>
        {generated.length > 0 ? (
          <>
            <BagSection
              title="Carry on"
              bagKey="carryOn"
              items={generated}
              checkedState={checkedState}
              onToggleChecked={toggleChecked}
              bagOverrides={bagOverrides}
              onChangeBag={changeBagOverride}
              isPackingMode={isPackingMode}
            />
            <BagSection
              title="Checked baggage"
              bagKey="checked"
              items={generated}
              checkedState={checkedState}
              onToggleChecked={toggleChecked}
              bagOverrides={bagOverrides}
              onChangeBag={changeBagOverride}
              isPackingMode={isPackingMode}
            />
          </>
        ) : (
          <p style={{ opacity: 0.75 }}>
            Generate a packing list to see Carry on and Checked baggage. Use Packing mode on your phone once you’re packing.
          </p>
        )}
      </div>
    </div>
  );
}
