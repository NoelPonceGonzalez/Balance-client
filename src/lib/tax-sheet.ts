import type { Cell, Row, Sheet } from 'write-excel-file/browser';
import type { IncomeKind, TaxReport } from './tax-report';

const EUR = '#,##0.00 "€"';
const QTY = '#,##0.########';
const DATE = 'dd/mm/yyyy';
const INK = '#0F172A';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const GAIN = '#15803D';
const LOSS = '#B91C1C';

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
    format: EUR,
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

function header(titles: string[]): Row {
  return titles.map((title) => ({ value: title, type: String, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: INK, alignVertical: 'center', height: 22, wrap: true }));
}

function totalRow(cells: Cell[]): Row {
  return cells.map((cell) => {
    if (cell && typeof cell === 'object' && !(cell instanceof Date)) return { ...cell, fontWeight: 'bold', topBorderStyle: 'thin', topBorderColor: INK };
    return { value: (cell as string | undefined) ?? '', type: String, fontWeight: 'bold', topBorderStyle: 'thin', topBorderColor: INK };
  });
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function sectionTitle(title: string, span: number): Row {
  return [text(title, { fontWeight: 'bold', fontSize: 13, columnSpan: span, bottomBorderStyle: 'thin', bottomBorderColor: LINE }), ...Array(span - 1).fill(null)];
}

function note(value: string, span: number): Row {
  return [text(value, { wrap: true, columnSpan: span, textColor: MUTED, alignVertical: 'top' }), ...Array(span - 1).fill(null)];
}

function summarySheet(report: TaxReport, owner: string): Sheet<Blob> {
  const span = 5;
  const crypto = report.disposals.filter((item) => item.crypto);
  const others = report.disposals.filter((item) => !item.crypto);
  const incomeOf = (kinds: IncomeKind[]) => sum(report.incomes.filter((item) => kinds.includes(item.kind)), (item) => item.eur);
  const coins = [...new Set(crypto.map((item) => item.asset))].sort();
  const data: Row[] = [
    [text(`Informe para la Renta ${report.year}`, { fontWeight: 'bold', fontSize: 18, columnSpan: span }), null, null, null, null],
    [text(`${owner} · Preparado con Balance el ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date())}`, { textColor: MUTED, columnSpan: span }), null, null, null, null],
    [],
    sectionTitle('1. Ganancias y pérdidas por transmisión (base del ahorro)', span),
    header(['Concepto', 'Valor de transmisión', 'Valor de adquisición', 'Resultado', 'Operaciones']),
    [text('Monedas virtuales'), money(sum(crypto, (item) => item.proceeds)), money(sum(crypto, (item) => item.cost)), money(sum(crypto, (item) => item.gain), false, true), crypto.length],
    [text('Acciones, ETF y otros bienes'), money(sum(others, (item) => item.proceeds)), money(sum(others, (item) => item.cost)), money(sum(others, (item) => item.gain), false, true), others.length],
    totalRow([text('Total'), money(sum(report.disposals, (item) => item.proceeds)), money(sum(report.disposals, (item) => item.cost)), money(sum(report.disposals, (item) => item.gain), true, true), { value: report.disposals.length, type: Number }]),
    [],
  ];

  if (coins.length) {
    data.push(sectionTitle('Monedas virtuales, una línea por moneda (como las pide Renta Web)', span));
    data.push(header(['Moneda', 'Valor de transmisión', 'Valor de adquisición', 'Resultado', 'Operaciones']));
    for (const coin of coins) {
      const rows = crypto.filter((item) => item.asset === coin);
      data.push([text(coin), money(sum(rows, (item) => item.proceeds)), money(sum(rows, (item) => item.cost)), money(sum(rows, (item) => item.gain), false, true), rows.length]);
    }
    data.push([]);
  }

  data.push(sectionTitle('2. Rendimientos del capital mobiliario (base del ahorro)', span));
  data.push(header(['Concepto', 'Importe', '', '', 'Apuntes']));
  data.push([text('Intereses (Earn y cuentas remuneradas)'), money(incomeOf(['Intereses'])), null, null, sum(report.incomes.filter((item) => item.kind === 'Intereses'), (item) => item.count)]);
  data.push([text('Staking'), money(incomeOf(['Staking'])), null, null, sum(report.incomes.filter((item) => item.kind === 'Staking'), (item) => item.count)]);
  data.push([text('Dividendos'), money(incomeOf(['Dividendos'])), null, null, sum(report.incomes.filter((item) => item.kind === 'Dividendos'), (item) => item.count)]);
  data.push(totalRow([text('Total'), money(incomeOf(['Intereses', 'Staking', 'Dividendos']), true), null, null, null]));
  data.push([]);
  data.push(sectionTitle('3. Ganancias patrimoniales sin transmisión (base general)', span));
  data.push(header(['Concepto', 'Importe', '', '', 'Apuntes']));
  data.push(totalRow([text('Recompensas y airdrops'), money(incomeOf(['Recompensas']), true), null, null, { value: sum(report.incomes.filter((item) => item.kind === 'Recompensas'), (item) => item.count), type: Number }]));
  data.push([]);

  if (report.warnings.length) {
    data.push(sectionTitle('Para revisar', span));
    for (const warning of report.warnings) data.push(note(`• ${warning}`, span));
    data.push([]);
  }

  data.push(sectionTitle('Cómo está calculado', span));
  for (const line of [
    'Coste de adquisición por FIFO: salen primero las unidades compradas antes, sumando todas tus cuentas, como pide Hacienda para valores homogéneos.',
    'Cada cambio entre criptomonedas es una permuta y tributa: el valor de transmisión es el mayor entre lo entregado y lo recibido, y ese mismo valor es el coste de lo recibido.',
    'Precios: cuando la operación lleva euros, se usan esos euros. En el resto, el cierre de la hora de la operación en Binance (UTC) pasado a euros; para intereses y recompensas, el cierre del día.',
    'Los traspasos entre tus cuentas y el paso a Earn quedan fuera de las ganancias: las monedas siguen siendo tuyas.',
    'Las comisiones pagadas en cripto aparecen como una transmisión pequeña de esa moneda.',
    'Intereses y staking van como rendimientos del capital mobiliario; recompensas y airdrops, como ganancia patrimonial sin transmisión. Tu gestor puede confirmar la casilla exacta.',
    'Con más de 50.000 € en cripto en plataformas extranjeras a 31 de diciembre, toca presentar también el modelo 721.',
  ]) data.push(note(`• ${line}`, span));

  return { sheet: 'Resumen', data, columns: [{ width: 44 }, { width: 20 }, { width: 20 }, { width: 18 }, { width: 13 }], showGridLines: false };
}

function gainsSheet(report: TaxReport): Sheet<Blob> {
  const rows = report.disposals;
  const data: Row[] = [
    header(['Fecha', 'Hora', 'Activo', 'Operación', 'Cantidad', 'Valor de transmisión', 'Valor de adquisición', 'Ganancia o pérdida', 'Comprado desde', 'Comprado hasta', 'Recibido', 'Plataforma', 'Nota']),
    ...rows.map((item) => [
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
    ]),
    totalRow([text('Total'), null, null, null, null, money(sum(rows, (item) => item.proceeds)), money(sum(rows, (item) => item.cost)), money(sum(rows, (item) => item.gain), true, true), null, null, null, null, null]),
  ];
  return { sheet: 'Ganancias y pérdidas', data, stickyRowsCount: 1, columns: [{ width: 12 }, { width: 10 }, { width: 18 }, { width: 11 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 26 }, { width: 16 }, { width: 34 }] };
}

function incomeSheet(report: TaxReport): Sheet<Blob> {
  const rows = report.incomes;
  const monthName = (month: string) => new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  const data: Row[] = [
    header(['Mes', 'Tipo', 'Activo', 'Cantidad', 'Apuntes', 'Importe', 'Plataforma', 'Dónde va en la Renta']),
    ...rows.map((item) => [
      text(monthName(item.month)),
      text(item.kind),
      text(item.asset),
      item.quantity > 0 ? qty(item.quantity) : null,
      item.count,
      money(item.eur),
      text(item.platform),
      text(PLACE[item.kind], { textColor: MUTED }),
    ]),
    totalRow([text('Total'), null, null, null, { value: sum(rows, (item) => item.count), type: Number }, money(sum(rows, (item) => item.eur), true), null, null]),
  ];
  return { sheet: 'Rendimientos', data, stickyRowsCount: 1, columns: [{ width: 18 }, { width: 13 }, { width: 10 }, { width: 18 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 46 }] };
}

function buysSheet(report: TaxReport): Sheet<Blob> {
  const rows = report.acquisitions;
  const data: Row[] = [
    header(['Fecha', 'Hora', 'Activo', 'Cantidad', 'Coste', 'Coste por unidad', 'Origen', 'Plataforma']),
    ...rows.map((item) => [
      day(item.date),
      text(item.time),
      text(item.asset === item.name ? item.asset : `${item.name} (${item.asset})`),
      qty(item.quantity),
      money(item.cost),
      item.quantity > 0 ? { value: item.cost / item.quantity, type: Number, format: '#,##0.00######' } : null,
      text(item.origin),
      text(item.platform),
    ]),
    totalRow([text('Total'), null, null, null, money(sum(rows, (item) => item.cost)), null, null, null]),
  ];
  return { sheet: 'Adquisiciones', data, stickyRowsCount: 1, columns: [{ width: 12 }, { width: 10 }, { width: 30 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 28 }, { width: 16 }] };
}

function movesSheet(report: TaxReport): Sheet<Blob> {
  const data: Row[] = [
    header(['Fecha', 'Hora', 'Plataforma', 'Operación', 'Concepto', 'Categoría', 'Activo', 'Cantidad', 'Precio por unidad', 'Valor', 'Efecto fiscal']),
    ...report.lines.map((item) => [
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
      text(item.effect, { textColor: item.effect.includes('tributa') ? INK : MUTED }),
    ]),
  ];
  return { sheet: 'Movimientos', data, stickyRowsCount: 1, columns: [{ width: 12 }, { width: 10 }, { width: 16 }, { width: 13 }, { width: 34 }, { width: 14 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 30 }] };
}

export function taxWorkbookSheets(report: TaxReport, owner: string): Sheet<Blob>[] {
  return [summarySheet(report, owner), gainsSheet(report), incomeSheet(report), buysSheet(report), movesSheet(report)];
}

export async function downloadTaxWorkbook(report: TaxReport, owner: string): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(taxWorkbookSheets(report, owner), { fontFamily: 'Calibri', fontSize: 11 }).toFile(`Balance-Renta-${report.year}.xlsx`);
}
