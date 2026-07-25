import { extractCategory, toApiResponse, type StateJson } from "../lib/products";
import { TCG_CONFIGS } from "../lib/tcg.config";

describe("extractCategory", () => {
  // Real names from mtg/state.json — bracket-suffix singles (BinderPOS style)
  const singles = [
    "Dramatic Reversal [Secret Lair Drop Series]",
    "Island (2144) [Secret Lair Drop Series]",
    "Blood Crypt [Secret Lair Drop Series]",
    "Knuckles the Echidna [Secret Lair Drop Series]",
    "Counterspell (1589) (Japanese) [Secret Lair Drop Series]",
    "Lim-Dul's Vault (Borderless) [Secret Lair Countdown Kit]",
    "KAITO, Mysterious Maestro - Jace, Unraveler of Secrets (Rainbow Foil) [Secret Lair Drop Series]",
    "Maddening Cacophony (Confetti Foil) [Secret Lair Drop Series]",
    // No bracket, but collector number / treatment markers and no sealed keyword
    "Unholy Heat (SLP-004) - Secret Lair Showdown (Borderless) Foil",
    // Card names that merely CONTAIN a sealed-sounding word are still singles
    "Howl of the Night Pack [Secret Lair Drop Series]",
    "Pack Rat [Secret Lair Drop Series]",
    "Custom Caravan Deck - The Deck of Many Things [Secret Lair Drop Series]",
    "Ghalta and Mavren (Bundle) [March of the Machine Promos]",
  ];

  const sealed = [
    "MTG - Duskmourn: House of Horror - Play Booster Pack",
    "MTG - Streets of New Capenna - English Collector Booster Pack",
    "MTG - Marvel Super Heroes Bundle (Pre Order)",
    "Magic the Gathering: Teenage Mutant Ninja Turtles Commander Deck (French)",
    "Collector Booster Box | Lorwyn Eclipsed | Magic the Gathering TCG",
    "Eternal Might Commander Deck | Aetherdrift | Magic the Gathering TCG",
    "MTG - The Lost Caverns of Ixalan - Commander Deck - Blood Rites",
    "Magic the Gathering: Kaldheim Draft Booster Box",
    // Sealed keyword must win over the Secret Lair name
    "Secret Lair Commander Deck: From Cute to Brute",
    // Whole Secret Lair drops are sealed products (card singles lead with the card name)
    "Secret Lair: Showcase: Kaldheim - Part 2",
    "Secret Lair: More Borderless Planeswalkers Foil Edition",
    "MTG Secret Lair Tragic Romance: Rainbow Foil Edition",
    // Sealed keyword before a trailing bracket must stay sealed
    "MTG - Foundations Play Booster Box [Pre-Order]",
    // Pokémon products are all sealed
    "Journey Together Elite Trainer Box",
    "Prismatic Evolutions Super Premium Collection",
    "Mega Evolution Booster Bundle",
  ];

  test.each(singles)("classifies %s as single", (name) => {
    expect(extractCategory(name)).toBe("single");
  });

  test.each(sealed)("classifies %s as sealed", (name) => {
    expect(extractCategory(name)).toBe("sealed");
  });
});

describe("toApiResponse category", () => {
  const basePrice = {
    price: 20,
    retailer: "House of Cards",
    url: "https://example.com/p",
    is_preorder: false,
    updated: "2026-07-20T00:00:00Z",
  };

  function buildState(name: string, category?: "sealed" | "single"): StateJson {
    return {
      best_prices: {
        key1: { ...basePrice, name, ...(category ? { category } : {}) },
      },
      products: {},
    };
  }

  test("derives category from the name when the scraper omits it", () => {
    const state = buildState("Blood Crypt [Secret Lair Drop Series]");
    const res = toApiResponse(state, {}, { events: [] }, TCG_CONFIGS.mtg);
    expect(res.products[0].category).toBe("single");
  });

  test("prefers the scraper-provided category over the name heuristic", () => {
    // Name looks like a single, but the scraper says sealed — scraper wins.
    const state = buildState("Blood Crypt [Secret Lair Drop Series]", "sealed");
    const res = toApiResponse(state, {}, { events: [] }, TCG_CONFIGS.mtg);
    expect(res.products[0].category).toBe("sealed");
  });

  test("joins Scryfall enrichment onto singles by group_key", () => {
    const state = buildState("Blood Crypt [Secret Lair Drop Series]");
    const enrichment = {
      generated_at: "2026-07-20T00:00:00",
      fx_rate: 1.41,
      matched: 1,
      unmatched: 0,
      cards: {
        key1: {
          scryfall_id: "abc",
          card_name: "Blood Crypt",
          set_code: "sld",
          set_name: "Secret Lair Drop",
          collector_number: "648",
          image_url: "https://cards.scryfall.io/normal/abc.jpg",
          scryfall_uri: "https://scryfall.com/card/sld/648",
          treatment: "Non-Foil",
          market_usd: 31.2,
          market_cad: 44.0,
          approximate: false,
        },
      },
    };
    const res = toApiResponse(state, {}, { events: [] }, TCG_CONFIGS.mtg, enrichment);
    expect(res.products[0].card?.card_name).toBe("Blood Crypt");
    expect(res.products[0].card?.market_cad).toBe(44.0);
  });

  test("products without enrichment get no card field", () => {
    const state = buildState("Blood Crypt [Secret Lair Drop Series]");
    const res = toApiResponse(state, {}, { events: [] }, TCG_CONFIGS.mtg, null);
    expect(res.products[0].card).toBeUndefined();
  });
});
