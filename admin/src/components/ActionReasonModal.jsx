import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ActionReasonModal({ title, description, confirmLabel, destructive = false, onCancel, onConfirm }) {
  const dialog = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const errorId = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submitted = useRef(false);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  function submit(event) {
    event.preventDefault();
    if (submitted.current) return;
    const value = reason.trim();
    if (value.length < 3 || value.length > 500) {
      setError('Informe um motivo com 3 a 500 caracteres.');
      return;
    }
    submitted.current = true;
    onConfirm(value);
  }

  return createPortal(
    <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-6 text-ink shadow-xl backdrop:bg-black/40 sm:p-8">
      <form onSubmit={submit} noValidate>
        <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
        <p id={descriptionId} className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-600">{description}</p>
        <label htmlFor={reasonId} className="mt-5 block text-sm font-medium text-primary">Motivo da ação</label>
        <textarea id={reasonId} autoFocus rows={4} maxLength={500} value={reason}
          onChange={(event) => { setReason(event.target.value); setError(''); }}
          aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
          placeholder="Descreva o motivo (3 a 500 caracteres)"
          className="mt-2 block w-full resize-y rounded-xl border border-slate-300 bg-surface p-3 text-ink placeholder:text-slate-500" />
        <p className="mt-2 text-right text-xs text-slate-500">{reason.length}/500 caracteres</p>
        {error && <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-primary hover:bg-surface">Cancelar</button>
          <button type="submit" className={`rounded-lg px-4 py-3 text-sm font-medium text-white ${destructive ? 'bg-[#EF4444] hover:bg-red-600' : 'bg-brand-700 hover:bg-brand-600'}`}>{confirmLabel}</button>
        </div>
      </form>
    </dialog>, document.body
  );
}
