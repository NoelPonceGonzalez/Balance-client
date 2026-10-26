import { formatDay, formatEur, formatSignedEur } from '@/lib/format';
import type { PlanMonthView } from '@/lib/types';

export interface PlanImageInput {
  name: string;
  title: string;
  todayLabel: string;
  today: number;
  target: number;
  months: PlanMonthView[];
  capturedOn: string;
}

const WIDTH = 1080;
const MARGIN = 40;
const ROW = 76;

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function lineCount(months: PlanMonthView[]): number {
  return months.reduce((sum, month) => sum + month.lines.length, 0);
}

export async function renderPlanPng(input: PlanImageInput): Promise<Blob> {
  await document.fonts.ready;
  const rows = lineCount(input.months);
  const height = 430 + input.months.length * 92 + rows * ROW;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.max(height, 720);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se ha podido crear la imagen.');

  ctx.fillStyle = '#f2f2f7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(MARGIN, MARGIN, WIDTH - MARGIN * 2, canvas.height - MARGIN * 2, 36);
  ctx.fill();

  let y = MARGIN + 56;
  ctx.fillStyle = '#6e6e73';
  ctx.font = '600 22px Inter, sans-serif';
  ctx.fillText('PLAN', MARGIN + 40, y);
  ctx.textAlign = 'right';
  ctx.fillText(formatDay(input.capturedOn), WIDTH - MARGIN - 40, y);
  ctx.textAlign = 'left';

  y += 52;
  ctx.fillStyle = '#1c1c1e';
  ctx.font = '800 46px Inter, sans-serif';
  ctx.fillText(fit(ctx, input.name, WIDTH - MARGIN * 2 - 80), MARGIN + 40, y);

  y += 36;
  ctx.fillStyle = '#6e6e73';
  ctx.font = '600 24px Inter, sans-serif';
  ctx.fillText(fit(ctx, input.title, WIDTH - MARGIN * 2 - 80), MARGIN + 40, y);

  y += 64;
  ctx.fillStyle = '#6e6e73';
  ctx.font = '700 22px Inter, sans-serif';
  ctx.fillText(input.todayLabel, MARGIN + 40, y);
  y += 58;
  ctx.fillStyle = '#1c1c1e';
  ctx.font = '800 54px Inter, sans-serif';
  ctx.fillText(formatEur(input.today), MARGIN + 40, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6e6e73';
  ctx.font = '700 24px Inter, sans-serif';
  ctx.fillText(`de ${formatEur(input.target)}`, WIDTH - MARGIN - 40, y);
  ctx.textAlign = 'left';

  y += 28;
  const barX = MARGIN + 40;
  const barW = WIDTH - MARGIN * 2 - 80;
  ctx.fillStyle = '#e5e5ea';
  ctx.beginPath();
  ctx.roundRect(barX, y, barW, 16, 8);
  ctx.fill();
  const ratio = input.target > 0 ? Math.max(0, Math.min(1, input.today / input.target)) : 0;
  if (ratio > 0) {
    ctx.fillStyle = '#1c1c1e';
    ctx.beginPath();
    ctx.roundRect(barX, y, Math.max(16, barW * ratio), 16, 8);
    ctx.fill();
  }

  y += 56;
  for (const month of input.months) {
    ctx.fillStyle = '#1c1c1e';
    ctx.font = '800 30px Inter, sans-serif';
    ctx.fillText(month.title, MARGIN + 40, y);
    y += 18;
    ctx.strokeStyle = '#e5e5ea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MARGIN + 40, y);
    ctx.lineTo(WIDTH - MARGIN - 40, y);
    ctx.stroke();
    y += 8;
    for (const line of month.lines) {
      const mid = y + ROW / 2;
      const marked = Boolean(line.markKey);
      if (marked) {
        ctx.beginPath();
        ctx.arc(MARGIN + 62, mid, 14, 0, Math.PI * 2);
        if (line.paid) {
          ctx.fillStyle = '#16c784';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(MARGIN + 55, mid);
          ctx.lineTo(MARGIN + 60, mid + 6);
          ctx.lineTo(MARGIN + 71, mid - 7);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#c7c7cc';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
      const labelX = marked ? MARGIN + 96 : MARGIN + 40;
      const amount = line.amount == null ? formatEur(line.balance) : formatSignedEur(line.amount);
      ctx.font = '800 26px Inter, sans-serif';
      const amountW = ctx.measureText(amount).width;
      ctx.textAlign = 'right';
      ctx.fillStyle = !marked || line.paid ? toneColor(line.tone) : '#aeaeb2';
      ctx.fillText(amount, WIDTH - MARGIN - 40, mid + 9);
      ctx.textAlign = 'left';
      ctx.font = line.tone === 'final' || line.tone === 'plain' ? '700 26px Inter, sans-serif' : '600 26px Inter, sans-serif';
      ctx.fillStyle = !marked || line.paid ? '#1c1c1e' : '#8e8e93';
      ctx.fillText(fit(ctx, line.label, WIDTH - MARGIN * 2 - (labelX - MARGIN) - amountW - 80), labelX, mid + 9);
      y += ROW;
    }
    y += 28;
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se ha podido crear la imagen.');
  return blob;
}

function toneColor(tone: PlanMonthView['lines'][number]['tone']): string {
  if (tone === 'in' || tone === 'final') return '#16c784';
  if (tone === 'out') return '#ea3943';
  return '#1c1c1e';
}

export function planImageFileName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'plan'}.png`;
}
