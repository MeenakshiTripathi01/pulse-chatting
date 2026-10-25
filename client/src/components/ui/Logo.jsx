export function Logo({ compact = false }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6Z"
          />
          <path strokeLinecap="round" d="M8 10.5h2l1.5-3 2 6 1.5-3h1" />
        </svg>
      </span>
      {!compact && <span className="text-lg tracking-tight">Pulse Chat</span>}
    </span>
  );
}
