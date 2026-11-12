/** Trazos de la balanza de Balance, en una caja de 32×32. */
export const SCALE_PATHS = {
  post: 'M16 6.5v18.5M12 25h8',
  beam: 'M5.5 9.5h21',
  left: 'M8 9.5 5.4 16c.75.75 1.8 1.15 2.6 1.15S10 16.75 10.6 16L8 9.5z',
  right: 'M24 9.5 21.4 16c.75.75 1.8 1.15 2.6 1.15s1.85-.4 2.6-1.15L24 9.5z',
};

function scaleSvg(ink: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="3 4 26 23">
  <rect x="3" y="4" width="26" height="23" fill="#ffffff"/>
  <g fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="${SCALE_PATHS.post}"/><path d="${SCALE_PATHS.beam}"/><path d="${SCALE_PATHS.left}"/><path d="${SCALE_PATHS.right}"/>
  </g>
</svg>`;
}

/** La balanza de Balance en negro sobre blanco, como PNG para el Excel y el PDF. Proporción 26:23. */
export async function brandMarkPng(width = 260): Promise<{ dataUrl: string; blob: Blob; ratio: number } | null> {
  const ratio = 23 / 26;
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(scaleSvg('#0a0a0a'))}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width * ratio);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? { dataUrl, blob, ratio } : null;
  } catch {
    return null;
  }
}
