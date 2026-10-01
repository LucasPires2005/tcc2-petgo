export default function EmptyState({ title, children }) {
  return <div role="status" className="admin-card mt-5 px-6 py-10 text-center">
    <span aria-hidden="true" className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-brand-700">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8 9h8M8 13h5" /></svg>
    </span>
    <h2 className="text-base font-semibold">{title}</h2>
    <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500">{children}</p>
  </div>;
}
