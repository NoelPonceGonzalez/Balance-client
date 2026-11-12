import type { Cell, Row, Sheet } from 'write-excel-file/browser';
import { EFFECT, type IncomeKind, type TaxReport } from './tax-report';
import { brandMarkPng } from './brand-mark';

const EUR = '#,##0.00 "€"';
const EUR_SIGNED = '+#,##0.00 "€";-#,##0.00 "€";0.00 "€"';
const QTY = '#,##0.########';
const DATE = 'dd/mm/yyyy';
const INK = '#0A0A0A';
const MUTED = '#71717A';
const FAINT = '#A1A1AA';
const LINE = '#E4E4E7';
const GAIN = '#15803D';
const LOSS = '#B91C1C';
const WARN = '#92400E';

const PLACE: Record<IncomeKind, string> = {
  Intereses: 'Rendimientos del capital mobiliario',
  Staking: 'Rendimientos del capital mobiliario',
  Dividendos: 'Rendimientos del capital mobiliario',
  Recompensas: 'Ganancia patrimonial sin transmisión (base general)',
};

function day(value: string): Cell {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return { value: new Date(Date.UTC(y, m - 1, d)), type: Date, format: DATE };
}

function money(value: number | null, bold = false, toned = false): Cell {
  if (value == null) return null;
  const rounded = Math.round(value * 100) / 100;
  return {
    value: rounded,
    type: Number,
    format: toned ? EUR_SIGNED : EUR,
    fontWeight: bold ? 'bold' : undefined,
    textColor: toned && rounded !== 0 ? (rounded > 0 ? GAIN : LOSS) : undefined,
  };
}

function qty(value: number): Cell {
  return { value: Number(value.toPrecision(12)), type: Number, format: QTY };
}

function text(value: string, extra: Partial<Exclude<Cell, null | undefined | string | number | boolean | Date>> = {}): Cell {
  return { value, type: String, ...extra };
}

function header(titles: string[], right: number[] = []): Row {
  return titles.map((title, index) => ({ value: title, type: String, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: INK, align: right.includes(index) ? 'right' : 'left', alignVertical: 'center', height: 26 }));
}

type CellObject = Exclude<Cell, null | undefined | string | number | boolean | Date>;

function asObject(cell: Cell): CellObject {
  if (cell && typeof cell === 'object' && !(cell instanceof Date)) return cell;
  if (typeof cell === 'number') return { value: cell, type: Number };
  return { value: (cell as string | undefined) ?? '', type: String };
}

/** Cabecera discreta de la hoja Resumen: texto pequeño en gris y una línea negra debajo. */
function quietHeader(titles: (string | null)[], right: number[] = [], spans: Record<number, number> = {}): Row {
  let spanEnd = 0;
  return titles.map((title, index) => {
    if (index < spanEnd) return null;
    spanEnd = index + (spans[index] ?? 1);
    return {
      value: (title ?? '').toUpperCase(),
      type: String,
      fontWeight: 'bold',
      fontSize: 8,
      textColor: MUTED,
      align: right.includes(index) ? 'right' : 'left',
      alignVertical: 'bottom',
      height: 22,
      bottomBorderStyle: 'medium',
      bottomBorderColor: INK,
      ...(spans[index] ? { columnSpan: spans[index] } : {}),
    } as CellObject;
  });
}

/** Fila de datos con su línea fina debajo. */
function line(cells: Cell[], height = 22): Row {
  let spanEnd = 0;
  return cells.map((cell, index) => {
    if (index < spanEnd) return null;
    const object = asObject(cell);
    spanEnd = index + ((object as { columnSpan?: number }).columnSpan ?? 1);
    return { alignVertical: 'center', ...object, height: index === 0 ? height : undefined, bottomBorderStyle: 'thin', bottomBorderColor: LINE };
  });
}

function totalRow(cells: Cell[]): Row {
  return cells.map((cell) => ({ ...asObject(cell), fontWeight: 'bold', topBorderStyle: 'medium', topBorderColor: INK, alignVertical: 'center', height: 24 }));
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function sectionTitle(title: string, span: number): Row {
  return [text(title, { fontWeight: 'bold', fontSize: 14, columnSpan: span, height: 24, alignVertical: 'bottom' }), ...Array(span - 1).fill(null)];
}

function note(value: string, span: number, color = MUTED): Row {
  const height = Math.max(18, Math.ceil(value.length / 115) * 15);
  return [text(value, { wrap: true, columnSpan: span, textColor: color, alignVertical: 'top', height }), ...Array(span - 1).fill(null)];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function summarySheet(report: TaxReport, owner: string, mark: Blob | null): Sheet<Blob> {
  const span = 5;
  const crypto = report.disposals.filter((item) => item.crypto);
  const others = report.disposals.filter((item) => !item.crypto);
  const incomeOf = (kinds: IncomeKind[]) => sum(report.incomes.filter((item) => kinds.includes(item.kind)), (item) => item.eur);
  const countOf = (kinds: IncomeKind[]) => sum(report.incomes.filter((item) => kinds.includes(item.kind)), (item) => item.count);
  const capitalKinds: IncomeKind[] = ['Intereses', 'Staking', 'Dividendos'];
  const result = sum(report.disposals, (item) => item.gain);
  const coins = [...new Set(crypto.map((item) => item.asset))].sort();
  const made = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date());
  const fill = (cells: Cell[]): Row => [...cells, ...Array(Math.max(0, span - cells.length)).fill(null)];
  const black = { backgroundColor: INK, indent: 1 } as const;
  const kpiValue = (value: number, signedValue: boolean, columnSpan = 1): Cell => ({
    value: Math.round(value * 100) / 100,
    type: Number,
    format: signedValue ? EUR_SIGNED : EUR,
    fontWeight: 'bold',
    fontSize: 18,
    textColor: '#FFFFFF',
    align: 'left',
    alignVertical: 'center',
    columnSpan,
    ...black,
  });

  const data: Row[] = [
    fill([null, null, text('INFORME PARA LA RENTA', { columnSpan: 3, align: 'right', fontWeight: 'bold', fontSize: 8, textColor: MUTED, alignVertical: 'bottom', height: 36 })]),
    fill([text('B A L A N C E', { fontWeight: 'bold', fontSize: 8, textColor: INK, indent: 1 }), null, text(`Ejercicio ${report.year} · ${owner}`, { columnSpan: 3, align: 'right', textColor: INK })]),
    Array.from({ length: span }, () => ({ value: '', type: String, bottomBorderStyle: 'medium', bottomBorderColor: INK } as Cell)),
    [],
    fill([text(`Renta ${report.year}`, { fontWeight: 'bold', fontSize: 24, columnSpan: span, height: 40, alignVertical: 'bottom' })]),
    fill([text(`Solo los movimientos con efecto en la declaración. Preparado para tu asesor el ${made}.`, { textColor: MUTED, columnSpan: span })]),
    [],
    fill([
      text('GANANCIAS Y PÉRDIDAS', { fontWeight: 'bold', fontSize: 8, textColor: FAINT, alignVertical: 'bottom', height: 26, ...black }),
      text('CAPITAL MOBILIARIO', { fontWeight: 'bold', fontSize: 8, textColor: FAINT, alignVertical: 'bottom', columnSpan: 2, ...black }),
      null,
      text('RECOMPENSAS', { fontWeight: 'bold', fontSize: 8, textColor: FAINT, alignVertical: 'bottom', columnSpan: 2, ...black }),
    ]),
    fill([
      { ...kpiValue(result, true), height: 34 },
      kpiValue(incomeOf(capitalKinds), false, 2),
      null,
      kpiValue(incomeOf(['Recompensas']), false, 2),
    ]),
    fill([
      text(`Base del ahorro · ${plural(report.disposals.length, 'transmisión', 'transmisiones')}`, { fontSize: 9, textColor: FAINT, alignVertical: 'top', height: 24, ...black }),
      text(`Base del ahorro · ${plural(countOf(capitalKinds), 'apunte', 'apuntes')}`, { fontSize: 9, textColor: FAINT, alignVertical: 'top', columnSpan: 2, ...black }),
      null,
      text(`Base general · ${plural(countOf(['Recompensas']), 'apunte', 'apuntes')}`, { fontSize: 9, textColor: FAINT, alignVertical: 'top', columnSpan: 2, ...black }),
    ]),
    [],
    [],
    sectionTitle('Dónde va cada importe en Renta Web', span),
    note('Cada bloque corresponde a un apartado de la declaración. Tu asesor confirma la casilla exacta del ejercicio.', span),
    quietHeader(['Apartado', 'Qué incluye', null, null, 'Importe'], [4], { 1: 3 }),
    line([text('Ganancias y pérdidas patrimoniales · Monedas virtuales', { wrap: true }), text('Ventas, cambios entre criptos distintas y comisiones pagadas en cripto. Una línea por moneda.', { wrap: true, columnSpan: 3, textColor: MUTED }), null, null, money(sum(crypto, (item) => item.gain), true, true)], 34),
    ...(others.length ? [line([text('Ganancias y pérdidas patrimoniales · Acciones y fondos cotizados', { wrap: true }), text('Ventas de acciones, ETF y otros valores.', { wrap: true, columnSpan: 3, textColor: MUTED }), null, null, money(sum(others, (item) => item.gain), true, true)], 34)] : []),
    line([text('Rendimientos del capital mobiliario', { wrap: true }), text('Intereses de Earn y cuentas remuneradas, staking y dividendos.', { wrap: true, columnSpan: 3, textColor: MUTED }), null, null, money(incomeOf(capitalKinds), true)], 34),
    line([text('Ganancias patrimoniales que no derivan de transmisión', { wrap: true }), text('Recompensas y airdrops recibidos. Van a la base general.', { wrap: true, columnSpan: 3, textColor: MUTED }), null, null, money(incomeOf(['Recompensas']), true)], 34),
    [],
    [],
    sectionTitle('1. Ganancias y pérdidas por transmisión', span),
    note('Base del ahorro. Renta Web pide cada moneda virtual por separado con su valor de transmisión y su valor de adquisición.', span),
    quietHeader(['Moneda o activo', 'Valor de transmisión', 'Valor de adquisición', 'Operaciones', 'Resultado'], [1, 2, 3, 4]),
  ];

  for (const coin of coins) {
    const rows = crypto.filter((item) => item.asset === coin);
    data.push(line([text(coin), money(sum(rows, (item) => item.proceeds)), money(sum(rows, (item) => item.cost)), rows.length, money(sum(rows, (item) => item.gain), false, true)]));
  }
  if (others.length) data.push(line([text('Acciones, ETF y otros'), money(sum(others, (item) => item.proceeds)), money(sum(others, (item) => item.cost)), others.length, money(sum(others, (item) => item.gain), false, true)]));
  if (!report.disposals.length) data.push(line([text('Nada este año.', { textColor: MUTED, fontStyle: 'italic' }), null, null, null, null]));
  data.push(totalRow([text('Total'), money(sum(report.disposals, (item) => item.proceeds)), money(sum(report.disposals, (item) => item.cost)), { value: report.disposals.length, type: Number }, money(result, true, true)]));
  data.push([], []);

  data.push(sectionTitle('2. Rendimientos del capital mobiliario', span));
  data.push(note('Base del ahorro. Valorados en euros el día en que los recibiste.', span));
  data.push(quietHeader(['Concepto', null, null, 'Apuntes', 'Importe'], [3, 4]));
  for (const [kind, label] of [['Intereses', 'Intereses de Earn y cuentas remuneradas'], ['Staking', 'Staking'], ['Dividendos', 'Dividendos']] as const) {
    if (kind !== 'Intereses' && !countOf([kind])) continue;
    data.push(line([text(label), null, null, countOf([kind]), money(incomeOf([kind]))]));
  }
  data.push(totalRow([text('Total'), null, null, { value: countOf(capitalKinds), type: Number }, money(incomeOf(capitalKinds), true)]));
  data.push([], []);

  data.push(sectionTitle('3. Ganancias patrimoniales sin transmisión', span));
  data.push(note('Base general. Recompensas y airdrops, valorados el día en que entraron.', span));
  data.push(quietHeader(['Concepto', null, null, 'Apuntes', 'Importe'], [3, 4]));
  data.push(totalRow([text('Recompensas y airdrops'), null, null, { value: countOf(['Recompensas']), type: Number }, money(incomeOf(['Recompensas']), true)]));
  data.push([], []);

  data.push(sectionTitle('Lo que no tributa', span));
  data.push(note('Movimientos revisados que no van a la declaración.', span));
  const count = (effect: string) => report.lines.filter((item) => item.effect === effect).length;
  const outside: [string, string, number][] = ([
    ['Compras', 'Lo que entra al comprar no tributa: queda apuntado como coste para cuando vendas.', count(EFFECT.buy)],
    ['Traspasos y Earn', 'Mover monedas entre tus cuentas o a Earn: siguen siendo tuyas.', count(EFFECT.own)],
    ['Movimientos en euros', 'Nómina, gastos y euros que metes o sacas: no son inversiones.', count(EFFECT.euros)],
    ['Mismo activo en otro formato', 'Por ejemplo, ETH en staking como WBETH. Detalle en la hoja «Sin efecto fiscal».', report.rewraps.length],
  ] as [string, string, number][]).filter(([, , n]) => n > 0);
  data.push(quietHeader(['Tipo', 'Por qué no tributa', null, null, 'Movimientos'], [4], { 1: 3 }));
  for (const [label, why, n] of outside) data.push(line([text(label), text(why, { columnSpan: 3, textColor: MUTED, wrap: true }), null, null, n], 30));
  data.push([], []);

  if (report.warnings.length) {
    data.push(sectionTitle('Para revisar con tu asesor', span));
    for (const warning of report.warnings) data.push(note(`• ${warning}`, span, WARN));
    data.push([], []);
  }

  data.push(sectionTitle('Criterios del cálculo', span));
  for (const item of [
    'Coste de adquisición por FIFO: salen primero las unidades compradas antes, sumando todas tus cuentas, como pide Hacienda para valores homogéneos.',
    'Cambiar una cripto por otra distinta es una permuta y tributa, también al comprar con USDC u otra stablecoin: el valor de transmisión es el mayor entre lo entregado y lo recibido.',
    ...(report.rewraps.length ? ['Pasar ETH a staking y recibir WBETH, o volver a ETH, es el mismo activo en otro formato: no es una venta y el coste original pasa intacto. Si tu asesor prefiere tratarlo como permuta, la hoja «Sin efecto fiscal» trae cada cambio con su fecha y su coste.'] : []),
    'Precios: cuando la operación lleva euros, se usan esos euros. En el resto, el cierre de la hora de la operación en Binance (UTC) pasado a euros; para intereses y recompensas, el cierre del día.',
    'Los traspasos entre tus cuentas y el paso a Earn no tributan: las monedas siguen siendo tuyas.',
    'Las comisiones pagadas en cripto aparecen como una transmisión pequeña de esa moneda.',
    'Con más de 50.000 € en cripto en plataformas extranjeras a 31 de diciembre, toca presentar también el modelo 721.',
  ]) data.push(note(`• ${item}`, span));

  return {
    sheet: 'Resumen',
    data,
    columns: [{ width: 46 }, { width: 22 }, { width: 22 }, { width: 14 }, { width: 18 }],
    showGridLines: false,
    images: mark ? [{ content: mark, contentType: 'image/png', width: 34, height: 30, dpi: 96, anchor: { row: 1, column: 1 }, offsetX: 14, offsetY: 14, title: 'Balance' }] : undefined,
  };
}

function rewrapSheet(report: TaxReport): Sheet<Blob> {
  const rows = report.rewraps;
  const data: Row[] = [
    header(['Fecha', 'Hora', 'Entregado', 'Cantidad', 'Recibido', 'Cantidad', 'Coste que se conserva', 'Plataforma', 'Tratamiento'], [3, 5, 6]),
    ...rows.map((item) => line([
      day(item.date),
      text(item.time),
      text(item.from),
      qty(item.fromQuantity),
      text(item.to),
      qty(item.toQuantity),
      money(item.cost),
      text(item.platform),
      text('Mismo activo en otro formato · no tributa', { textColor: MUTED }),
    ])),
  ];
  if (!rows.length) data.push([text('Ningún cambio de formato este año.', { textColor: MUTED, fontStyle: 'italic' })]);
  return { sheet: 'Sin efecto fiscal', data, stickyRowsCount: 1, showGridLines: false, columns: [{ width: 12 }, { width: 10 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 24 }, { width: 14 }, { width: 40 }] };
}

function gainsSheet(report: TaxReport): Sheet<Blob> {
  const rows = report.disposals;
  const data: Row[] = [
    header(['Fecha', 'Hora', 'Activo', 'Operación', 'Cantidad', 'Valor de transmisión', 'Valor de adquisición', 'Ganancia o pérdida', 'Comprado desde', 'Comprado hasta', 'Recibido', 'Plataforma', 'Nota'], [4, 5, 6, 7]),
    ...rows.map((item) => line([
      day(item.date),
      text(item.time),
      text(item.asset === item.name ? item.asset : `${item.name} (${item.asset})`),
      text(item.kind),
      qty(item.quantity),
      money(item.proceeds),
      money(item.cost),
      money(item.gain, false, true),
      day(item.firstBuy),
      day(item.lastBuy),
      text(item.received),
      text(item.platform),
      text([item.uncovered > 0 ? `${new Intl.NumberFormat('es-ES', { maximumSignificantDigits: 4 }).format(item.uncovered)} ${item.asset} sin compra apuntada (coste 0 €)` : '', item.priced ? '' : 'Precio a completar'].filter(Boolean).join(' · '), { textColor: MUTED }),
    ])),
    totalRow([text('Total'), null, null, null, null, money(sum(rows, (item) => item.proceeds)), money(sum(rows, (item) => item.cost)), money(sum(rows, (item) => item.gain), true, true), null, null, null, null, null]),
  ];
  return { sheet: 'Ganancias y pérdidas', data, stickyRowsCount: 1, columns: [{ width: 12 }, { width: 10 }, { width: 18 }, { width: 11 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 26 }, { width: 16 }, { width: 34 }] };
}

function incomeSheet(report: TaxReport): Sheet<Blob> {
  const rows = report.incomes;
  const monthName = (month: string) => new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const data: Row[] = [
    header(['Mes', 'Tipo', 'Activo', 'Cantidad', 'Apuntes', 'Importe', 'Plataforma', 'Dónde va en la Renta'], [3, 4, 5]),
    ...rows.map((item) => line([
      text(monthName(item.month)),
      text(item.kind),
      text(item.asset),
      item.quantity > 0 ? qty(item.quantity) : null,
      item.count,
      money(item.eur),
      text(item.platform),
      text(PLACE[item.kind], { textColor: MUTED }),
    ])),
    totalRow([text('Total'), null, null, null, { value: sum(rows, (item) => item.count), type: Number }, money(sum(rows, (item) => item.eur), true), null, null]),
  ];
  return { sheet: 'Rendimientos', data, stickyRowsCount: 1, columns: [{ width: 18 }, { width: 13 }, { width: 10 }, { width: 18 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 46 }] };
}

function buysSheet(report: TaxReport): Sheet<Blob> {
  const rows = report.acquisitions;
  const data: Row[] = [
    header(['Fecha', 'Hora', 'Activo', 'Cantidad', 'Coste', 'Coste por unidad', 'Origen', 'Plataforma'], [3, 4, 5]),
    ...rows.map((item) => line([
      day(item.date),
      text(item.time),
      text(item.asset === item.name ? item.asset : `${item.name} (${item.asset})`),
      qty(item.quantity),
      money(item.cost),
      item.quantity > 0 ? { value: item.cost / item.quantity, type: Number, format: '#,##0.00######' } : null,
      text(item.origin),
      text(item.platform),
    ])),
    totalRow([text('Total'), null, null, null, money(sum(rows, (item) => item.cost)), null, null, null]),
  ];
  return { sheet: 'Adquisiciones', data, stickyRowsCount: 1, columns: [{ width: 12 }, { width: 10 }, { width: 30 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 28 }, { width: 16 }] };
}

function movesSheet(report: TaxReport): Sheet<Blob> {
  const data: Row[] = [
    header(['Fecha', 'Hora', 'Plataforma', 'Operación', 'Concepto', 'Categoría', 'Activo', 'Cantidad', 'Precio por unidad', 'Valor', 'Efecto fiscal'], [7, 8, 9]),
    ...report.lines.map((item) => line([
      day(item.date),
      text(item.time),
      text(item.platform),
      text(item.operation),
      text(item.concept),
      text(item.category),
      text(item.asset),
      qty(item.quantity),
      item.unitEur == null ? null : { value: item.unitEur, type: Number, format: '#,##0.00######' },
      money(item.eur),
      text(item.effect, { textColor: item.effect.endsWith('· tributa') ? INK : MUTED }),
    ])),
  ];
  return { sheet: 'Movimientos', data, stickyRowsCount: 1, columns: [{ width: 12 }, { width: 10 }, { width: 16 }, { width: 13 }, { width: 34 }, { width: 14 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 30 }] };
}

export function taxWorkbookSheets(report: TaxReport, owner: string, mark: Blob | null = null): Sheet<Blob>[] {
  return [summarySheet(report, owner, mark), gainsSheet(report), incomeSheet(report), rewrapSheet(report), buysSheet(report), movesSheet(report)].map((sheet) => ({ showGridLines: false, ...sheet }));
}

export async function downloadTaxWorkbook(report: TaxReport, owner: string): Promise<void> {
  const [{ default: writeXlsxFile }, mark] = await Promise.all([import('write-excel-file/browser'), brandMarkPng(136)]);
  await writeXlsxFile(taxWorkbookSheets(report, owner, mark?.blob ?? null), { fontFamily: 'Calibri', fontSize: 11 }).toFile(`Balance-Renta-${report.year}.xlsx`);
}
