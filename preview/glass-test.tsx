import { createRoot } from 'react-dom/client';
import { useMotionValue } from 'motion/react';
import '../src/index.css';
import { GlassLens } from '@/components/LiquidGlass';
import { GlassCapsule } from '@/components/dock/GlassCapsule';
const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
const W = Number(params.get('w') || 358);
const stripes = 'repeating-linear-gradient(90deg,#22d3ee 0 36px,#a3e635 36px 72px,#f472b6 72px 108px,#111 108px 144px)';
function App() {
  const x = useMotionValue(16); const w = useMotionValue(W);
  return (<div style={{ position: 'relative', height: 300 }}>
    <div style={{ position: 'absolute', inset: 0, background: stripes }} />
    <div style={{ position: 'absolute', left: 16, top: 30, width: W, height: 56 }} className="rounded-full">
      <div className="liquid-glass pointer-events-none absolute inset-0 rounded-full"><GlassLens /></div>
    </div>
    <div style={{ position: 'absolute', left: 0, top: 150, height: 56, width: '100%' }} id="cap"><GlassCapsule x={x} width={w} height={56} /></div>
  </div>);
}
createRoot(document.getElementById('root')!).render(<App />);
