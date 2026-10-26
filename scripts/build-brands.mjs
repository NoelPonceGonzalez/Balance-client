import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'brands');
fs.mkdirSync(outDir, { recursive: true });

/** id, nombre, grupo, tipo, dominios, alias */
const rows = [
  ['swarovski', 'Swarovski', 'Joyería', 'brand', ['swarovski.com'], ['swarovski', 'swaroski', 'swarovsky']],
  ['pandora', 'Pandora', 'Joyería', 'brand', ['pandora.net', 'es.pandora.net'], ['pandora']],
  ['tous', 'Tous', 'Joyería', 'brand', ['tous.com'], ['tous']],
  ['tiffany', 'Tiffany', 'Joyería', 'brand', ['tiffany.com'], ['tiffany', 'tiffany and co']],
  ['cartier', 'Cartier', 'Joyería', 'brand', ['cartier.com'], ['cartier']],
  ['unode50', 'UNOde50', 'Joyería', 'brand', ['unode50.com'], ['unode50', 'uno de 50']],
  ['agatha', 'Agatha', 'Joyería', 'brand', ['agatha.es'], ['agatha']],
  ['seiko', 'Seiko', 'Relojes', 'brand', ['seikowatches.com', 'seiko.com'], ['seiko']],
  ['casio', 'Casio', 'Relojes', 'brand', ['casio.com'], ['casio']],
  ['rolex', 'Rolex', 'Relojes', 'brand', ['rolex.com'], ['rolex']],
  ['tissot', 'Tissot', 'Relojes', 'brand', ['tissot.com', 'tissotwatches.com'], ['tissot']],
  ['citizen', 'Citizen', 'Relojes', 'brand', ['citizenwatch.com'], ['citizen']],
  ['omega', 'Omega', 'Relojes', 'brand', ['omegawatches.com'], ['omega']],
  ['festina', 'Festina', 'Relojes', 'brand', ['festina.com'], ['festina']],
  ['icewatch', 'Ice-Watch', 'Relojes', 'brand', ['ice-watch.com'], ['ice watch', 'ice-watch', 'icewatch']],
  ['cs2', 'CS2', 'Juegos', 'brand', ['counter-strike.net'], ['cs2', 'cs 2', 'counter strike', 'counter-strike', 'csgo', 'counter strike 2']],
  ['steam', 'Steam', 'Juegos', 'brand', ['store.steampowered.com'], ['steam']],
  ['playstation', 'PlayStation', 'Juegos', 'brand', ['playstation.com'], ['playstation', 'ps5', 'ps4', 'play station']],
  ['xbox', 'Xbox', 'Juegos', 'brand', ['xbox.com'], ['xbox']],
  ['nintendo', 'Nintendo', 'Juegos', 'brand', ['nintendo.com'], ['nintendo', 'switch']],
  ['epic', 'Epic Games', 'Juegos', 'brand', ['epicgames.com'], ['epic', 'epic games', 'fortnite']],
  ['riot', 'Riot', 'Juegos', 'brand', ['riotgames.com'], ['riot', 'riot games', 'league of legends', 'valorant']],
  ['roblox', 'Roblox', 'Juegos', 'brand', ['roblox.com'], ['roblox']],
  ['ea', 'EA', 'Juegos', 'brand', ['ea.com'], ['ea', 'electronic arts', 'fifa', 'fc 26']],
  ['mcdonalds', "McDonald's", 'Comida', 'brand', ['mcdonalds.es', 'mcdonalds.com'], ['mcdonalds', 'mc donalds', 'mcdonald']],
  ['burgerking', 'Burger King', 'Comida', 'brand', ['burgerking.es'], ['burger king', 'burgerking']],
  ['kfc', 'KFC', 'Comida', 'brand', ['kfc.es', 'kfc.com'], ['kfc']],
  ['starbucks', 'Starbucks', 'Comida', 'brand', ['starbucks.es', 'starbucks.com'], ['starbucks']],
  ['telepizza', 'Telepizza', 'Comida', 'brand', ['telepizza.com', 'telepizza.es'], ['telepizza']],
  ['dominos', "Domino's", 'Comida', 'brand', ['dominos.com', 'dominos.es'], ['dominos', 'domino s']],
  ['vips', 'Vips', 'Comida', 'brand', ['grupovips.com', 'vips.es'], ['vips']],
  ['fosters', "Foster's Hollywood", 'Comida', 'brand', ['fostershollywood.es'], ['fosters', 'foster s', 'fosters hollywood']],
  ['goiko', 'Goiko', 'Comida', 'brand', ['goiko.com'], ['goiko']],
  ['montaditos', '100 Montaditos', 'Comida', 'brand', ['spain.100montaditos.com', '100montaditos.com'], ['100 montaditos', 'montaditos', 'cien montaditos']],
  ['glovo', 'Glovo', 'Comida', 'brand', ['glovoapp.com'], ['glovo']],
  ['justeat', 'Just Eat', 'Comida', 'brand', ['just-eat.es'], ['just eat', 'justeat']],
  ['ubereats', 'Uber Eats', 'Comida', 'brand', ['ubereats.com'], ['uber eats', 'ubereats']],
  ['rodilla', 'Rodilla', 'Comida', 'brand', ['rodilla.es'], ['rodilla']],
  ['ginos', 'Ginos', 'Comida', 'brand', ['ginos.es'], ['ginos']],
  ['tacobell', 'Taco Bell', 'Comida', 'brand', ['tacobell.com', 'tacobell.es'], ['taco bell', 'tacobell']],
  ['fiveguys', 'Five Guys', 'Comida', 'brand', ['fiveguys.es', 'fiveguys.com'], ['five guys', 'fiveguys']],
  ['amazon', 'Amazon', 'Tiendas', 'brand', ['amazon.es'], ['amazon']],
  ['zara', 'Zara', 'Tiendas', 'brand', ['zara.com'], ['zara']],
  ['nike', 'Nike', 'Tiendas', 'brand', ['nike.com'], ['nike']],
  ['adidas', 'Adidas', 'Tiendas', 'brand', ['adidas.com', 'adidas.es'], ['adidas']],
  ['ikea', 'IKEA', 'Tiendas', 'brand', ['ikea.com'], ['ikea']],
  ['corteingles', 'El Corte Inglés', 'Tiendas', 'brand', ['elcorteingles.es'], ['el corte ingles', 'corte ingles']],
  ['mercadona', 'Mercadona', 'Tiendas', 'brand', ['mercadona.es'], ['mercadona']],
  ['mediamarkt', 'MediaMarkt', 'Tiendas', 'brand', ['mediamarkt.es'], ['mediamarkt', 'media markt']],
  ['apple', 'Apple', 'Tiendas', 'brand', ['apple.com'], ['apple']],
  ['samsung', 'Samsung', 'Tiendas', 'brand', ['samsung.com'], ['samsung']],
  ['decathlon', 'Decathlon', 'Tiendas', 'brand', ['decathlon.es'], ['decathlon']],
  ['primark', 'Primark', 'Tiendas', 'brand', ['primark.com'], ['primark']],
  ['hm', 'H&M', 'Tiendas', 'brand', ['hm.com'], ['hm', 'h m', 'h and m']],
  ['mango', 'Mango', 'Tiendas', 'brand', ['mango.com'], ['mango']],
  ['shein', 'SHEIN', 'Tiendas', 'brand', ['shein.com'], ['shein']],
  ['zalando', 'Zalando', 'Tiendas', 'brand', ['zalando.es'], ['zalando']],
  ['fnac', 'Fnac', 'Tiendas', 'brand', ['fnac.es'], ['fnac']],
  ['leroymerlin', 'Leroy Merlin', 'Tiendas', 'brand', ['leroymerlin.es'], ['leroy merlin', 'leroymerlin']],
  ['carrefour', 'Carrefour', 'Tiendas', 'brand', ['carrefour.com', 'carrefour.es'], ['carrefour']],
  ['lidl', 'Lidl', 'Tiendas', 'brand', ['lidl.es'], ['lidl']],
  ['aliexpress', 'AliExpress', 'Tiendas', 'brand', ['aliexpress.com'], ['aliexpress', 'ali express']],
  ['temu', 'Temu', 'Tiendas', 'brand', ['temu.com'], ['temu']],
  ['netflix', 'Netflix', 'Suscripciones', 'brand', ['netflix.com'], ['netflix']],
  ['spotify', 'Spotify', 'Suscripciones', 'brand', ['spotify.com'], ['spotify']],
  ['disney', 'Disney+', 'Suscripciones', 'brand', ['disneyplus.com'], ['disney', 'disney plus', 'disney+']],
  ['max', 'Max', 'Suscripciones', 'brand', ['max.com'], ['max', 'hbo', 'hbo max']],
  ['youtube', 'YouTube', 'Suscripciones', 'brand', ['youtube.com'], ['youtube', 'youtube premium']],
  ['dazn', 'DAZN', 'Suscripciones', 'brand', ['dazn.com'], ['dazn']],
  ['movistar', 'Movistar', 'Suscripciones', 'brand', ['movistar.es'], ['movistar']],
  ['orange', 'Orange', 'Suscripciones', 'brand', ['orange.com', 'orange.es'], ['orange']],
  ['vodafone', 'Vodafone', 'Suscripciones', 'brand', ['vodafone.es'], ['vodafone']],
  ['digi', 'Digi', 'Suscripciones', 'brand', ['digimobil.es'], ['digi', 'digi mobil']],
  ['restaurante', 'Restaurante', 'Comida', 'category', [], ['restaurante', 'restarante', 'restaruante', 'restaurant']],
  ['bar', 'Bar', 'Comida', 'category', [], ['bar', 'cafeteria', 'cafetería', 'cafe', 'comida']],
  ['reloj', 'Reloj', 'Relojes', 'category', [], ['reloj', 'relojes']],
  ['joya', 'Joya', 'Joyería', 'category', [], ['joya', 'joyas', 'anillo', 'collar', 'pulsera']],
  ['juego', 'Juego', 'Juegos', 'category', [], ['juego', 'juegos', 'skin', 'skins']],
];

const specials = {
  restaurante: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#C2410C"/>
  <circle cx="70" cy="68" r="24" fill="none" stroke="#FFFFFF" stroke-width="6"/>
  <circle cx="70" cy="68" r="8" fill="#FFFFFF"/>
  <path d="M34 36 V92 M28 36 V52 C28 58 40 58 40 52 V36 M40 36 V52" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
</svg>
`,
  bar: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#9A3412"/>
  <path d="M36 40 H92 L80 72 H48 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round"/>
  <path d="M64 72 V96 M48 96 H80" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
</svg>
`,
  reloj: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#0F172A"/>
  <circle cx="64" cy="64" r="30" fill="none" stroke="#F8FAFC" stroke-width="6"/>
  <path d="M64 64 L64 44 M64 64 L80 72" fill="none" stroke="#F8FAFC" stroke-width="5" stroke-linecap="round"/>
</svg>
`,
  joya: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#6D28D9"/>
  <path d="M64 30 L96 52 L64 100 L32 52 Z" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round"/>
  <path d="M32 52 H96 M48 52 L64 100 L80 52" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round"/>
</svg>
`,
  juego: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#1D4ED8"/>
  <rect x="30" y="48" width="68" height="36" rx="16" fill="none" stroke="#FFFFFF" stroke-width="6"/>
  <path d="M46 66 H62 M54 58 V74" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/>
  <circle cx="82" cy="62" r="3" fill="#FFFFFF"/>
  <circle cx="90" cy="70" r="3" fill="#FFFFFF"/>
</svg>
`,
};

function tile(mark) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#334155"/>
  <text x="64" y="70" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#FFFFFF">${mark}</text>
</svg>
`;
}

function writeAsset(id, ext, body) {
  for (const old of ['svg', 'png', 'jpg']) {
    if (old === ext) continue;
    const file = path.join(outDir, `${id}.${old}`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.writeFileSync(path.join(outDir, `${id}.${ext}`), body);
}

async function favicon(domain) {
  const response = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, {
    headers: { 'user-agent': 'Mozilla/5.0' },
  });
  if (!response.ok) return null;
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length < 180 || buf.length === 726) return null;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  const jpg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!png && !jpg) return null;
  if (png && buf.readUInt32BE(16) < 32) return null;
  return { buf, ext: jpg ? 'jpg' : 'png' };
}

async function firstIcon(domains) {
  const candidates = [];
  for (const domain of domains) {
    candidates.push(domain);
    if (!domain.startsWith('www.')) candidates.push(`www.${domain}`);
  }
  const hits = await Promise.all(candidates.map(async (domain) => {
    try {
      const hit = await favicon(domain);
      if (!hit) return null;
      const score = hit.ext === 'png' ? hit.buf.readUInt32BE(16) : 48;
      return { ...hit, score };
    } catch {
      return null;
    }
  }));
  return hits.filter(Boolean).sort((a, b) => b.score - a.score)[0] || null;
}

const brands = [];
const missing = [];
let cursor = 0;

async function worker() {
  while (cursor < rows.length) {
    const index = cursor;
    cursor += 1;
    const [id, name, group, kind, domains, aliases] = rows[index];
    let image = 'svg';
    if (specials[id]) {
      writeAsset(id, 'svg', specials[id]);
    } else if (domains.length) {
      const hit = await firstIcon(domains);
      if (hit) {
        writeAsset(id, hit.ext, hit.buf);
        image = hit.ext;
      } else {
        writeAsset(id, 'svg', tile(name.slice(0, 2).toUpperCase()));
        missing.push(name);
      }
    } else {
      writeAsset(id, 'svg', tile(name.slice(0, 2).toUpperCase()));
      missing.push(name);
    }
    brands[index] = { id, name, group, kind, image, aliases };
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));

const ts = `export interface BrandPreset {
  id: string;
  name: string;
  group: string;
  kind: 'brand' | 'category';
  image: 'svg' | 'png' | 'jpg';
  aliases: string[];
}

export const BRANDS: BrandPreset[] = ${JSON.stringify(brands, null, 2)};

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
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

const ranked = [...BRANDS].sort((a, b) => {
  if (a.kind !== b.kind) return a.kind === 'brand' ? -1 : 1;
  const longest = (item: BrandPreset) => item.aliases.reduce((max, alias) => Math.max(max, alias.length), 0);
  return longest(b) - longest(a);
});

export function findBrand(name: string | null | undefined): BrandPreset | undefined {
  const query = tokens(name || '');
  if (!query.length) return undefined;
  return ranked.find((brand) => brand.aliases.some((alias) => containsSequence(query, tokens(alias))));
}
`;

fs.writeFileSync(path.join(root, 'src', 'lib', 'brands.ts'), ts);
console.log(`marcas: ${brands.length}`);
console.log(`con icono: ${brands.filter((item) => item.image !== 'svg').length}`);
if (missing.length) console.log(`sin icono: ${missing.join(', ')}`);
