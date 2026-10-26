import { getInitials } from '../../lib/format.js';

// Light background + dark text pairs that all meet WCAG AA contrast.
const PALETTE = [
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-900',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
];

function colorFor(seed = '') {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Decorative; `online` adds a green dot, so callers should also say "online" in text. */
export function Avatar({ name, seed, size = 'md', online = false }) {
  const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-11 text-sm' };
  return (
    <span
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center rounded-full font-semibold ${sizes[size]} ${colorFor(seed ?? name)}`}
    >
      {getInitials(name)}
      {online && (
        <span className="absolute right-0 bottom-0 size-3 rounded-full bg-emerald-500 ring-2 ring-white" />
      )}
    </span>
  );
}
