/**
 * Datos SINTÉTICOS del catálogo de Mercado para la vista previa (Bloque F.1). Solo los usa preview/app.tsx.
 * Nombres y símbolos del catálogo real (server/src/domain/catalog.ts); precios, variaciones y minigráficas
 * inventados y fijos por símbolo. No son cotizaciones ni pretenden parecerlo.
 */
type Row = [symbol: string, name: string, sub?: string];

const GROUPS: { id: string; title: string; kind: string; base: number; rows: Row[] }[] = [
  { id: 'us', title: 'Acciones de EE. UU.', kind: 'stock', base: 180, rows: [['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['GOOGL', 'Alphabet'], ['AMZN', 'Amazon'], ['META', 'Meta'], ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'], ['AMD', 'AMD'], ['NFLX', 'Netflix'], ['JPM', 'JPMorgan'], ['V', 'Visa'], ['MA', 'Mastercard'], ['BRK-B', 'Berkshire Hathaway'], ['LLY', 'Eli Lilly'], ['KO', 'Coca-Cola'], ['COST', 'Costco'], ['WMT', 'Walmart'], ['ORCL', 'Oracle'], ['DIS', 'Disney'], ['NKE', 'Nike'], ['PFE', 'Pfizer']] },
  { id: 'eu', title: 'Acciones europeas', kind: 'stock', base: 120, rows: [['ASML.AS', 'ASML'], ['MC.PA', 'LVMH'], ['SAP.DE', 'SAP'], ['SIE.DE', 'Siemens'], ['OR.PA', "L'Oréal"], ['AIR.PA', 'Airbus'], ['NOVO-B.CO', 'Novo Nordisk'], ['NESN.SW', 'Nestlé'], ['TTE.PA', 'TotalEnergies'], ['ALV.DE', 'Allianz'], ['BMW.DE', 'BMW'], ['ADYEN.AS', 'Adyen']] },
  { id: 'es', title: 'Acciones españolas', kind: 'stock', base: 14, rows: [['SAN.MC', 'Banco Santander'], ['BBVA.MC', 'BBVA'], ['ITX.MC', 'Inditex'], ['IBE.MC', 'Iberdrola'], ['TEF.MC', 'Telefónica'], ['REP.MC', 'Repsol'], ['CABK.MC', 'CaixaBank'], ['AENA.MC', 'Aena'], ['FER.MC', 'Ferrovial'], ['AMS.MC', 'Amadeus'], ['ELE.MC', 'Endesa'], ['IAG.MC', 'IAG'], ['SAB.MC', 'Banco Sabadell'], ['CLNX.MC', 'Cellnex'], ['IDR.MC', 'Indra'], ['PUIG.MC', 'Puig']] },
  { id: 'asia', title: 'Acciones asiáticas', kind: 'stock', base: 60, rows: [['7203.T', 'Toyota'], ['6758.T', 'Sony'], ['0700.HK', 'Tencent'], ['9988.HK', 'Alibaba'], ['005930.KS', 'Samsung Electronics'], ['TSM', 'TSMC (ADR)'], ['INFY.NS', 'Infosys']] },
  { id: 'etf', title: 'ETF', kind: 'etf', base: 90, rows: [['VWCE.DE', 'Vanguard FTSE All-World'], ['IWDA.AS', 'iShares Core MSCI World'], ['SXR8.DE', 'iShares Core S&P 500'], ['EQAC.DE', 'Invesco Nasdaq-100'], ['IS3N.DE', 'iShares Core MSCI EM IMI'], ['EXSA.DE', 'iShares STOXX Europe 600'], ['VHYL.AS', 'Vanguard FTSE All-World High Dividend'], ['SPY', 'SPDR S&P 500 (EE. UU.)'], ['QQQ', 'Invesco QQQ (EE. UU.)']] },
  { id: 'index', title: 'Índices', kind: 'index', base: 9_000, rows: [['^IBEX', 'IBEX 35', 'Europa'], ['^STOXX50E', 'Euro Stoxx 50', 'Europa'], ['^GDAXI', 'DAX', 'Europa'], ['^FCHI', 'CAC 40', 'Europa'], ['^GSPC', 'S&P 500', 'América'], ['^IXIC', 'Nasdaq Composite', 'América'], ['^DJI', 'Dow Jones', 'América'], ['^N225', 'Nikkei 225', 'Asia'], ['^HSI', 'Hang Seng', 'Asia']] },
  { id: 'commodity', title: 'Materias primas', kind: 'commodity', base: 60, rows: [['GC=F', 'Oro', 'Metales'], ['SI=F', 'Plata', 'Metales'], ['PL=F', 'Platino', 'Metales'], ['HG=F', 'Cobre', 'Metales'], ['BZ=F', 'Petróleo Brent', 'Energía'], ['CL=F', 'Petróleo WTI', 'Energía'], ['NG=F', 'Gas natural', 'Energía'], ['ZW=F', 'Trigo', 'Agrícolas'], ['KC=F', 'Café', 'Agrícolas'], ['CC=F', 'Cacao', 'Agrícolas']] },
  { id: 'fx', title: 'Divisas', kind: 'fx', base: 1.1, rows: [['EURUSD=X', 'Euro / Dólar'], ['EURGBP=X', 'Euro / Libra'], ['EURJPY=X', 'Euro / Yen'], ['EURCHF=X', 'Euro / Franco suizo'], ['GBPUSD=X', 'Libra / Dólar']] },
  { id: 'bond', title: 'Bonos', kind: 'bond', base: 4, rows: [['^IRX', 'Letra EE. UU. 13 semanas', 'Rentabilidad'], ['^FVX', 'Bono EE. UU. 5 años', 'Rentabilidad'], ['^TNX', 'Bono EE. UU. 10 años', 'Rentabilidad'], ['^TYX', 'Bono EE. UU. 30 años', 'Rentabilidad']] },
  { id: 'reit', title: 'Inmobiliario cotizado (REIT)', kind: 'reit', base: 70, rows: [['O', 'Realty Income'], ['PLD', 'Prologis'], ['AMT', 'American Tower'], ['EQIX', 'Equinix'], ['MRL.MC', 'Merlin Properties'], ['COL.MC', 'Inmobiliaria Colonial'], ['VNA.DE', 'Vonovia']] },
];

const COINS: [string, string, string][] = [
  ['bitcoin', 'Bitcoin', 'BTC'], ['ethereum', 'Ethereum', 'ETH'], ['tether', 'Tether', 'USDT'], ['solana', 'Solana', 'SOL'], ['binancecoin', 'BNB', 'BNB'],
  ['ripple', 'XRP', 'XRP'], ['usd-coin', 'USDC', 'USDC'], ['cardano', 'Cardano', 'ADA'], ['dogecoin', 'Dogecoin', 'DOGE'], ['tron', 'TRON', 'TRX'],
  ['avalanche-2', 'Avalanche', 'AVAX'], ['chainlink', 'Chainlink', 'LINK'], ['polkadot', 'Polkadot', 'DOT'], ['litecoin', 'Litecoin', 'LTC'],
  ['stellar', 'Stellar', 'XLM'], ['uniswap', 'Uniswap', 'UNI'], ['cosmos', 'Cosmos', 'ATOM'], ['near', 'NEAR Protocol', 'NEAR'],
];

const hash = (text: string) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
function rand(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Precios de los datos sintéticos del Bloque B, para que lista, Siguiendo y detalle digan lo mismo. */
const KNOWN: Record<string, number> = {
  AAPL: 218.18, MSFT: 398.5, NVDA: 121.3, AMZN: 171.9, TSLA: 212.4, GOOGL: 157.2, 'ASML.AS': 682.1, 'ITX.MC': 48.7, 'SAN.MC': 4.61, 'IBE.MC': 13.42,
  'IWDA.AS': 101.42, 'VWCE.DE': 124.8, bitcoin: 78_362, ethereum: 2_647.1, solana: 152.4, ripple: 0.58, cardano: 0.41, polkadot: 5.92, chainlink: 13.8, litecoin: 71.2,
};

/** Precio, variación y minigráfica sintéticos y fijos por símbolo (cada uno con su propia forma). */
function synth(symbol: string, base: number) {
  const r = rand(hash(symbol));
  const drawn = Math.round(base * (0.3 + r() * 1.8) * 10_000) / 10_000;
  const price = KNOWN[symbol] ?? drawn;
  const pct = Math.round((r() - 0.47) * 900) / 100;
  const spark: number[] = [];
  let value = price;
  for (let i = 0; i < 42; i += 1) {
    spark.push(value);
    value = value / (1 + (r() - 0.5) * 0.03 + pct / 4200);
  }
  return { price, pct, spark: spark.reverse() };
}

function item(group: { kind: string; base: number }, key: string, symbol: string, name: string, sub: string | undefined, fetchedAt: string) {
  const s = synth(key.startsWith('coingecko:') ? key.slice(10) : symbol, group.base);
  return {
    key, kind: group.kind, name, symbol, image: null, sourceLabel: 'Datos sintéticos', priceEur: s.price, changePct: s.pct, changeLabel: group.kind === 'crypto' ? '24 h' : 'hoy',
    sparkline: s.spark, fetchedAt, stale: false, error: null, ...(sub ? { sub } : {}),
  };
}

const firstSeen = new Map<string, number>();

/** GET /api/market/catalog?group=… — la primera vez simula que el servidor aún está cotizando la categoría. */
export function previewCatalogPage(id: string) {
  const fetchedAt = new Date(Date.now() - 50_000).toISOString();
  if (id === 'crypto') {
    const items = COINS.map(([cg, name, symbol]) => item({ kind: 'crypto', base: 120 }, `coingecko:${cg}`, symbol, name, undefined, fetchedAt));
    return { id, title: 'Cripto', kind: 'crypto', total: items.length, loading: false, updatedAt: fetchedAt, items };
  }
  const group = GROUPS.find((row) => row.id === id);
  if (!group) return { id, title: id, kind: id, total: 0, loading: false, updatedAt: null, items: [] };
  const seen = firstSeen.get(id) ?? Date.now();
  firstSeen.set(id, seen);
  const settled = Date.now() - seen > 2_000;
  const rows = settled ? group.rows : group.rows.slice(0, Math.ceil(group.rows.length / 2));
  const items = rows.map(([symbol, name, sub]) => item(group, `yahoo:${symbol}`, symbol, name, sub, fetchedAt));
  return { id, title: group.title, kind: group.kind, total: group.rows.length, loading: !settled, updatedAt: fetchedAt, items };
}

/** GET /api/market/catalog-index */
export function previewCatalogIndex() {
  return {
    entries: [
      ...COINS.map(([cg, name, symbol]) => ({ key: `coingecko:${cg}`, group: 'crypto', kind: 'crypto', symbol, name, sub: null, image: null })),
      ...GROUPS.flatMap((group) => group.rows.map(([symbol, name, sub]) => ({ key: `yahoo:${symbol}`, group: group.id, kind: group.kind, symbol, name, sub: sub || null, image: null }))),
    ],
  };
}

/** Campo `catalog` del tablero: categorías y mayores movimientos (solo bolsa del catálogo y cripto). */
export function previewCatalogOverview() {
  const fetchedAt = new Date(Date.now() - 50_000).toISOString();
  const groups = GROUPS.map((group) => {
    const rows = group.rows.map(([symbol, name]) => ({ symbol, name, pct: synth(symbol, group.base).pct }));
    const lead = [...rows].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
    return { id: group.id, title: group.title, kind: group.kind, total: group.rows.length, priced: group.rows.length, lead: { symbol: lead.symbol, name: lead.name, changePct: lead.pct } };
  });
  const coins = COINS.map(([cg, name, symbol]) => item({ kind: 'crypto', base: 120 }, `coingecko:${cg}`, symbol, name, undefined, fetchedAt));
  const coinLead = [...coins].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
  groups.unshift({ id: 'crypto', title: 'Cripto', kind: 'crypto', total: coins.length, priced: coins.length, lead: { symbol: coinLead.symbol, name: coinLead.name, changePct: coinLead.changePct } });
  const stocks = GROUPS.filter((group) => group.kind === 'stock').flatMap((group) => group.rows.map(([symbol, name]) => item(group, `yahoo:${symbol}`, symbol, name, group.title, fetchedAt)));
  const pick = (rows: ReturnType<typeof item>[]) => ({
    up: rows.filter((row) => row.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 5),
    down: rows.filter((row) => row.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 5),
  });
  return { groups, movers: { bolsa: pick(stocks), cripto: pick(coins) } };
}

/** Precio sintético de un valor del catálogo (para que la gráfica del detalle acabe en el precio de la lista). */
export function previewPrice(key: string): number | null {
  if (key.startsWith('coingecko:')) return synth(key.slice(10), 120).price;
  const symbol = key.replace(/^yahoo:/, '');
  const group = GROUPS.find((row) => row.rows.some(([s]) => s === symbol));
  return group ? synth(symbol, group.base).price : null;
}

/** Un valor del catálogo sintético por su clave (para la estrella de la vista previa). */
export function previewCatalogItem(key: string) {
  const fetchedAt = new Date(Date.now() - 50_000).toISOString();
  if (key.startsWith('coingecko:')) {
    const coin = COINS.find(([cg]) => `coingecko:${cg}` === key);
    return coin ? item({ kind: 'crypto', base: 120 }, key, coin[2], coin[1], undefined, fetchedAt) : null;
  }
  const symbol = key.replace(/^yahoo:/, '');
  for (const group of GROUPS) {
    const row = group.rows.find(([s]) => s === symbol);
    if (row) return item(group, key, row[0], row[1], row[2], fetchedAt);
  }
  return null;
}
