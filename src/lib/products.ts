import { findPlatform } from '@/lib/platforms';

/** Lo que se puede guardar dentro de un apartado. */
export type ProductKind = 'crypto' | 'stock' | 'etf' | 'fund' | 'bond' | 'private' | 'deposit' | 'pension' | 'savings' | 'loan' | 'property' | 'metal' | 'skin' | 'other';

export interface ProductSection {
  id: string;
  label: string;
  hint: string;
  kinds: ProductKind[];
  icon: string;
}

export interface AccountProducts {
  /** Pestaña del dinero suelto. Null si ese sitio no guarda efectivo. */
  cash: { tab: string; title: string; caption: string } | null;
  sections: ProductSection[];
  /** CS2: los apartados salen solos según lo que es cada skin. */
  auto?: boolean;
}

export const KIND_LABEL: Record<ProductKind, string> = {
  crypto: 'Cripto',
  stock: 'Acción',
  etf: 'ETF',
  fund: 'Fondo',
  bond: 'Bono',
  private: 'Fondo privado',
  deposit: 'Depósito',
  pension: 'Plan de pensiones',
  savings: 'Seguro de ahorro',
  loan: 'Préstamo',
  property: 'Proyecto inmobiliario',
  metal: 'Metal',
  skin: 'Skin',
  other: 'Otro',
};

/** Clase con la que se guarda la pieza. Fondo usa la búsqueda de ETF; lo que no cotiza va como valor a mano. */
export function kindClass(kind: ProductKind): string {
  if (kind === 'crypto' || kind === 'stock' || kind === 'etf') return kind;
  if (kind === 'fund') return 'etf';
  if (kind === 'skin') return 'personal_good';
  return 'other';
}

export function kindFromClass(assetClass: string | undefined): ProductKind {
  if (assetClass === 'crypto' || assetClass === 'stock' || assetClass === 'etf') return assetClass;
  if (assetClass === 'personal_good') return 'skin';
  return 'other';
}

const ICON = {
  crypto: '/markets/crypto.svg',
  stock: '/markets/stock.svg',
  etf: '/markets/etf.svg',
  skin: '/platforms/cs2.svg',
  other: '/extras/objeto.svg',
};

function section(id: string, label: string, hint: string, kinds: ProductKind[], icon = ICON.other): ProductSection {
  return { id, label, hint, kinds, icon };
}

const S = {
  cryptoWallet: section('crypto', 'Wallet Crypto', 'Cada moneda, con lo que pagaste y lo que vale ahora.', ['crypto'], ICON.crypto),
  crypto: section('crypto', 'Cripto', 'Cada moneda, con lo que pagaste y lo que vale ahora.', ['crypto'], ICON.crypto),
  spot: section('crypto', 'Spot', 'Las monedas que tienes para comprar y vender.', ['crypto'], ICON.crypto),
  earn: section('earn', 'Earn y staking', 'Lo que tienes bloqueado generando recompensas.', ['crypto'], ICON.crypto),
  tokens: section('crypto', 'Tokens', 'Lo que hay en la dirección pública.', ['crypto'], ICON.crypto),
  valores: section('valores', 'Cuenta de valores', 'Acciones, ETF y fondos.', ['stock', 'etf', 'fund'], ICON.etf),
  accionesEtf: section('valores', 'Acciones y ETF', 'Cada acción o ETF, con lo que pagaste.', ['stock', 'etf'], ICON.etf),
  bolsa: section('valores', 'Bolsa', 'Acciones, ETF y renta fija del bróker del banco.', ['stock', 'etf', 'bond'], ICON.stock),
  rentaFija: section('renta_fija', 'Renta fija', 'Bonos e interés fijo. Escribe lo que vale hoy.', ['bond']),
  bonos: section('renta_fija', 'Bonos', 'Cada bono, con lo que pagaste y lo que vale hoy.', ['bond']),
  private: section('private', 'Private Markets', 'Fondos de capital privado. No cotizan cada día: pon el último valor.', ['private']),
  fondos: section('fondos', 'Fondos', 'Fondos indexados o de gestión activa.', ['fund'], ICON.etf),
  carterasIndexadas: section('carteras', 'Carteras indexadas', 'La cartera automática. Basta con su valor total.', ['fund'], ICON.etf),
  carterasGestionadas: section('carteras', 'Carteras gestionadas', 'La cartera que te gestionan. Basta con su valor total.', ['fund'], ICON.etf),
  roboAdvisor: section('carteras', 'Robo-advisor', 'La cartera automática. Basta con su valor total.', ['fund'], ICON.etf),
  pensiones: section('pensiones', 'Planes de pensiones', 'Cada plan, con lo aportado y lo que vale hoy.', ['pension']),
  depositos: section('depositos', 'Depósitos', 'Dinero a plazo fijo. Pon lo que metiste y lo que vale.', ['deposit']),
  seguros: section('seguros', 'Seguros de ahorro', 'Lo aportado y lo que vale hoy.', ['savings']),
  monetarios: section('monetarios', 'Fondos monetarios', 'Ahorro flexible en fondos del mercado monetario.', ['fund'], ICON.etf),
  materias: section('materias', 'Materias primas', 'Oro, plata y otros metales.', ['metal']),
  metales: section('materias', 'Metales', 'Oro, plata y otros metales.', ['metal']),
  alternativos: section('alternativos', 'Alternativos', 'Crowdfunding inmobiliario, factoring y capital riesgo.', ['property', 'loan', 'private']),
  prestamos: section('prestamos', 'Préstamos', 'Lo que tienes prestado y lo que vale hoy.', ['loan']),
};

const SKIN_SECTIONS: ProductSection[] = [
  section('cuchillos', 'Cuchillos', 'Cada cuchillo con su float.', ['skin'], ICON.skin),
  section('guantes', 'Guantes', 'Cada par con su float.', ['skin'], ICON.skin),
  section('armas', 'Armas', 'Rifles, pistolas y el resto.', ['skin'], ICON.skin),
  section('pegatinas', 'Pegatinas', 'Pegatinas y parches.', ['skin'], ICON.skin),
  section('cajas', 'Cajas', 'Cajas, cápsulas y paquetes.', ['skin'], ICON.skin),
  section('agentes', 'Agentes', 'Agentes y música.', ['skin'], ICON.skin),
];

const CASH = { tab: 'Efectivo', title: 'Líquido', caption: 'Dinero normal' };
const ACCOUNT = { tab: 'Cuenta', title: 'Saldo', caption: 'La cuenta' };

const CLASSIC_BANK = [S.depositos, S.fondos, S.carterasGestionadas, S.bolsa, S.pensiones, S.seguros];
const DEPOSIT_BANK = [S.depositos];
const GENERIC_BROKER = [S.accionesEtf, S.fondos, S.bonos];

const BY_ID: Record<string, AccountProducts> = {
  traderepublic: { cash: CASH, sections: [S.cryptoWallet, S.valores, S.rentaFija, S.private] },
  myinvestor: { cash: { ...CASH, title: 'Cuenta remunerada' }, sections: [S.fondos, S.carterasIndexadas, S.accionesEtf, S.pensiones, S.alternativos, S.depositos] },
  ing: { cash: ACCOUNT, sections: [S.fondos, { ...S.accionesEtf, label: 'Broker Naranja' }, S.pensiones] },
  openbank: { cash: ACCOUNT, sections: [S.fondos, S.roboAdvisor, S.accionesEtf, S.pensiones, S.depositos] },
  revolut: { cash: ACCOUNT, sections: [S.accionesEtf, S.crypto, S.monetarios, S.materias, S.roboAdvisor] },
  n26: { cash: ACCOUNT, sections: [S.accionesEtf, S.crypto] },
  vivid: { cash: ACCOUNT, sections: [S.accionesEtf, S.crypto] },
  bunq: { cash: ACCOUNT, sections: [S.accionesEtf, S.crypto] },
  wise: { cash: ACCOUNT, sections: [{ ...S.monetarios, label: 'Interés' }, { ...S.accionesEtf, label: 'Acciones' }] },
  raisin: { cash: ACCOUNT, sections: [S.depositos, { ...S.carterasGestionadas, label: 'ETF gestionados' }] },
  evo: { cash: ACCOUNT, sections: [S.depositos, S.fondos] },
  triodos: { cash: ACCOUNT, sections: [S.fondos, S.pensiones] },
  pibank: { cash: ACCOUNT, sections: DEPOSIT_BANK },
  wizink: { cash: ACCOUNT, sections: DEPOSIT_BANK },
  renault: { cash: ACCOUNT, sections: DEPOSIT_BANK },
  bff: { cash: ACCOUNT, sections: DEPOSIT_BANK },
  norwegian: { cash: ACCOUNT, sections: DEPOSIT_BANK },
  qonto: { cash: ACCOUNT, sections: [] },
  nickel: { cash: ACCOUNT, sections: [] },
  paypal: { cash: ACCOUNT, sections: [] },
  efectivo: { cash: { tab: 'Efectivo', title: 'En mano', caption: 'Dinero en metálico' }, sections: [] },
  xtb: { cash: CASH, sections: [S.accionesEtf] },
  degiro: { cash: CASH, sections: [S.accionesEtf, S.fondos, S.bonos] },
  ibkr: { cash: CASH, sections: [S.accionesEtf, S.fondos, S.bonos, S.crypto] },
  etoro: { cash: CASH, sections: [S.accionesEtf, S.crypto] },
  scalable: { cash: CASH, sections: [S.accionesEtf, S.crypto] },
  trading212: { cash: CASH, sections: [S.accionesEtf] },
  lightyear: { cash: CASH, sections: [S.accionesEtf, S.monetarios] },
  freedom: { cash: CASH, sections: [S.accionesEtf, S.bonos] },
  renta4: { cash: CASH, sections: [S.fondos, S.accionesEtf, S.pensiones, S.bonos] },
  singular: { cash: CASH, sections: [S.fondos, S.accionesEtf, S.carterasGestionadas] },
  gvc: { cash: CASH, sections: [S.fondos, S.accionesEtf, S.pensiones] },
  heytrade: { cash: CASH, sections: [S.accionesEtf] },
  popcoin: { cash: CASH, sections: [S.carterasIndexadas] },
  bitpanda: { cash: CASH, sections: [S.crypto, S.accionesEtf, S.metales] },
  mintos: { cash: CASH, sections: [S.prestamos, S.bonos, { ...S.carterasIndexadas, label: 'ETF' }] },
  indexa: { cash: { tab: 'Cartera', title: 'Cartera indexada', caption: 'Valor total' }, sections: [] },
  finizens: { cash: { tab: 'Cartera', title: 'Cartera indexada', caption: 'Valor total' }, sections: [] },
  inbestme: { cash: { tab: 'Cartera', title: 'Cartera gestionada', caption: 'Valor total' }, sections: [] },
  urbanitae: { cash: { tab: 'Proyectos', title: 'Proyectos', caption: 'Valor de tus participaciones' }, sections: [] },
  pension: { cash: { tab: 'Plan', title: 'Plan de pensiones', caption: 'Valor del plan' }, sections: [] },
  vivienda: { cash: { tab: 'Vivienda', title: 'Vivienda', caption: 'Lo que vale ahora' }, sections: [] },
  oro: { cash: { tab: 'Metales', title: 'Oro y metales', caption: 'Lo que vale ahora' }, sections: [] },
  cs2: { cash: null, sections: SKIN_SECTIONS, auto: true },
};

/** Lo que tiene cada sitio por dentro. */
export function accountProducts(name: string | null | undefined): AccountProducts {
  const platform = findPlatform(name);
  if (/cs2|counter-strike/i.test(name || '')) return BY_ID.cs2;
  if (platform && BY_ID[platform.id]) return BY_ID[platform.id];
  if (platform?.kind === 'exchange') return { cash: { ...CASH, title: 'Saldo en euros' }, sections: [S.spot, S.earn] };
  if (platform?.kind === 'wallet') return { cash: null, sections: [S.tokens] };
  if (platform?.kind === 'broker') return { cash: CASH, sections: GENERIC_BROKER };
  if (platform?.kind === 'bank') return { cash: ACCOUNT, sections: CLASSIC_BANK };
  return { cash: CASH, sections: [] };
}

function has(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

/** En CS2 el apartado sale del nombre de la skin. */
export function skinSection(label: string): string {
  const text = label.toLowerCase();
  if (has(text, ['gloves', 'hand wraps', 'guantes'])) return 'guantes';
  if (text.startsWith('★') || has(text, ['knife', 'karambit', 'bayonet', 'butterfly', 'talon', 'daggers', 'navaja', 'stiletto', 'ursus', 'huntsman', 'falchion', 'bowie', 'kukri', 'nomad', 'skeleton', 'paracord', 'survival', 'gut ', 'flip '])) return 'cuchillos';
  if (has(text, ['sticker', 'patch', 'pegatina', 'parche', 'graffiti'])) return 'pegatinas';
  if (has(text, [' case', 'capsule', 'package', 'caja', 'cápsula'])) return 'cajas';
  if (has(text, ['agent', 'music kit', 'agente'])) return 'agentes';
  return 'armas';
}

/** Apartado de una pieza que ya existe. */
export function partSection(products: AccountProducts, part: { label: string; group?: string; section?: string | null }): ProductSection | null {
  if (products.auto) return products.sections.find((item) => item.id === skinSection(part.label)) || null;
  if (part.section) {
    const saved = products.sections.find((item) => item.id === part.section);
    if (saved) return saved;
  }
  const kind = kindFromClass(part.group);
  const direct = products.sections.find((item) => item.kinds.includes(kind));
  if (direct) return direct;
  if (kind === 'other') return products.sections.find((item) => item.kinds.some((k) => kindClass(k) === 'other')) || null;
  return null;
}
