import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'platforms');
fs.mkdirSync(outDir, { recursive: true });

const hints = {
  bank: 'El saldo es el dinero de la cuenta.',
  broker: 'El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos.',
  exchange: 'El saldo es el efectivo. Cada criptomoneda se registra como activo.',
  wallet: 'Solo la dirección pública. Nunca la frase semilla ni la clave privada.',
  cash: 'Dinero en metálico.',
  other: 'El saldo es el valor actual que tú indicas.',
};

const extraHint = {
  indexa: 'Suele bastar el valor total de la cartera. Si más adelante separas los fondos, cambia el seguimiento.',
  finizens: 'Suele bastar el valor total de la cartera. Si más adelante separas los fondos, cambia el seguimiento.',
  inbestme: 'Suele bastar el valor total de la cartera. Si más adelante separas los fondos, cambia el seguimiento.',
  pension: 'Escribe el valor actual del plan. No es una cotización automática.',
  vivienda: 'Escribe el valor que le das ahora. El precio de compra no se usa como valor de mercado.',
  oro: 'Escribe el valor actual. El coste de compra queda en los movimientos, no como precio.',
  urbanitae: 'Escribe el valor actual de tus participaciones. No es una cotización automática.',
  otra: 'Si no está en la lista, pon el nombre de la plataforma. Seguirá apareciendo con tus iniciales.',
};

/** id, nombre, grupo, tipo, seguimiento, fondo, texto, marca, dominios para el icono */
const rows = [
  ['caixabank', 'CaixaBank', 'Banca', 'bank', 'balance', '#007EAE', '#FFFFFF', 'CX', ['caixabank.com', 'caixabank.es']],
  ['santander', 'Santander', 'Banca', 'bank', 'balance', '#EC0000', '#FFFFFF', 'SAN', ['bancosantander.es', 'santander.com']],
  ['bbva', 'BBVA', 'Banca', 'bank', 'balance', '#004481', '#FFFFFF', 'BBVA', ['bbva.es', 'bbva.com']],
  ['sabadell', 'Sabadell', 'Banca', 'bank', 'balance', '#0098D8', '#FFFFFF', 'SAB', ['bancsabadell.com']],
  ['unicaja', 'Unicaja', 'Banca', 'bank', 'balance', '#007A33', '#FFFFFF', 'UNI', ['unicajabanco.es', 'unicaja.es']],
  ['cajamar', 'Cajamar', 'Banca', 'bank', 'balance', '#00A651', '#FFFFFF', 'CAJ', ['grupocajamar.es', 'cajamar.es']],
  ['ibercaja', 'Ibercaja', 'Banca', 'bank', 'balance', '#E30613', '#FFFFFF', 'IBE', ['ibercaja.es']],
  ['kutxabank', 'Kutxabank', 'Banca', 'bank', 'balance', '#F15A22', '#FFFFFF', 'KB', ['kutxabank.es']],
  ['abanca', 'Abanca', 'Banca', 'bank', 'balance', '#C8102E', '#FFFFFF', 'ABA', ['abanca.com']],
  ['bankinter', 'Bankinter', 'Banca', 'bank', 'balance', '#FF6600', '#FFFFFF', 'BKT', ['bankinter.com']],
  ['ing', 'ING', 'Banca', 'bank', 'balance', '#FF6200', '#FFFFFF', 'ING', ['ing.es', 'ing.com']],
  ['openbank', 'Openbank', 'Banca', 'bank', 'balance', '#111111', '#2EE6C7', 'OB', ['openbank.es']],
  ['imagin', 'imagin', 'Banca', 'bank', 'balance', '#6D28D9', '#FFFFFF', 'im', ['imagin.com']],
  ['evo', 'EVO Banco', 'Banca', 'bank', 'balance', '#4C1D95', '#D9F99D', 'EVO', ['evo.es', 'evobanco.com']],
  ['revolut', 'Revolut', 'Banca', 'bank', 'balance', '#191C1F', '#FFFFFF', 'R', ['revolut.com']],
  ['n26', 'N26', 'Banca', 'bank', 'balance', '#111111', '#3DDC97', 'N26', ['n26.com']],
  ['wise', 'Wise', 'Banca', 'bank', 'balance', '#9FE870', '#163300', 'W', ['wise.com']],
  ['raisin', 'Raisin', 'Banca', 'bank', 'balance', '#163A70', '#FFFFFF', 'RAI', ['raisin.es', 'raisin.com']],
  ['norwegian', 'Bank Norwegian', 'Banca', 'bank', 'balance', '#D7282F', '#FFFFFF', 'BN', ['banknorwegian.com']],
  ['triodos', 'Triodos', 'Banca', 'bank', 'balance', '#006341', '#FFFFFF', 'TRI', ['triodos.es', 'triodos.com']],
  ['deutsche', 'Deutsche Bank', 'Banca', 'bank', 'balance', '#0018A8', '#FFFFFF', 'DB', ['deutsche-bank.es', 'db.com']],
  ['pibank', 'Pibank', 'Banca', 'bank', 'balance', '#6D28D9', '#FFFFFF', 'PI', ['pibank.es']],
  ['bunq', 'bunq', 'Banca', 'bank', 'balance', '#1A1A1A', '#FFFFFF', 'bq', ['bunq.com']],
  ['vivid', 'Vivid', 'Banca', 'bank', 'balance', '#111111', '#C8F542', 'VI', ['vivid.money']],
  ['nickel', 'Nickel', 'Banca', 'bank', 'balance', '#FF5A00', '#FFFFFF', 'NI', ['nickel.eu']],
  ['laboral', 'Laboral Kutxa', 'Banca', 'bank', 'balance', '#E30613', '#FFFFFF', 'LK', ['laboralkutxa.com']],
  ['march', 'Banca March', 'Banca', 'bank', 'balance', '#0B2545', '#FFFFFF', 'BM', ['bancamarch.es']],
  ['rural', 'Caja Rural', 'Banca', 'bank', 'balance', '#009639', '#FFFFFF', 'CR', ['ruralvia.com', 'cajarural.es']],
  ['andbank', 'Andbank', 'Banca', 'bank', 'balance', '#8A1538', '#FFFFFF', 'AND', ['andbank.es', 'andbank.com']],
  ['mediolanum', 'Mediolanum', 'Banca', 'bank', 'balance', '#003DA5', '#FFFFFF', 'MED', ['bancomediolanum.es']],
  ['ebn', 'EBN Banco', 'Banca', 'bank', 'balance', '#0F172A', '#E8B931', 'EBN', ['ebnbanco.com']],
  ['wizink', 'WiZink', 'Banca', 'bank', 'balance', '#6B2D8B', '#FFFFFF', 'WZ', ['wizink.es']],
  ['renault', 'Renault Bank', 'Banca', 'bank', 'balance', '#F4C400', '#111111', 'RB', ['renaultbank.es']],
  ['bff', 'BFF Bank', 'Banca', 'bank', 'balance', '#E10600', '#FFFFFF', 'BFF', ['bff.com']],
  ['qonto', 'Qonto', 'Banca', 'bank', 'balance', '#5B4DFF', '#FFFFFF', 'QO', ['qonto.com']],
  ['traderepublic', 'Trade Republic', 'Inversión', 'broker', 'positions', '#111111', '#FFFFFF', 'TR', ['traderepublic.com']],
  ['myinvestor', 'MyInvestor', 'Inversión', 'broker', 'positions', '#5B21B6', '#FFFFFF', 'MI', ['myinvestor.es']],
  ['indexa', 'Indexa Capital', 'Inversión', 'broker', 'balance', '#1D4ED8', '#FFFFFF', 'INX', ['indexacapital.com']],
  ['xtb', 'XTB', 'Inversión', 'broker', 'positions', '#111111', '#FF3B30', 'XTB', ['xtb.com']],
  ['degiro', 'DEGIRO', 'Inversión', 'broker', 'positions', '#0A4C9A', '#FFFFFF', 'DG', ['degiro.com', 'degiro.es']],
  ['ibkr', 'Interactive Brokers', 'Inversión', 'broker', 'positions', '#C41230', '#FFFFFF', 'IB', ['interactivebrokers.com']],
  ['etoro', 'eToro', 'Inversión', 'broker', 'positions', '#69B52D', '#FFFFFF', 'eT', ['etoro.com']],
  ['freedom', 'Freedom24', 'Inversión', 'broker', 'positions', '#1A56DB', '#FFFFFF', 'F24', ['freedom24.com']],
  ['scalable', 'Scalable Capital', 'Inversión', 'broker', 'positions', '#0F172A', '#2EE6A6', 'SC', ['scalable.capital']],
  ['trading212', 'Trading 212', 'Inversión', 'broker', 'positions', '#111111', '#00E676', '212', ['trading212.com']],
  ['lightyear', 'Lightyear', 'Inversión', 'broker', 'positions', '#4F46E5', '#FFFFFF', 'LY', ['lightyear.com']],
  ['renta4', 'Renta 4', 'Inversión', 'broker', 'positions', '#0B2545', '#E8B931', 'R4', ['renta4.com', 'renta4banco.com']],
  ['finizens', 'Finizens', 'Inversión', 'broker', 'balance', '#0F766E', '#FFFFFF', 'FIN', ['finizens.com']],
  ['singular', 'Singular Bank', 'Inversión', 'broker', 'positions', '#0B1F3A', '#E6C27A', 'SB', ['singularbank.es']],
  ['inbestme', 'InbestMe', 'Inversión', 'broker', 'balance', '#0E7490', '#FFFFFF', 'INB', ['inbestme.com']],
  ['popcoin', 'Popcoin', 'Inversión', 'broker', 'positions', '#111111', '#FFFFFF', 'POP', ['popcoin.es']],
  ['bitpanda', 'Bitpanda', 'Inversión', 'broker', 'positions', '#2FE3A0', '#052E24', 'BP', ['bitpanda.com']],
  ['urbanitae', 'Urbanitae', 'Inversión', 'broker', 'balance', '#111827', '#FFFFFF', 'URB', ['urbanitae.com']],
  ['mintos', 'Mintos', 'Inversión', 'broker', 'positions', '#1F6B4A', '#FFFFFF', 'MIN', ['mintos.com']],
  ['plus500', 'Plus500', 'Inversión', 'broker', 'positions', '#F47B20', '#FFFFFF', '+5', ['plus500.com']],
  ['ig', 'IG', 'Inversión', 'broker', 'positions', '#E10600', '#FFFFFF', 'IG', ['ig.com']],
  ['saxo', 'Saxo', 'Inversión', 'broker', 'positions', '#002D5A', '#FFFFFF', 'SAX', ['saxo.com', 'home.saxo']],
  ['swissquote', 'Swissquote', 'Inversión', 'broker', 'positions', '#E30613', '#FFFFFF', 'SQ', ['swissquote.com']],
  ['robinhood', 'Robinhood', 'Inversión', 'broker', 'positions', '#00C805', '#052E16', 'RH', ['robinhood.com']],
  ['freetrade', 'Freetrade', 'Inversión', 'broker', 'positions', '#6D28D9', '#FFFFFF', 'FT', ['freetrade.io', 'freetrade.com']],
  ['flatex', 'flatex', 'Inversión', 'broker', 'positions', '#FF6600', '#FFFFFF', 'FL', ['flatex.de']],
  ['comdirect', 'comdirect', 'Inversión', 'broker', 'positions', '#FFCC00', '#111111', 'CD', ['comdirect.de']],
  ['vanguard', 'Vanguard', 'Inversión', 'broker', 'positions', '#C41230', '#FFFFFF', 'VG', ['vanguard.com']],
  ['fidelity', 'Fidelity', 'Inversión', 'broker', 'positions', '#2E7D32', '#FFFFFF', 'FID', ['fidelity.com']],
  ['gvc', 'GVC Gaesco', 'Inversión', 'broker', 'positions', '#0B2545', '#E8B931', 'GVC', ['gvcgaesco.es']],
  ['heytrade', 'HeyTrade', 'Inversión', 'broker', 'positions', '#111111', '#FFFFFF', 'HT', ['heytrade.com']],
  ['binance', 'Binance', 'Cripto', 'exchange', 'positions', '#F3BA2F', '#111111', 'B', ['binance.com']],
  ['kraken', 'Kraken', 'Cripto', 'exchange', 'positions', '#5741D9', '#FFFFFF', 'KR', ['kraken.com']],
  ['coinbase', 'Coinbase', 'Cripto', 'exchange', 'positions', '#0052FF', '#FFFFFF', 'CB', ['coinbase.com']],
  ['bit2me', 'Bit2Me', 'Cripto', 'exchange', 'positions', '#1D4ED8', '#FFFFFF', 'B2M', ['bit2me.com']],
  ['cryptocom', 'Crypto.com', 'Cripto', 'exchange', 'positions', '#032B66', '#FFFFFF', 'CRO', ['crypto.com']],
  ['bybit', 'Bybit', 'Cripto', 'exchange', 'positions', '#F7A600', '#111111', 'BY', ['bybit.com']],
  ['okx', 'OKX', 'Cripto', 'exchange', 'positions', '#111111', '#FFFFFF', 'OKX', ['okx.com']],
  ['bitstamp', 'Bitstamp', 'Cripto', 'exchange', 'positions', '#00955F', '#FFFFFF', 'BS', ['bitstamp.net']],
  ['kucoin', 'KuCoin', 'Cripto', 'exchange', 'positions', '#1FAE92', '#FFFFFF', 'KC', ['kucoin.com']],
  ['bitget', 'Bitget', 'Cripto', 'exchange', 'positions', '#111111', '#2EE6C7', 'BG', ['bitget.com']],
  ['gemini', 'Gemini', 'Cripto', 'exchange', 'positions', '#07111F', '#5CE1FF', 'GEM', ['gemini.com']],
  ['bitvavo', 'Bitvavo', 'Cripto', 'exchange', 'positions', '#0057FF', '#FFFFFF', 'BTV', ['bitvavo.com']],
  ['gate', 'Gate.io', 'Cripto', 'exchange', 'positions', '#17E6A1', '#06281C', 'GT', ['gate.com', 'gate.io']],
  ['htx', 'HTX', 'Cripto', 'exchange', 'positions', '#1A4DFF', '#FFFFFF', 'HTX', ['htx.com']],
  ['mexc', 'MEXC', 'Cripto', 'exchange', 'positions', '#1B6BFF', '#FFFFFF', 'MX', ['mexc.com']],
  ['bingx', 'BingX', 'Cripto', 'exchange', 'positions', '#1F6BFF', '#FFFFFF', 'BX', ['bingx.com']],
  ['bitfinex', 'Bitfinex', 'Cripto', 'exchange', 'positions', '#163F2E', '#B6F569', 'BFX', ['bitfinex.com']],
  ['uphold', 'Uphold', 'Cripto', 'exchange', 'positions', '#1EC977', '#052E16', 'UP', ['uphold.com']],
  ['nexo', 'Nexo', 'Cripto', 'exchange', 'positions', '#1A4BFF', '#FFFFFF', 'NX', ['nexo.com']],
  ['swissborg', 'SwissBorg', 'Cripto', 'exchange', 'positions', '#00C2B8', '#042F2E', 'SBG', ['swissborg.com']],
  ['criptan', 'Criptan', 'Cripto', 'exchange', 'positions', '#5B4DFF', '#FFFFFF', 'CRI', ['criptan.com', 'criptan.io']],
  ['whitebit', 'WhiteBIT', 'Cripto', 'exchange', 'positions', '#111111', '#FFFFFF', 'WB', ['whitebit.com']],
  ['metamask', 'MetaMask', 'Wallets', 'wallet', 'positions', '#F6851B', '#FFFFFF', 'MM', ['metamask.io']],
  ['phantom', 'Phantom', 'Wallets', 'wallet', 'positions', '#AB9FF2', '#211734', 'PH', ['phantom.com', 'phantom.app']],
  ['trust', 'Trust Wallet', 'Wallets', 'wallet', 'positions', '#0500FF', '#FFFFFF', 'TW', ['trustwallet.com']],
  ['ledger', 'Ledger', 'Wallets', 'wallet', 'positions', '#111111', '#FFFFFF', 'LG', ['ledger.com']],
  ['trezor', 'Trezor', 'Wallets', 'wallet', 'positions', '#111111', '#1BB14A', 'TZ', ['trezor.io']],
  ['rabby', 'Rabby', 'Wallets', 'wallet', 'positions', '#7084FF', '#FFFFFF', 'RB', ['rabby.io']],
  ['exodus', 'Exodus', 'Wallets', 'wallet', 'positions', '#6D28D9', '#FFFFFF', 'EX', ['exodus.com']],
  ['rainbow', 'Rainbow', 'Wallets', 'wallet', 'positions', '#FF4F8B', '#FFFFFF', 'RW', ['rainbow.me']],
  ['cbwallet', 'Coinbase Wallet', 'Wallets', 'wallet', 'positions', '#0052FF', '#FFFFFF', 'CW', ['wallet.coinbase.com', 'coinbase.com']],
  ['solflare', 'Solflare', 'Wallets', 'wallet', 'positions', '#FC822B', '#111111', 'SF', ['solflare.com']],
  ['keplr', 'Keplr', 'Wallets', 'wallet', 'positions', '#1A1330', '#8B7CFF', 'KP', ['keplr.app']],
  ['safe', 'Safe', 'Wallets', 'wallet', 'positions', '#12FF80', '#06281C', 'SF', ['safe.global']],
  ['zerion', 'Zerion', 'Wallets', 'wallet', 'positions', '#2962EF', '#FFFFFF', 'ZE', ['zerion.io']],
  ['argent', 'Argent', 'Wallets', 'wallet', 'positions', '#FF875B', '#111111', 'AR', ['argent.xyz']],
  ['backpack', 'Backpack', 'Wallets', 'wallet', 'positions', '#E33E3F', '#FFFFFF', 'BP', ['backpack.app', 'backpack.exchange']],
  ['tangem', 'Tangem', 'Wallets', 'wallet', 'positions', '#111111', '#FFFFFF', 'TG', ['tangem.com']],
  ['safepal', 'SafePal', 'Wallets', 'wallet', 'positions', '#4A3AFF', '#FFFFFF', 'SP', ['safepal.com']],
  ['electrum', 'Electrum', 'Wallets', 'wallet', 'positions', '#003399', '#FFFFFF', 'EL', ['electrum.org']],
  ['atomic', 'Atomic Wallet', 'Wallets', 'wallet', 'positions', '#1F4BFF', '#FFFFFF', 'AT', ['atomicwallet.io']],
  ['onekey', 'OneKey', 'Wallets', 'wallet', 'positions', '#111111', '#44D62C', '1K', ['onekey.so']],
  ['bitbox', 'BitBox', 'Wallets', 'wallet', 'positions', '#111111', '#FFFFFF', 'BB', ['bitbox.swiss']],
  ['braavos', 'Braavos', 'Wallets', 'wallet', 'positions', '#1C1C1C', '#FFFFFF', 'BR', ['braavos.app']],
  ['uniswap', 'Uniswap Wallet', 'Wallets', 'wallet', 'positions', '#FF007A', '#FFFFFF', 'UNI', ['uniswap.org']],
  ['efectivo', 'Efectivo', 'Otros', 'cash', 'balance', '#059669', '#FFFFFF', '€', []],
  ['paypal', 'PayPal', 'Otros', 'bank', 'balance', '#003087', '#FFFFFF', 'PP', ['paypal.com']],
  ['vivienda', 'Vivienda', 'Otros', 'other', 'balance', '#0F766E', '#FFFFFF', '', []],
  ['oro', 'Oro y metales', 'Otros', 'other', 'balance', '#E8B931', '#6B4E12', 'Au', []],
  ['pension', 'Plan de pensiones', 'Otros', 'broker', 'balance', '#1E293B', '#FFFFFF', 'PP', []],
  ['otra', 'Otra', 'Otros', 'other', 'balance', '#334155', '#FFFFFF', '+', []],
];

function tile(bg, fg, mark) {
  const size = mark.length <= 1 ? 62 : mark.length === 2 ? 46 : mark.length === 3 ? 34 : 26;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="${bg}"/>
  <text x="64" y="66" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" fill="${fg}">${mark}</text>
</svg>
`;
}

const specials = {
  vivienda: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#0F766E"/>
  <path d="M28 60 L64 32 L100 60" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M36 58 V98 H92 V58" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round"/>
  <path d="M56 98 V74 H72 V98" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round"/>
</svg>
`,
  otra: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#334155"/>
  <path d="M64 40 V88 M40 64 H88" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round"/>
</svg>
`,
  oro: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#E8B931"/>
  <circle cx="64" cy="64" r="30" fill="none" stroke="#6B4E12" stroke-width="6"/>
  <text x="64" y="70" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#6B4E12">Au</text>
</svg>
`,
};

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

const platforms = [];
const missing = [];
let cursor = 0;

async function worker() {
  while (cursor < rows.length) {
    const index = cursor;
    cursor += 1;
    const [id, name, group, kind, tracking, bg, fg, mark, domains] = rows[index];
    let image = 'svg';
    if (specials[id]) {
      writeAsset(id, 'svg', specials[id]);
    } else if (domains.length) {
      const hit = await firstIcon(domains);
      if (hit) {
        writeAsset(id, hit.ext, hit.buf);
        image = hit.ext;
      } else {
        writeAsset(id, 'svg', tile(bg, fg, mark));
        missing.push(name);
      }
    } else {
      writeAsset(id, 'svg', tile(bg, fg, mark));
    }
    platforms[index] = {
      id,
      name,
      group,
      kind,
      tracking,
      image,
      hint: extraHint[id] || hints[kind],
    };
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));

const ts = `export type PlatformGroup = 'Banca' | 'Inversión' | 'Cripto' | 'Wallets' | 'Otros';

export interface PlatformPreset {
  id: string;
  name: string;
  group: PlatformGroup;
  kind: 'bank' | 'cash' | 'broker' | 'exchange' | 'wallet' | 'other';
  tracking: 'balance' | 'positions';
  image: 'svg' | 'png' | 'jpg';
  hint: string;
}

export const PLATFORM_GROUPS: PlatformGroup[] = ['Banca', 'Inversión', 'Cripto', 'Wallets', 'Otros'];

export const PLATFORMS: PlatformPreset[] = ${JSON.stringify(platforms, null, 2)};

export function findPlatform(name: string | null | undefined): PlatformPreset | undefined {
  const key = (name || '').trim().toLowerCase();
  if (!key) return undefined;
  return PLATFORMS.find((item) => item.name.toLowerCase() === key || item.id === key);
}
`;

fs.writeFileSync(path.join(root, 'src', 'lib', 'platforms.ts'), ts);
console.log(`plataformas: ${platforms.length}`);
console.log(`con icono: ${platforms.filter((item) => item.image !== 'svg').length}`);
if (missing.length) console.log(`sin icono: ${missing.join(', ')}`);
