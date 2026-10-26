import { useEffect, useRef } from 'react';
export function ConfirmDialog({ title, description, confirmLabel, cancelLabel = 'Cancel', tone = 'danger', busy, onConfirm, onClose }: { title: string; description: string; confirmLabel: string; cancelLabel?: string; tone?: 'danger' | 'brand'; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} aria-labelledby="confirm-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="confirm-title">{title}</h2><p>{description}</p>
    <div className="dialog-actions"><button className="btn-ghost" autoFocus disabled={busy} onClick={onClose}>{cancelLabel}</button><button className={tone === 'brand' ? 'btn-brand' : 'danger'} disabled={busy} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</button></div>
  </dialog>;
}
