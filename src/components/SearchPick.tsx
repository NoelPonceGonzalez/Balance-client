/**
 * Selector de sitio o pieza (Bloque E). Con pocas opciones es el `select` nativo de siempre (el mejor en móvil
 * y con teclado). Con muchas, el campo abre una hoja pequeña con búsqueda (la misma comparación sin acentos
 * del buscador del dock, `matchesSearch`), lista navegable con flechas y Enter, y la opción elegida marcada.
 * No añade datos ni opciones: solo ayuda a encontrar la que ya existe.
 */
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { matchesSearch } from '@/components/dock/dock-search';
import { Field, fieldClass } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

export interface PickOption {
  id: string;
  label: string;
}

/** A partir de cuántas opciones merece la pena buscar. */
export const PICK_SEARCH_FROM = 9;

export function SearchPick({ label, value, options, onChange, empty }: {
  label: string;
  value: string;
  options: PickOption[];
  onChange: (id: string) => void;
  /** Texto de la opción vacía («Elige», «Solo euros»…). Sin él, no hay opción vacía. */
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  if (options.length < PICK_SEARCH_FROM) {
    return (
      <Field label={label}>
        <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
          {empty != null && <option value="">{empty}</option>}
          {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </Field>
    );
  }
  const shown = options.find((item) => item.id === value)?.label;
  return (
    <div className="block space-y-1.5">
      <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${shown || empty || 'sin elegir'}`}
        onClick={() => setOpen(true)}
        className={cn(fieldClass, 'flex items-center justify-between gap-2 text-left')}
      >
        <span className={cn('truncate', !shown && 'text-slate-400')}>{shown || empty || 'Elige'}</span>
        <ChevronDown size={16} className="shrink-0 text-slate-400" aria-hidden />
      </button>
      {open && (
        <PickSheet
          label={label}
          value={value}
          options={empty != null ? [{ id: '', label: empty }, ...options] : options}
          onPick={(id) => { onChange(id); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function PickSheet({ label, value, options, onPick, onClose }: { label: string; value: string; options: PickOption[]; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => options.filter((item) => item.id === '' ? !query.trim() : matchesSearch(query, item.label)), [options, query]);
  const [active, setActive] = useState(() => Math.max(0, list.findIndex((item) => item.id === value)));
  const at = Math.min(active, Math.max(0, list.length - 1));
  const base = useId();
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(Math.min(list.length - 1, at + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(0, at - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (list[at]) onPick(list[at].id); }
  };
  return (
    <Modal title={label} onClose={onClose} compact>
      <label className="relative block">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          autoFocus
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={`${base}-list`}
          aria-activedescendant={list[at] ? `${base}-${at}` : undefined}
          aria-label={`Buscar ${label.toLowerCase()}`}
          placeholder="Buscar"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={onKey}
          className={cn(fieldClass, 'pl-10')}
        />
      </label>
      <ul id={`${base}-list`} role="listbox" aria-label={label} className="no-scrollbar mt-3 max-h-[45dvh] overflow-y-auto overscroll-contain">
        {list.map((item, index) => {
          const on = item.id === value;
          return (
            <li
              key={item.id || 'vacía'}
              id={`${base}-${index}`}
              role="option"
              aria-selected={on}
              onClick={() => onPick(item.id)}
              onPointerMove={() => setActive(index)}
              className={cn('flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium', index === at && 'bg-slate-100 dark:bg-white/[0.08]', item.id === '' && 'text-slate-500')}
            >
              <span className="min-w-0 truncate">{item.label}</span>
              {on && <Check size={16} strokeWidth={2.5} className="shrink-0 text-slate-900 dark:text-white" aria-hidden />}
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm font-medium text-slate-400">Nada con «{query.trim()}»</li>}
      </ul>
    </Modal>
  );
}
