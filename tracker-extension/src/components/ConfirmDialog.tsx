import { useEffect, useRef } from 'react';
export function ConfirmDialog({title,description,confirmLabel,busy,onConfirm,onClose}:{title:string;description:string;confirmLabel:string;busy:boolean;onConfirm:()=>void;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>{dialog?.close();};},[]);
  return <dialog ref={ref} aria-labelledby="confirm-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><h2 id="confirm-title">{title}</h2><p>{description}</p><div className="dialog-actions"><button autoFocus disabled={busy} onClick={onClose}>Cancel</button><button className="danger" disabled={busy} onClick={onConfirm}>{busy?'Please wait…':confirmLabel}</button></div></dialog>;
}
