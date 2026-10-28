export type PlatformGroup = 'Banca' | 'Inversión' | 'Cripto' | 'Wallets' | 'Otros';

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

export const PLATFORMS: PlatformPreset[] = [
  {
    "id": "caixabank",
    "name": "CaixaBank",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "santander",
    "name": "Santander",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "bbva",
    "name": "BBVA",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "sabadell",
    "name": "Sabadell",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "unicaja",
    "name": "Unicaja",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "cajamar",
    "name": "Cajamar",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "svg",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "ibercaja",
    "name": "Ibercaja",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "kutxabank",
    "name": "Kutxabank",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "jpg",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "abanca",
    "name": "Abanca",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "bankinter",
    "name": "Bankinter",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "ing",
    "name": "ING",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "openbank",
    "name": "Openbank",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "imagin",
    "name": "imagin",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "evo",
    "name": "EVO Banco",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "revolut",
    "name": "Revolut",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "n26",
    "name": "N26",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "wise",
    "name": "Wise",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "raisin",
    "name": "Raisin",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "norwegian",
    "name": "Bank Norwegian",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "triodos",
    "name": "Triodos",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "deutsche",
    "name": "Deutsche Bank",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "pibank",
    "name": "Pibank",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "bunq",
    "name": "bunq",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "vivid",
    "name": "Vivid",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "nickel",
    "name": "Nickel",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "laboral",
    "name": "Laboral Kutxa",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "svg",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "march",
    "name": "Banca March",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "svg",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "rural",
    "name": "Caja Rural",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "andbank",
    "name": "Andbank",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "mediolanum",
    "name": "Mediolanum",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "ebn",
    "name": "EBN Banco",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "wizink",
    "name": "WiZink",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "svg",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "renault",
    "name": "Renault Bank",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "svg",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "bff",
    "name": "BFF Bank",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "svg",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "qonto",
    "name": "Qonto",
    "group": "Banca",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "traderepublic",
    "name": "Trade Republic",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "myinvestor",
    "name": "MyInvestor",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "indexa",
    "name": "Indexa Capital",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "balance",
    "image": "png",
    "hint": "Suele bastar el valor total de la cartera. Si más adelante separas los fondos, cambia el seguimiento."
  },
  {
    "id": "xtb",
    "name": "XTB",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "degiro",
    "name": "DEGIRO",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "ibkr",
    "name": "Interactive Brokers",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "etoro",
    "name": "eToro",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "freedom",
    "name": "Freedom24",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "scalable",
    "name": "Scalable Capital",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "trading212",
    "name": "Trading 212",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "lightyear",
    "name": "Lightyear",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "renta4",
    "name": "Renta 4",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "finizens",
    "name": "Finizens",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "balance",
    "image": "png",
    "hint": "Suele bastar el valor total de la cartera. Si más adelante separas los fondos, cambia el seguimiento."
  },
  {
    "id": "singular",
    "name": "Singular Bank",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "inbestme",
    "name": "InbestMe",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "balance",
    "image": "png",
    "hint": "Suele bastar el valor total de la cartera. Si más adelante separas los fondos, cambia el seguimiento."
  },
  {
    "id": "popcoin",
    "name": "Popcoin",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "bitpanda",
    "name": "Bitpanda",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "urbanitae",
    "name": "Urbanitae",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "balance",
    "image": "png",
    "hint": "Escribe el valor actual de tus participaciones. No es una cotización automática."
  },
  {
    "id": "mintos",
    "name": "Mintos",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "plus500",
    "name": "Plus500",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "ig",
    "name": "IG",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "saxo",
    "name": "Saxo",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "swissquote",
    "name": "Swissquote",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "robinhood",
    "name": "Robinhood",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "freetrade",
    "name": "Freetrade",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "flatex",
    "name": "flatex",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "comdirect",
    "name": "comdirect",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "vanguard",
    "name": "Vanguard",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "jpg",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "fidelity",
    "name": "Fidelity",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "gvc",
    "name": "GVC Gaesco",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "heytrade",
    "name": "HeyTrade",
    "group": "Inversión",
    "kind": "broker",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo sin invertir. Acciones, ETF y fondos se añaden como activos."
  },
  {
    "id": "binance",
    "name": "Binance",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "kraken",
    "name": "Kraken",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "coinbase",
    "name": "Coinbase",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "bit2me",
    "name": "Bit2Me",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "cryptocom",
    "name": "Crypto.com",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "bybit",
    "name": "Bybit",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "okx",
    "name": "OKX",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "bitstamp",
    "name": "Bitstamp",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "kucoin",
    "name": "KuCoin",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "bitget",
    "name": "Bitget",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "gemini",
    "name": "Gemini",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "bitvavo",
    "name": "Bitvavo",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "gate",
    "name": "Gate.io",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "htx",
    "name": "HTX",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "mexc",
    "name": "MEXC",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "bingx",
    "name": "BingX",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "bitfinex",
    "name": "Bitfinex",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "uphold",
    "name": "Uphold",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "nexo",
    "name": "Nexo",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "swissborg",
    "name": "SwissBorg",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "criptan",
    "name": "Criptan",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "whitebit",
    "name": "WhiteBIT",
    "group": "Cripto",
    "kind": "exchange",
    "tracking": "positions",
    "image": "png",
    "hint": "El saldo es el efectivo. Cada criptomoneda se registra como activo."
  },
  {
    "id": "metamask",
    "name": "MetaMask",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "phantom",
    "name": "Phantom",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "trust",
    "name": "Trust Wallet",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "ledger",
    "name": "Ledger",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "trezor",
    "name": "Trezor",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "rabby",
    "name": "Rabby",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "exodus",
    "name": "Exodus",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "rainbow",
    "name": "Rainbow",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "cbwallet",
    "name": "Coinbase Wallet",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "solflare",
    "name": "Solflare",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "keplr",
    "name": "Keplr",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "safe",
    "name": "Safe",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "zerion",
    "name": "Zerion",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "argent",
    "name": "Argent",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "backpack",
    "name": "Backpack",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "tangem",
    "name": "Tangem",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "safepal",
    "name": "SafePal",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "electrum",
    "name": "Electrum",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "atomic",
    "name": "Atomic Wallet",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "onekey",
    "name": "OneKey",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "bitbox",
    "name": "BitBox",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "braavos",
    "name": "Braavos",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "uniswap",
    "name": "Uniswap Wallet",
    "group": "Wallets",
    "kind": "wallet",
    "tracking": "positions",
    "image": "png",
    "hint": "Solo la dirección pública. Nunca la frase semilla ni la clave privada."
  },
  {
    "id": "efectivo",
    "name": "Efectivo",
    "group": "Otros",
    "kind": "cash",
    "tracking": "balance",
    "image": "svg",
    "hint": "Dinero en metálico."
  },
  {
    "id": "paypal",
    "name": "PayPal",
    "group": "Otros",
    "kind": "bank",
    "tracking": "balance",
    "image": "png",
    "hint": "El saldo es el dinero de la cuenta."
  },
  {
    "id": "vivienda",
    "name": "Vivienda",
    "group": "Otros",
    "kind": "other",
    "tracking": "balance",
    "image": "svg",
    "hint": "Escribe el valor que le das ahora. El precio de compra no se usa como valor de mercado."
  },
  {
    "id": "oro",
    "name": "Oro y metales",
    "group": "Otros",
    "kind": "other",
    "tracking": "balance",
    "image": "svg",
    "hint": "Escribe el valor actual. El coste de compra queda en los movimientos, no como precio."
  },
  {
    "id": "pension",
    "name": "Plan de pensiones",
    "group": "Otros",
    "kind": "broker",
    "tracking": "balance",
    "image": "svg",
    "hint": "Escribe el valor actual del plan. No es una cotización automática."
  },
  {
    "id": "otra",
    "name": "Otra",
    "group": "Otros",
    "kind": "other",
    "tracking": "balance",
    "image": "svg",
    "hint": "Si no está en la lista, pon el nombre de la plataforma. Seguirá apareciendo con tus iniciales."
  },
  {
    "id": "cs2",
    "name": "CS2",
    "group": "Otros",
    "kind": "other",
    "tracking": "positions",
    "image": "svg",
    "hint": "Cada skin vale lo que marcas. El float queda anotado. No hay cotización automática."
  }
];

export type AccountOffer = 'cash' | 'crypto' | 'etf' | 'stock' | 'skin';

/** Lo que ese sitio puede tener. Un apartado vacío no se enseña hasta que lo usas. */
export function accountOffers(name: string | null | undefined): AccountOffer[] {
  const platform = findPlatform(name);
  const id = platform?.id || '';
  if (id === 'cs2' || /cs2|counter-strike/i.test(name || '')) return ['skin'];
  if (platform?.group === 'Cripto' || platform?.group === 'Wallets' || platform?.kind === 'exchange' || platform?.kind === 'wallet') return ['cash', 'crypto'];
  if (id === 'traderepublic') return ['cash', 'crypto', 'etf', 'stock'];
  if (platform?.kind === 'broker' && platform.tracking === 'positions') return ['cash', 'etf', 'stock'];
  return ['cash'];
}

export function findPlatform(name: string | null | undefined): PlatformPreset | undefined {
  const key = (name || '').trim().toLowerCase();
  if (!key) return undefined;
  return PLATFORMS.find((item) => item.name.toLowerCase() === key || item.id === key);
}
