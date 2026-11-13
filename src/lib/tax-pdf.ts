import type { jsPDF as JsPdf } from 'jspdf';
import type { CellInput } from 'jspdf-autotable';
import { ABROAD_LIMIT, KEY_LABEL, taxCriteria, taxDuties } from './tax-guide';
import { EFFECT, type IncomeKind, type TaxReport } from './tax-report';

type Rgb = [number, number, number];

const INK: Rgb = [10, 10, 10];
const BODY: Rgb = [39, 39, 42];
const MUTED: Rgb = [113, 113, 122];
const FAINT: Rgb = [161, 161, 170];
const LINE: Rgb = [228, 228, 231];
const GAIN: Rgb = [21, 128, 61];
const LOSS: Rgb = [185, 28, 28];
const WARN: Rgb = [146, 64, 14];
const WARN_BG: Rgb = [255, 251, 235];

/**
 * Número al estilo español con punto de miles también en cifras de cuatro dígitos.
 * Se hace a mano porque Intl usa el signo menos tipográfico y espacios finos, que las fuentes del PDF no tienen.
 */
function grouped(value: number, decimals: number, trim = false): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction = ''] = fixed.split('.');
  const tail = trim ? fraction.replace(/0+$/, '') : fraction;
  return `${value < 0 ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${tail ? `,${tail}` : ''}`;
}

function money(value: number): string {
  return `${grouped(Math.round(value * 100) / 100, 2)} €`;
}

function signed(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (rounded > 0) return `+${money(rounded)}`;
  return money(rounded);
}

function tone(value: number): Rgb {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? GAIN : rounded < 0 ? LOSS : INK;
}

function toned(value: number, bold = false): CellInput {
  return { content: signed(value), styles: { textColor: tone(value), fontStyle: bold ? 'bold' : 'normal' } };
}

function qty(value: number): string {
  return grouped(value, 8, true);
}

function day(value: string): string {
  if (!value) return '-';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((acc, item) => acc + pick(item), 0);
}

function monthName(month: string): string {
  const name = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** La balanza de Balance en trazo vectorial; `x`, `y` es la esquina superior izquierda y `width` su ancho. */
function drawScale(doc: JsPdf, x: number, y: number, width: number, ink: Rgb = INK) {
  const s = width / 26;
  const px = (value: number) => x + (value - 3) * s;
  const py = (value: number) => y + (value - 4) * s;
  doc.setDrawColor(...ink);
  doc.setLineWidth(1.6 * s);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  doc.line(px(16), py(6.5), px(16), py(25));
  doc.line(px(12), py(25), px(20), py(25));
  doc.line(px(5.5), py(9.5), px(26.5), py(9.5));
  for (const hang of [8, 24]) {
    doc.line(px(hang), py(9.5), px(hang - 2.6), py(16));
    doc.line(px(hang), py(9.5), px(hang + 2.6), py(16));
    doc.lines([[0.8 * s, 1.3 * s, 4.4 * s, 1.3 * s, 5.2 * s, 0]], px(hang - 2.6), py(16), [1, 1], 'S', false);
  }
  doc.setLineCap('butt');
}

/** PDF para el asesor: solo lo que va a la Renta, con la marca de Balance. */
export async function buildTaxPdf(report: TaxReport, owner: string): Promise<JsPdf> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setProperties({ title: `Informe para la Renta ${report.year}`, author: 'Balance', subject: `Renta ${report.year} · ${owner}`, creator: 'Balance' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 48;
  const inner = width - margin * 2;
  const top = 112;
  const bottom = height - 64;

  const crypto = report.disposals.filter((item) => item.crypto);
  const others = report.disposals.filter((item) => !item.crypto);
  const incomeOf = (kinds: IncomeKind[]) => sum(report.incomes.filter((item) => kinds.includes(item.kind)), (item) => item.eur);
  const countOf = (kinds: IncomeKind[]) => sum(report.incomes.filter((item) => kinds.includes(item.kind)), (item) => item.count);
  const capitalKinds: IncomeKind[] = ['Intereses', 'Staking', 'Dividendos'];
  const capital = incomeOf(capitalKinds);
  const rewards = incomeOf(['Recompensas']);
  const result = sum(report.disposals, (item) => item.gain);
  const cryptoResult = sum(crypto, (item) => item.gain);
  const othersResult = sum(others, (item) => item.gain);
  const ownMoves = report.lines.filter((line) => line.effect === EFFECT.own).length;
  const made = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date());

  /** jsPDF no cuenta el espaciado entre letras al alinear, así que se mide aquí. */
  const tracked = (text: string, x: number, y: number, space: number, align: 'left' | 'center' | 'right' = 'left') => {
    const full = doc.getTextWidth(text) + space * (text.length - 1);
    const start = align === 'right' ? x - full : align === 'center' ? x - full / 2 : x;
    doc.text(text, start, y, { charSpace: space });
  };

  const headed = new Set<number>();
  const header = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (headed.has(page)) return;
    headed.add(page);
    drawScale(doc, margin + 2, 34, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...INK);
    tracked('BALANCE', margin + 16, 69, 1.6, 'center');
    doc.setTextColor(...MUTED);
    tracked('INFORME PARA LA RENTA', width - margin, 50, 1.2, 'right');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(`Ejercicio ${report.year} · ${owner}`, width - margin, 64, { align: 'right' });
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.8);
    doc.line(margin, 82, width - margin, 82);
  };
  const newPage = () => {
    doc.addPage();
    header();
    return top;
  };

  header();
  let y = top + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(...INK);
  doc.text(`Renta ${report.year}`, margin, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`Solo los movimientos con efecto en la declaración. Preparado para tu asesor el ${made}.`, margin, y);
  y += 22;

  const hero = [
    { label: 'GANANCIAS Y PÉRDIDAS', value: signed(result), sub: `Base del ahorro · ${plural(report.disposals.length, 'transmisión', 'transmisiones')}` },
    { label: 'CAPITAL MOBILIARIO', value: money(capital), sub: `Base del ahorro · ${plural(countOf(capitalKinds), 'apunte', 'apuntes')}` },
    { label: 'RECOMPENSAS', value: money(rewards), sub: `Base general · ${plural(countOf(['Recompensas']), 'apunte', 'apuntes')}` },
  ];
  const heroHeight = 92;
  doc.setFillColor(...INK);
  doc.roundedRect(margin, y, inner, heroHeight, 12, 12, 'F');
  const column = inner / 3;
  hero.forEach((item, index) => {
    const x = margin + index * column + 18;
    if (index > 0) {
      doc.setDrawColor(63, 63, 70);
      doc.setLineWidth(0.6);
      doc.line(margin + index * column, y + 18, margin + index * column, y + heroHeight - 18);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...FAINT);
    tracked(item.label, x, y + 26, 1);
    doc.setFontSize(19);
    doc.setTextColor(255, 255, 255);
    doc.text(item.value, x, y + 53);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    doc.text(item.sub, x, y + 72);
  });
  y += heroHeight + 34;

  const heading = (title: string, place: string, room = 120) => {
    if (y > bottom - room) y = newPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...INK);
    doc.text(title, margin, y);
    if (place) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      const lines = doc.splitTextToSize(place, inner) as string[];
      doc.text(lines, margin, y + 14);
      y += 14 + (lines.length - 1) * 11;
    }
    y += 12;
  };

  const table = (head: string[], body: CellInput[][], foot?: CellInput[], right: number[] = [], widths: Record<number, number> = {}) => {
    const columnStyles = Object.fromEntries(head.map((_, index) => [index, { halign: right.includes(index) ? 'right' as const : 'left' as const, ...(widths[index] ? { cellWidth: widths[index] } : {}) }]));
    autoTable(doc, {
      startY: y,
      head: [head.map((title) => title.toUpperCase())],
      body: body.length ? body : [[{ content: 'Nada este año.', colSpan: head.length, styles: { textColor: MUTED, fontStyle: 'italic' } }]],
      foot: foot && body.length ? [foot] : undefined,
      margin: { left: margin, right: margin, top, bottom: 64 },
      theme: 'plain',
      showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: BODY, cellPadding: { top: 6.5, bottom: 6.5, left: 0, right: 10 }, lineColor: LINE, lineWidth: { bottom: 0.5 }, valign: 'middle' },
      headStyles: { fontStyle: 'bold', fontSize: 6.5, textColor: MUTED, lineColor: INK, lineWidth: { bottom: 0.8 }, cellPadding: { top: 4, bottom: 6, left: 0, right: 10 } },
      footStyles: { fontStyle: 'bold', textColor: INK, lineColor: INK, lineWidth: { top: 0.8 } },
      columnStyles,
      didParseCell: (data) => {
        const align = right.includes(data.column.index) ? 'right' : 'left';
        data.cell.styles.halign = align;
        if (data.column.index === head.length - 1) data.cell.styles.cellPadding = { ...(data.section === 'head' ? { top: 4, bottom: 6 } : { top: 6.5, bottom: 6.5 }), left: 0, right: 0 };
      },
      didDrawPage: () => header(),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;
  };

  const bold = (value: number): CellInput => ({ content: money(value), styles: { fontStyle: 'bold', textColor: INK } });
  const dividends = incomeOf(['Dividendos']);
  heading('Dónde va cada importe en Renta Web', 'Cada bloque corresponde a un apartado de la declaración. Casillas de la Renta 2025; Hacienda suele mantenerlas de un año a otro.');
  const places: CellInput[][] = [
    ['Monedas virtuales', '1800 a 1814', 'Ventas, cambios entre criptos distintas y comisiones pagadas en cripto. Una fila por moneda y clave (tabla 1).', toned(cryptoResult, true)],
    ...(others.length ? [['Acciones y ETF', '0328 y 0331', 'Ventas de acciones y fondos cotizados: valor de transmisión y de adquisición (tabla 1).', toned(othersResult, true)] as CellInput[]] : []),
    ['Intereses y staking', '0027', 'Intereses de Earn y cuentas remuneradas, y rendimientos de staking (tabla 2).', bold(capital - dividends)],
    ...(dividends > 0 ? [['Dividendos', '0029', 'Importe bruto. La retención en el extranjero se deduce en la 0588.', bold(dividends)] as CellInput[]] : []),
    ['Otras ganancias sin transmisión', '0304', 'Recompensas y airdrops. Van a la base general (tabla 3).', bold(rewards)],
  ];
  table(['Apartado', 'Casilla', 'Qué incluye', 'Importe'], places, undefined, [3], { 0: 110, 1: 62, 3: 80 });

  const comp = report.compensation;
  heading('Base del ahorro y cuota estimada', 'Compensación de pérdidas como la hace Renta Web (art. 49 LIRPF) y escala del ahorro del 19 % al 30 % (arts. 66 y 76 LIRPF).');
  const baseRows: CellInput[][] = [
    ['Ganancias y pérdidas del año', 'Ventas y cambios que tributan', toned(comp.gains)],
    ...(sum(report.disposals, (item) => item.deferred) > 0 ? [['Pérdida que se aplaza', 'Regla de los dos meses: ya descontada de la línea de arriba', money(sum(report.disposals, (item) => item.deferred))] as CellInput[]] : []),
    ['Rendimientos del capital mobiliario', 'Intereses, staking y dividendos', money(comp.capital)],
    ...(comp.cross > 0 ? [['Pérdida del año contra rendimientos', 'Hasta el 25 % de los rendimientos', toned(-comp.cross)] as CellInput[]] : []),
    ...comp.prior.map((item) => [`Pérdidas de ${item.year}`, item.against === 'ganancias' ? 'Restadas de las ganancias del año' : 'Restadas de los rendimientos, dentro del 25 %', toned(-item.amount)] as CellInput[]),
    [{ content: 'Base imponible del ahorro', styles: { fontStyle: 'bold', textColor: INK } }, '', bold(comp.base)],
    [{ content: 'Cuota estimada', styles: { fontStyle: 'bold', textColor: INK } }, 'Antes de retenciones y deducciones', bold(comp.tax)],
  ];
  table(['Concepto', 'Detalle', 'Importe'], baseRows, undefined, [2], { 0: 190, 2: 90 });
  if (comp.pending.length) {
    heading('Pérdidas para los próximos años', 'Se compensan en los cuatro años siguientes. Renta Web las pide en el apartado de partidas pendientes.');
    table(['Año de la pérdida', 'Pendiente', 'Último año para usarla'], comp.pending.map((item) => [String(item.year), money(item.amount), String(item.until)]), undefined, [1, 2]);
  }

  const groups = [...new Set(crypto.map((item) => `${item.asset}|${item.key}`))].sort();
  heading('1. Ganancias y pérdidas por transmisión', 'Base del ahorro. En Renta Web, una fila por moneda (1802) y por lo recibido a cambio (1803): F euros, N otra cripto, B bienes o servicios.');
  table(
    ['Moneda · 1802', 'Recibido · 1803', 'Transmisión · 1804', 'Adquisición · 1806', 'Resultado'],
    [
      ...groups.map((group) => {
        const [coin, key] = group.split('|') as [string, keyof typeof KEY_LABEL];
        const rows = crypto.filter((item) => item.asset === coin && item.key === key);
        return [coin, KEY_LABEL[key], money(sum(rows, (item) => item.proceeds)), money(sum(rows, (item) => item.cost)), toned(sum(rows, (item) => item.gain))];
      }),
      ...(others.length ? [['Acciones y ETF', '0328 · 0331', money(sum(others, (item) => item.proceeds)), money(sum(others, (item) => item.cost)), toned(othersResult)] as CellInput[]] : []),
    ],
    ['Total', '', money(sum(report.disposals, (item) => item.proceeds)), money(sum(report.disposals, (item) => item.cost)), toned(result, true)],
    [2, 3, 4],
  );

  heading('2. Rendimientos del capital mobiliario', 'Base del ahorro. Valorados en euros el día en que los recibiste.');
  table(
    ['Concepto', 'Casilla', 'Apuntes', 'Importe'],
    ([['Intereses', 'Intereses de Earn y cuentas remuneradas', '0027'], ['Staking', 'Staking', '0027'], ['Dividendos', 'Dividendos (bruto)', '0029']] as const)
      .filter(([kind]) => countOf([kind]) > 0)
      .map(([kind, label, box]) => [label, box, String(countOf([kind])), money(incomeOf([kind]))]),
    ['Total', '', String(countOf(capitalKinds)), money(capital)],
    [2, 3],
  );

  heading('3. Ganancias patrimoniales sin transmisión', 'Base general, casilla 0304. Recompensas y airdrops, valorados el día en que entraron.');
  table(
    ['Mes', 'Activo', 'Plataforma', 'Importe'],
    report.incomes.filter((item) => item.kind === 'Recompensas').map((item) => [monthName(item.month), item.asset, item.platform, money(item.eur)]),
    ['Total', '', '', money(rewards)],
    [3],
  );

  const countEffect = (effect: string) => report.lines.filter((line) => line.effect === effect).length;
  const buys = report.lines.filter((line) => line.effect === EFFECT.buy).length;
  const outside: CellInput[][] = [
    ...(buys ? [['Compras', 'Lo que entra al comprar no tributa: queda apuntado como coste para cuando vendas.', String(buys)]] : []),
    ...(ownMoves ? [['Traspasos y Earn', 'Mover monedas entre tus cuentas o a Earn: siguen siendo tuyas.', String(ownMoves)]] : []),
    ...(countEffect(EFFECT.euros) ? [['Movimientos en euros', 'Nómina, gastos y euros que metes o sacas: no son inversiones.', String(countEffect(EFFECT.euros))]] : []),
    ...(report.rewraps.length ? [['Mismo activo en otro formato', 'Por ejemplo, ETH en staking como WBETH. Detalle debajo.', String(report.rewraps.length)]] : []),
  ];
  heading('Lo que no tributa', 'Movimientos revisados que no van a la declaración.');
  table(['Tipo', 'Por qué no tributa', 'Movimientos'], outside, undefined, [2], { 0: 150, 2: 70 });
  if (report.rewraps.length) {
    heading('Cambios de formato del mismo activo', 'El coste original pasa intacto a lo recibido.');
    table(
      ['Fecha', 'Cambio', 'Plataforma', 'Coste que se conserva'],
      report.rewraps.map((item) => [day(item.date), `De ${qty(item.fromQuantity)} ${item.from} a ${qty(item.toQuantity)} ${item.to}`, item.platform, money(item.cost)]),
      undefined,
      [3],
      { 0: 70 },
    );
  }

  heading('Detalle de las transmisiones', 'Cada operación que tributa, con su coste de adquisición por FIFO.');
  table(
    ['Fecha', 'Activo', 'Operación', 'Cantidad', 'Transmisión', 'Adquisición', 'Resultado'],
    report.disposals.map((item) => [day(item.date), item.asset, item.kind, qty(item.quantity), money(item.proceeds), money(item.cost), toned(item.gain)]),
    ['Total', '', '', '', money(sum(report.disposals, (item) => item.proceeds)), money(sum(report.disposals, (item) => item.cost)), toned(result, true)],
    [3, 4, 5, 6],
  );

  const deferred = report.disposals.filter((item) => item.deferred > 0);
  if (deferred.length) {
    heading('Pérdidas aplazadas por recompra', 'Compraste el mismo valor en los dos meses anteriores o posteriores (art. 33.5.f LIRPF). Esa parte se aplica cuando vendas lo recomprado.');
    table(
      ['Fecha', 'Valor', 'Pérdida', 'Aplazada', 'Se aplica ahora'],
      deferred.map((item) => [day(item.date), item.asset, toned(item.gain), money(item.deferred), toned(item.gain + item.deferred)]),
      undefined,
      [2, 3, 4],
    );
  }

  const end = report.yearEnd;
  if (end.coins.length) {
    const when = end.live ? 'hoy' : `31/12/${report.year}`;
    heading(end.live ? 'Tu cripto a día de hoy' : `Tu cripto a 31 de diciembre de ${report.year}`, `Lo que mide el modelo 721: cripto que guarda por ti un exchange extranjero. Tus monederos propios y las entidades españolas no cuentan.${end.live ? ' El año aún no ha cerrado; la foto que vale es la del 31 de diciembre.' : ''}`);
    table(
      ['Plataforma', 'Moneda', 'Cantidad', `Valor ${when}`, 'Modelo 721'],
      end.coins.map((coin) => [coin.platform, coin.asset, qty(coin.quantity), coin.eur == null ? '-' : money(coin.eur), !coin.custodian ? 'No: monedero propio' : coin.spanish ? 'No: entidad española' : 'Cuenta']),
      ['En exchanges extranjeros', '', '', money(end.abroad), end.abroad > ABROAD_LIMIT ? 'Toca presentarlo' : 'No llega a 50.000 €'],
      [2, 3],
    );
  }

  heading('Obligaciones y plazos', 'Lo que Hacienda puede pedirte por este ejercicio y si te toca según tus datos en Balance.');
  table(['Qué', 'Cuándo', 'Tu caso'], taxDuties(report, money), undefined, [], { 0: 130, 1: 120 });

  if (report.warnings.length) {
    const lines = report.warnings.flatMap((warning) => doc.splitTextToSize(warning, inner - 32) as string[]);
    const boxHeight = 34 + lines.length * 11 + (report.warnings.length - 1) * 4;
    if (y + boxHeight > bottom) y = newPage();
    doc.setFillColor(...WARN_BG);
    doc.roundedRect(margin, y - 4, inner, boxHeight, 10, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...WARN);
    doc.text('Para revisar con tu asesor', margin + 16, y + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    let line = y + 30;
    for (const warning of report.warnings) {
      const wrapped = doc.splitTextToSize(warning, inner - 32) as string[];
      doc.text(wrapped, margin + 16, line);
      line += wrapped.length * 11 + 4;
    }
    y += boxHeight + 26;
  }

  heading('Criterios del cálculo', '', 90);
  y += 6;
  const notes = taxCriteria(report);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const note of notes) {
    const wrapped = doc.splitTextToSize(note, inner - 14) as string[];
    if (y + wrapped.length * 12 > bottom) y = newPage();
    doc.setFillColor(...INK);
    doc.circle(margin + 2, y - 2.8, 1.3, 'F');
    doc.setTextColor(...BODY);
    doc.text(wrapped, margin + 14, y);
    y += wrapped.length * 12 + 5;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(margin, height - 46, width - margin, height - 46);
    drawScale(doc, margin, height - 36, 11);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...INK);
    doc.text('Balance', margin + 16, height - 28);
    const brand = doc.getTextWidth('Balance');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text('·  Documento de apoyo para tu asesor fiscal. No sustituye a la declaración.', margin + 16 + brand + 5, height - 28);
    doc.text(`Página ${page} de ${pages}`, width - margin, height - 28, { align: 'right' });
  }
  return doc;
}

export async function downloadTaxPdf(report: TaxReport, owner: string): Promise<void> {
  const doc = await buildTaxPdf(report, owner);
  doc.save(`Balance-Renta-${report.year}.pdf`);
}
