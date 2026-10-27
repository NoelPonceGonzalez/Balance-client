export interface BrandPreset {
  id: string;
  name: string;
  group: string;
  kind: 'brand' | 'category';
  image: 'svg' | 'png' | 'jpg';
  aliases: string[];
}

export const BRANDS: BrandPreset[] = [
  {
    "id": "swarovski",
    "name": "Swarovski",
    "group": "Joyería",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "swarovski",
      "swaroski",
      "swarovsky"
    ]
  },
  {
    "id": "pandora",
    "name": "Pandora",
    "group": "Joyería",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "pandora"
    ]
  },
  {
    "id": "tous",
    "name": "Tous",
    "group": "Joyería",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "tous"
    ]
  },
  {
    "id": "tiffany",
    "name": "Tiffany",
    "group": "Joyería",
    "kind": "brand",
    "image": "jpg",
    "aliases": [
      "tiffany",
      "tiffany and co"
    ]
  },
  {
    "id": "cartier",
    "name": "Cartier",
    "group": "Joyería",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "cartier"
    ]
  },
  {
    "id": "unode50",
    "name": "UNOde50",
    "group": "Joyería",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "unode50",
      "uno de 50"
    ]
  },
  {
    "id": "agatha",
    "name": "Agatha",
    "group": "Joyería",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "agatha"
    ]
  },
  {
    "id": "sbd",
    "name": "SBD",
    "group": "Deporte",
    "kind": "brand",
    "image": "svg",
    "aliases": [
      "sbd"
    ]
  },
  {
    "id": "seiko",
    "name": "Seiko",
    "group": "Relojes",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "seiko"
    ]
  },
  {
    "id": "casio",
    "name": "Casio",
    "group": "Relojes",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "casio"
    ]
  },
  {
    "id": "rolex",
    "name": "Rolex",
    "group": "Relojes",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "rolex"
    ]
  },
  {
    "id": "tissot",
    "name": "Tissot",
    "group": "Relojes",
    "kind": "brand",
    "image": "jpg",
    "aliases": [
      "tissot"
    ]
  },
  {
    "id": "citizen",
    "name": "Citizen",
    "group": "Relojes",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "citizen"
    ]
  },
  {
    "id": "omega",
    "name": "Omega",
    "group": "Relojes",
    "kind": "brand",
    "image": "jpg",
    "aliases": [
      "omega"
    ]
  },
  {
    "id": "festina",
    "name": "Festina",
    "group": "Relojes",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "festina"
    ]
  },
  {
    "id": "icewatch",
    "name": "Ice-Watch",
    "group": "Relojes",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "ice watch",
      "ice-watch",
      "icewatch"
    ]
  },
  {
    "id": "cs2",
    "name": "CS2",
    "group": "Juegos",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "cs2",
      "cs 2",
      "counter strike",
      "counter-strike",
      "csgo",
      "counter strike 2"
    ]
  },
  {
    "id": "steam",
    "name": "Steam",
    "group": "Juegos",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "steam"
    ]
  },
  {
    "id": "playstation",
    "name": "PlayStation",
    "group": "Juegos",
    "kind": "brand",
    "image": "jpg",
    "aliases": [
      "playstation",
      "ps5",
      "ps4",
      "play station"
    ]
  },
  {
    "id": "xbox",
    "name": "Xbox",
    "group": "Juegos",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "xbox"
    ]
  },
  {
    "id": "nintendo",
    "name": "Nintendo",
    "group": "Juegos",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "nintendo",
      "switch"
    ]
  },
  {
    "id": "epic",
    "name": "Epic Games",
    "group": "Juegos",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "epic",
      "epic games",
      "fortnite"
    ]
  },
  {
    "id": "riot",
    "name": "Riot",
    "group": "Juegos",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "riot",
      "riot games",
      "league of legends",
      "valorant"
    ]
  },
  {
    "id": "roblox",
    "name": "Roblox",
    "group": "Juegos",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "roblox"
    ]
  },
  {
    "id": "ea",
    "name": "EA",
    "group": "Juegos",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "ea",
      "electronic arts",
      "fifa",
      "fc 26"
    ]
  },
  {
    "id": "mcdonalds",
    "name": "McDonald's",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "mcdonalds",
      "mc donalds",
      "mcdonald"
    ]
  },
  {
    "id": "burgerking",
    "name": "Burger King",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "burger king",
      "burgerking"
    ]
  },
  {
    "id": "kfc",
    "name": "KFC",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "kfc"
    ]
  },
  {
    "id": "starbucks",
    "name": "Starbucks",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "starbucks"
    ]
  },
  {
    "id": "telepizza",
    "name": "Telepizza",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "telepizza"
    ]
  },
  {
    "id": "dominos",
    "name": "Domino's",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "dominos",
      "domino s"
    ]
  },
  {
    "id": "vips",
    "name": "Vips",
    "group": "Comida",
    "kind": "brand",
    "image": "svg",
    "aliases": [
      "vips"
    ]
  },
  {
    "id": "fosters",
    "name": "Foster's Hollywood",
    "group": "Comida",
    "kind": "brand",
    "image": "jpg",
    "aliases": [
      "fosters",
      "foster s",
      "fosters hollywood"
    ]
  },
  {
    "id": "goiko",
    "name": "Goiko",
    "group": "Comida",
    "kind": "brand",
    "image": "jpg",
    "aliases": [
      "goiko"
    ]
  },
  {
    "id": "montaditos",
    "name": "100 Montaditos",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "100 montaditos",
      "montaditos",
      "cien montaditos"
    ]
  },
  {
    "id": "glovo",
    "name": "Glovo",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "glovo"
    ]
  },
  {
    "id": "justeat",
    "name": "Just Eat",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "just eat",
      "justeat"
    ]
  },
  {
    "id": "ubereats",
    "name": "Uber Eats",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "uber eats",
      "ubereats"
    ]
  },
  {
    "id": "rodilla",
    "name": "Rodilla",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "rodilla"
    ]
  },
  {
    "id": "ginos",
    "name": "Ginos",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "ginos"
    ]
  },
  {
    "id": "tacobell",
    "name": "Taco Bell",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "taco bell",
      "tacobell"
    ]
  },
  {
    "id": "fiveguys",
    "name": "Five Guys",
    "group": "Comida",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "five guys",
      "fiveguys"
    ]
  },
  {
    "id": "amazon",
    "name": "Amazon",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "amazon"
    ]
  },
  {
    "id": "zara",
    "name": "Zara",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "zara"
    ]
  },
  {
    "id": "nike",
    "name": "Nike",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "nike"
    ]
  },
  {
    "id": "adidas",
    "name": "Adidas",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "adidas"
    ]
  },
  {
    "id": "ikea",
    "name": "IKEA",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "ikea"
    ]
  },
  {
    "id": "corteingles",
    "name": "El Corte Inglés",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "el corte ingles",
      "corte ingles"
    ]
  },
  {
    "id": "mercadona",
    "name": "Mercadona",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "mercadona"
    ]
  },
  {
    "id": "mediamarkt",
    "name": "MediaMarkt",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "mediamarkt",
      "media markt"
    ]
  },
  {
    "id": "apple",
    "name": "Apple",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "apple"
    ]
  },
  {
    "id": "samsung",
    "name": "Samsung",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "samsung"
    ]
  },
  {
    "id": "decathlon",
    "name": "Decathlon",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "decathlon"
    ]
  },
  {
    "id": "primark",
    "name": "Primark",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "primark"
    ]
  },
  {
    "id": "hm",
    "name": "H&M",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "hm",
      "h m",
      "h and m"
    ]
  },
  {
    "id": "mango",
    "name": "Mango",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "mango"
    ]
  },
  {
    "id": "shein",
    "name": "SHEIN",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "shein"
    ]
  },
  {
    "id": "zalando",
    "name": "Zalando",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "zalando"
    ]
  },
  {
    "id": "fnac",
    "name": "Fnac",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "fnac"
    ]
  },
  {
    "id": "leroymerlin",
    "name": "Leroy Merlin",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "leroy merlin",
      "leroymerlin"
    ]
  },
  {
    "id": "carrefour",
    "name": "Carrefour",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "carrefour"
    ]
  },
  {
    "id": "lidl",
    "name": "Lidl",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "lidl"
    ]
  },
  {
    "id": "aliexpress",
    "name": "AliExpress",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "aliexpress",
      "ali express"
    ]
  },
  {
    "id": "temu",
    "name": "Temu",
    "group": "Tiendas",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "temu"
    ]
  },
  {
    "id": "netflix",
    "name": "Netflix",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "netflix"
    ]
  },
  {
    "id": "spotify",
    "name": "Spotify",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "spotify"
    ]
  },
  {
    "id": "disney",
    "name": "Disney+",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "disney",
      "disney plus",
      "disney+"
    ]
  },
  {
    "id": "max",
    "name": "Max",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "max",
      "hbo",
      "hbo max"
    ]
  },
  {
    "id": "youtube",
    "name": "YouTube",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "youtube",
      "youtube premium"
    ]
  },
  {
    "id": "dazn",
    "name": "DAZN",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "dazn"
    ]
  },
  {
    "id": "movistar",
    "name": "Movistar",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "movistar"
    ]
  },
  {
    "id": "orange",
    "name": "Orange",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "orange"
    ]
  },
  {
    "id": "vodafone",
    "name": "Vodafone",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "vodafone"
    ]
  },
  {
    "id": "digi",
    "name": "Digi",
    "group": "Suscripciones",
    "kind": "brand",
    "image": "png",
    "aliases": [
      "digi",
      "digi mobil"
    ]
  },
  {
    "id": "restaurante",
    "name": "Restaurante",
    "group": "Comida",
    "kind": "category",
    "image": "svg",
    "aliases": [
      "restaurante",
      "restarante",
      "restaruante",
      "restaurant"
    ]
  },
  {
    "id": "bar",
    "name": "Bar",
    "group": "Comida",
    "kind": "category",
    "image": "svg",
    "aliases": [
      "bar",
      "cafeteria",
      "cafetería",
      "cafe",
      "comida"
    ]
  },
  {
    "id": "reloj",
    "name": "Reloj",
    "group": "Relojes",
    "kind": "category",
    "image": "svg",
    "aliases": [
      "reloj",
      "relojes"
    ]
  },
  {
    "id": "joya",
    "name": "Joya",
    "group": "Joyería",
    "kind": "category",
    "image": "svg",
    "aliases": [
      "joya",
      "joyas",
      "anillo",
      "collar",
      "pulsera"
    ]
  },
  {
    "id": "juego",
    "name": "Juego",
    "group": "Juegos",
    "kind": "category",
    "image": "svg",
    "aliases": [
      "juego",
      "juegos",
      "skin",
      "skins"
    ]
  }
];

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return fold(value).split(' ').filter(Boolean);
}

function containsSequence(query: string[], alias: string[]): boolean {
  if (!alias.length || alias.length > query.length) return false;
  for (let start = 0; start <= query.length - alias.length; start += 1) {
    if (alias.every((part, index) => query[start + index] === part)) return true;
  }
  return false;
}

/** Unos guantes Pandora son de CS2, no la marca de joyería. */
export function isSkinName(name: string | null | undefined): boolean {
  const query = tokens(name || '');
  if (query.some((part) => part === 'cs2' || part === 'glove' || part === 'gloves' || part === 'guante' || part === 'guantes')) return true;
  return /\|/.test(name || '') || /pandora.?s box|sport gloves/i.test(name || '');
}

export function findBrand(name: string | null | undefined): BrandPreset | undefined {
  if (isSkinName(name)) return undefined;
  const query = tokens(name || '');
  if (!query.length) return undefined;
  let best: { brand: BrandPreset; score: number } | undefined;
  for (const brand of BRANDS) {
    let matched = 0;
    for (const alias of brand.aliases) {
      const parts = tokens(alias);
      if (containsSequence(query, parts)) matched = Math.max(matched, parts.join(' ').length);
    }
    if (!matched) continue;
    const score = matched * 10 + (brand.kind === 'brand' ? 1 : 0);
    if (!best || score > best.score) best = { brand, score };
  }
  return best?.brand;
}
