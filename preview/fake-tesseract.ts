/**
 * Lector simulado SOLO para la vista previa (Bloque D). Sustituye a tesseract.js en el empaquetador local de
 * la vista previa, que no puede cargar el motor WASM. Emite los mismos avisos que el motor real
 * (carga del motor, idiomas, «recognizing text» con progreso 0→1) con tiempos parecidos a un móvil medio,
 * y devuelve el texto de un tique sintético. No forma parte del build de producción ni lee fotos reales.
 */
type Note = { status: string; progress: number };
type Options = { logger?: (message: Note) => void };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const params = new URLSearchParams(location.search);
const LOAD_MS = Number(params.get('ocrload') || 900);
const READ_MS = Number(params.get('ocrread') || 1400);
const FAIL = params.get('ocrfail') === '1';

const TICKET = ['SUPERMERCADO EJEMPLO S.L.', 'C/ INVENTADA 1 - MADRID', 'PAN BARRA 1,20', 'LECHE ENTERA 0,95', 'TOMATES 2,35', 'TOTAL 4,50 EUR', 'TARJETA'].join('\n');

export const PSM = { SINGLE_BLOCK: '6' };

export async function createWorker(_langs: string, _oem: number, options: Options = {}) {
  const log = options.logger || (() => undefined);
  const steps = ['loading tesseract core', 'initializing tesseract', 'loading language traineddata', 'initializing api'];
  for (const status of steps) {
    log({ status, progress: 0 });
    await wait(LOAD_MS / steps.length);
    log({ status, progress: 1 });
  }
  let alive = true;
  (window as Window & { __ocr?: { workers: number } }).__ocr = { workers: ((window as Window & { __ocr?: { workers: number } }).__ocr?.workers || 0) + 1 };
  return {
    async setParameters() { return {}; },
    async recognize() {
      if (!alive) throw new Error('terminated');
      for (let i = 0; i <= 20; i += 1) {
        log({ status: 'recognizing text', progress: i / 20 });
        await wait(READ_MS / 20);
      }
      if (FAIL) throw new Error('simulado');
      return { data: { text: TICKET, blocks: null } };
    },
    async terminate() {
      alive = false;
      const bag = (window as Window & { __ocr?: { workers: number } }).__ocr;
      if (bag) bag.workers -= 1;
      return {};
    },
  };
}

export default { createWorker, PSM };
