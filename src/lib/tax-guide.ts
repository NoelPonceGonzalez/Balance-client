import type { IncomeKind, TaxReport } from './tax-report';

/** Umbral del modelo 721 y del 720 por bloque. */
export const ABROAD_LIMIT = 50_000;

export const KEY_LABEL = { F: 'Euros (F)', N: 'Otra cripto (N)', B: 'Comisión (B)' } as const;

function total<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

export function incomeTotal(report: TaxReport, kinds: IncomeKind[]): number {
  return total(report.incomes.filter((item) => kinds.includes(item.kind)), (item) => item.eur);
}

/** Criterios y normas en los que se apoya el informe. */
export function taxCriteria(report: TaxReport): string[] {
  return [
    'Coste por FIFO: salen primero las unidades compradas antes, sumando todas tus cuentas (art. 37.2 LIRPF; para cripto, DGT V0525-25).',
    'Cambiar una cripto por otra distinta es una permuta y tributa, también al comprar con USDC u otra stablecoin. El valor de transmisión es el mayor entre lo que entregas y lo que recibes (art. 37.1.h LIRPF).',
    ...(report.rewraps.length ? ['Pasar ETH a staking y recibir WBETH, o volver a ETH, es el mismo activo en otro formato: no es una venta y el coste original pasa intacto. No hay consulta de la DGT sobre este caso; si tu asesor prefiere tratarlo como permuta, el Excel trae cada cambio con su fecha y su coste.'] : []),
    'Las comisiones pagadas en euros suben el coste de compra o bajan el valor de venta (art. 35 LIRPF). Las pagadas en cripto cuentan como una transmisión pequeña de esa moneda.',
    'Intereses de Earn, cuentas remuneradas y staking: rendimientos del capital mobiliario, base del ahorro, casilla 0027 (art. 25.2 LIRPF y criterio de la AEAT).',
    'Dividendos: se declara el importe bruto en la casilla 0029. Lo retenido en el extranjero se deduce en la 0588, hasta lo que permita el convenio (art. 80 LIRPF).',
    'Recompensas y airdrops: ganancia que no deriva de una transmisión, base general, casilla 0304 (art. 45 LIRPF). Su valor al recibirlas pasa a ser su coste.',
    'Compensación: las pérdidas del año se restan de las ganancias; lo que sobra, de los rendimientos hasta un 25 %, y el resto pasa a los cuatro años siguientes (art. 49 LIRPF).',
    'Recompra en dos meses: en acciones y ETF la pérdida se aplaza (art. 33.5.f LIRPF). En cripto la DGT no se ha pronunciado; el informe la aplica y avisa si hay recompras.',
    'Los traspasos entre tus cuentas y el paso a Earn no tributan: las monedas siguen siendo tuyas. Comprar no tributa; tener cripto tampoco.',
    'Precios: los euros de la propia operación cuando los hay; si no, el cierre en Binance de esa hora pasado a euros.',
    'Modelo 721: cripto custodiada fuera de España por más de 50.000 € a 31 de diciembre (Orden HFP/886/2023). Modelo 720: cuentas o valores fuera por más de 50.000 € por bloque.',
    'Cuota estimada: escala del ahorro del 19 % al 30 % (arts. 66 y 76 LIRPF, Ley 7/2024) sobre lo que hay en Balance. No incluye tu nómina, retenciones ni deducciones; la cifra final la da Renta Web.',
  ];
}

/** Declaraciones del ejercicio, su plazo y si te tocan según tus datos. */
export function taxDuties(report: TaxReport, money: (value: number) => string): [string, string, string][] {
  const next = report.year + 1;
  const abroad = report.yearEnd.abroad;
  const loss = report.compensation.gains < 0;
  const obliged = report.disposals.length > 0 || incomeTotal(report, ['Intereses', 'Staking', 'Dividendos', 'Recompensas']) > 0;
  return [
    [
      `Renta ${report.year} (modelo 100)`,
      report.year === 2025 ? 'Del 8 de abril al 30 de junio de 2026' : `De abril al 30 de junio de ${next}, cuando Hacienda publique el calendario`,
      obliged
        ? `Las ventas de cripto y los intereses de plataformas extranjeras no llevan retención: toca presentarla salvo que todas tus rentas juntas no pasen de 1.000 € y las pérdidas no lleguen a 500 €.${loss ? ' Con pérdida, preséntala aunque no te obligue: es lo que permite compensarla los cuatro años siguientes.' : ''}`
        : 'Este informe no tiene ventas, intereses ni recompensas que te obliguen por sí solos. Mira también tu nómina y tus otros ingresos.',
    ],
    [
      'Modelo 721 · cripto en el extranjero',
      `Del 1 de enero al 31 de marzo de ${next}`,
      abroad > ABROAD_LIMIT
        ? `Te toca: ${money(abroad)} en exchanges extranjeros${report.yearEnd.live ? ' a día de hoy; vale la cifra del 31 de diciembre' : ''}.`
        : `No te toca: ${money(abroad)} de 50.000 €. Si ya lo presentaste, repítelo si sube más de 20.000 € o si lo vendes todo.`,
    ],
    ['Modelo 720 · cuentas y valores en el extranjero', `Del 1 de enero al 31 de marzo de ${next}`, 'Si tienes más de 50.000 € en cuentas o más de 50.000 € en valores en entidades extranjeras sin sucursal en España. Cada bloque se mide por separado.'],
    ['Impuesto sobre el Patrimonio', 'En el mismo plazo que la Renta', 'Solo si sale a pagar o si tus bienes pasan de 2.000.000 €. El mínimo exento general es de 700.000 € y cada comunidad lo ajusta.'],
  ];
}
