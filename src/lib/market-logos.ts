/**
 * Logos de Mercado (Bloque F.1). Cadena, de mejor a peor:
 *   1. imagen del proveedor (CoinGecko manda la de cada cripto)
 *   2. icono de cripto guardado en la app (public/logos/crypto, CC0)
 *   3. logo de marca local de Balance (public/brands)
 *   4. logo por símbolo (servicio público que ya usaba Mercado)
 *   5. trazado de Simple Icons guardado en la app con el color de la marca (public/logos/brands, CC0)
 *   6. icono del dominio de la empresa (el mismo servicio que usa scripts/build-brands.mjs)
 * Índices, divisas y bonos llevan bandera (public/logos/flags, MIT); materias primas, un icono propio.
 * Las iniciales quedan solo si todo lo anterior falla.
 */

/** Dominio de cada empresa del catálogo (y de la gestora en los ETF). */
const DOMAINS: Record<string, string> = {
  // EE. UU.
  AAPL: 'apple.com', MSFT: 'microsoft.com', NVDA: 'nvidia.com', GOOGL: 'google.com', AMZN: 'amazon.com', META: 'meta.com', TSLA: 'tesla.com',
  AVGO: 'broadcom.com', AMD: 'amd.com', NFLX: 'netflix.com', JPM: 'jpmorganchase.com', V: 'visa.com', MA: 'mastercard.com',
  'BRK-B': 'berkshirehathaway.com', LLY: 'lilly.com', UNH: 'unitedhealthgroup.com', XOM: 'exxonmobil.com', KO: 'coca-colacompany.com',
  PEP: 'pepsico.com', COST: 'costco.com', WMT: 'walmart.com', ORCL: 'oracle.com', CRM: 'salesforce.com', ADBE: 'adobe.com', INTC: 'intel.com',
  QCOM: 'qualcomm.com', DIS: 'disney.com', NKE: 'nike.com', BA: 'boeing.com', PFE: 'pfizer.com',
  // Europa
  'ASML.AS': 'asml.com', 'MC.PA': 'lvmh.com', 'SAP.DE': 'sap.com', 'SIE.DE': 'siemens.com', 'OR.PA': 'loreal.com', 'AIR.PA': 'airbus.com',
  'NOVO-B.CO': 'novonordisk.com', 'NESN.SW': 'nestle.com', 'ROG.SW': 'roche.com', 'TTE.PA': 'totalenergies.com', 'SAN.PA': 'sanofi.com',
  'ALV.DE': 'allianz.com', 'DTE.DE': 'telekom.com', 'BMW.DE': 'bmw.com', 'VOW3.DE': 'volkswagen-group.com', 'ADYEN.AS': 'adyen.com',
  'UNA.AS': 'unilever.com', 'SHELL.AS': 'shell.com', AZN: 'astrazeneca.com', HSBC: 'hsbc.com', 'RMS.PA': 'hermes.com', 'BNP.PA': 'bnpparibas.com',
  'ENEL.MI': 'enel.com', 'ISP.MI': 'intesasanpaolo.com',
  // España
  'SAN.MC': 'santander.com', 'BBVA.MC': 'bbva.com', 'ITX.MC': 'inditex.com', 'IBE.MC': 'iberdrola.com', 'TEF.MC': 'telefonica.com',
  'REP.MC': 'repsol.com', 'CABK.MC': 'caixabank.com', 'AENA.MC': 'aena.es', 'FER.MC': 'ferrovial.com', 'AMS.MC': 'amadeus.com',
  'ELE.MC': 'endesa.com', 'NTGY.MC': 'naturgy.com', 'ACS.MC': 'grupoacs.com', 'GRF.MC': 'grifols.com', 'IAG.MC': 'iairgroup.com',
  'MAP.MC': 'mapfre.com', 'SAB.MC': 'bancsabadell.com', 'BKT.MC': 'bankinter.com', 'ENG.MC': 'enagas.es', 'RED.MC': 'redeia.com',
  'CLNX.MC': 'cellnex.com', 'ACX.MC': 'acerinox.com', 'IDR.MC': 'indracompany.com', 'LOG.MC': 'logista.com', 'SLR.MC': 'solariaenergia.com',
  'ANA.MC': 'acciona.com', 'MTS.MC': 'arcelormittal.com', 'FDR.MC': 'fluidra.com', 'ROVI.MC': 'rovi.es', 'PUIG.MC': 'puig.com',
  // Asia
  '7203.T': 'toyota-global.com', '6758.T': 'sony.com', '9984.T': 'group.softbank', '6861.T': 'keyence.com', '8306.T': 'mufg.jp',
  '0700.HK': 'tencent.com', '9988.HK': 'alibabagroup.com', '1299.HK': 'aia.com', '3690.HK': 'meituan.com', '005930.KS': 'samsung.com',
  TSM: 'tsmc.com', 'RELIANCE.NS': 'ril.com', 'INFY.NS': 'infosys.com',
  // Inmobiliario cotizado
  O: 'realtyincome.com', PLD: 'prologis.com', AMT: 'americantower.com', EQIX: 'equinix.com', SPG: 'simon.com', PSA: 'publicstorage.com',
  WELL: 'welltower.com', DLR: 'digitalrealty.com', 'MRL.MC': 'merlinproperties.com', 'COL.MC': 'inmocolonial.com', 'VNA.DE': 'vonovia.com',
  // ETF: la gestora
  'VWCE.DE': 'vanguard.com', 'IWDA.AS': 'ishares.com', 'EUNL.DE': 'ishares.com', 'SXR8.DE': 'ishares.com', 'CSPX.L': 'ishares.com',
  'VUSA.DE': 'vanguard.com', 'QDVE.DE': 'ishares.com', 'EQAC.DE': 'invesco.com', 'SXRV.DE': 'ishares.com', 'IS3N.DE': 'ishares.com',
  'EXSA.DE': 'ishares.com', 'IUSN.DE': 'ishares.com', 'VHYL.AS': 'vanguard.com', SPY: 'ssga.com', QQQ: 'invesco.com', VOO: 'vanguard.com',
  VTI: 'vanguard.com',
};

/** Marcas con trazado de Simple Icons guardado en public/logos/brands. */
const SIMPLE: Record<string, string> = {
  NVDA: 'nvidia', GOOGL: 'google', META: 'meta', TSLA: 'tesla', AVGO: 'broadcom', AMD: 'amd', NFLX: 'netflix', V: 'visa', MA: 'mastercard',
  KO: 'cocacola', INTC: 'intel', QCOM: 'qualcomm', NKE: 'nike', BA: 'boeing', 'SAP.DE': 'sap', 'SIE.DE': 'siemens', 'AIR.PA': 'airbus',
  'BMW.DE': 'bmw', 'VOW3.DE': 'volkswagen', 'ADYEN.AS': 'adyen', 'UNA.AS': 'unilever', 'SHELL.AS': 'shell', HSBC: 'hsbc', 'RMS.PA': 'hermes',
  'CABK.MC': 'caixabank', 'TEF.MC': 'telefonica', '7203.T': 'toyota', '6758.T': 'sony', '005930.KS': 'samsung', '9988.HK': 'alibabadotcom',
  '3690.HK': 'meituan', 'INFY.NS': 'infosys', 'DTE.DE': 'deutschetelekom',
};

/** País de cada índice (bandera). */
const INDEX_FLAG: Record<string, string> = {
  '^IBEX': 'es', '^STOXX50E': 'eu', '^GDAXI': 'de', '^FCHI': 'fr', '^FTSE': 'gb', 'FTSEMIB.MI': 'it', '^AEX': 'nl', '^SSMI': 'ch',
  '^GSPC': 'us', '^IXIC': 'us', '^DJI': 'us', '^RUT': 'us', '^VIX': 'us', '^NDX': 'us', '^N225': 'jp', '^HSI': 'hk', '000001.SS': 'cn',
  '^NSEI': 'in', '^KS11': 'kr',
};

const CURRENCY_FLAG: Record<string, string> = { EUR: 'eu', USD: 'us', GBP: 'gb', JPY: 'jp', CHF: 'ch', CNY: 'cn', MXN: 'mx' };

/** Símbolo del proveedor (sin «yahoo:») a partir de la clave de cotización o del símbolo. */
export function providerSymbol(key: string | undefined, symbol: string): string {
  if (key?.startsWith('yahoo:')) return key.slice(6);
  return symbol;
}

/** Banderas de un índice, una divisa (par) o un bono; vacío si no aplica. */
export function flagsFor(kind: string, symbol: string): string[] {
  if (kind === 'index') return INDEX_FLAG[symbol] ? [INDEX_FLAG[symbol]] : [];
  if (kind === 'bond') return ['us'];
  if (kind === 'fx' && symbol.endsWith('=X')) {
    const pair = symbol.slice(0, -2);
    const a = CURRENCY_FLAG[pair.slice(0, 3)];
    const b = CURRENCY_FLAG[pair.slice(3, 6)];
    return a && b ? [a, b] : [];
  }
  return [];
}

export type CommodityId = 'gold' | 'silver' | 'platinum' | 'palladium' | 'copper' | 'oil' | 'gas' | 'wheat' | 'corn' | 'soy' | 'coffee' | 'cocoa' | 'sugar';

const COMMODITY: Record<string, CommodityId> = {
  'GC=F': 'gold', 'SI=F': 'silver', 'PL=F': 'platinum', 'PA=F': 'palladium', 'HG=F': 'copper', 'BZ=F': 'oil', 'CL=F': 'oil', 'NG=F': 'gas',
  'ZW=F': 'wheat', 'ZC=F': 'corn', 'ZS=F': 'soy', 'KC=F': 'coffee', 'CC=F': 'cocoa', 'SB=F': 'sugar',
};

/** Materia prima de un activo (por su símbolo, o por el tipo del tablero anterior: oro, plata, petróleo, cobre). */
export function commodityOf(kind: string, symbol: string): CommodityId | null {
  if (kind === 'gold') return 'gold';
  if (kind === 'silver') return 'silver';
  if (kind === 'oil') return 'oil';
  if (kind === 'copper') return 'copper';
  if (kind === 'commodity') return COMMODITY[symbol] ?? null;
  return null;
}

/** Imágenes candidatas en orden; el componente pasa a la siguiente si una no carga. */
export function logoSources(input: { image: string | null; fallback?: string | null; local?: string | null; kind: string; key?: string; symbol: string }): string[] {
  const symbol = providerSymbol(input.key, input.symbol);
  const out: (string | null | undefined)[] = [input.image, input.fallback];
  if (input.kind === 'crypto') out.push(`/logos/crypto/${input.symbol.toLowerCase()}.svg`);
  out.push(input.local);
  const equity = input.kind === 'stock' || input.kind === 'etf' || input.kind === 'reit';
  if (equity) {
    out.push(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol.toUpperCase())}.png`);
    if (SIMPLE[symbol]) out.push(`/logos/brands/${SIMPLE[symbol]}.svg`);
    if (DOMAINS[symbol]) out.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(DOMAINS[symbol])}&sz=128`);
  }
  return [...new Set(out.filter((src): src is string => Boolean(src)))];
}
