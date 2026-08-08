import { useState } from 'react';

// Confirmação inline (sem window.confirm) — ver PROJECT_SPEC.md, nota sobre o
// bug do confirm() dentro do iframe do protótipo antigo.
export default function ConfirmInline({ label = 'Cancelar', confirmLabel = 'Confirmar', onConfirm, disabled }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className="btn btn-danger-outline" disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }

  return (
    <span className="confirm-inline">
      <span className="confirm-inline-text">Tem certeza?</span>
      <button
        type="button"
        className="btn btn-danger"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          try {
            await onConfirm();
          } finally {
            setLoading(false);
            setConfirming(false);
          }
        }}
      >
        {loading ? 'Cancelando…' : confirmLabel}
      </button>
      <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => setConfirming(false)}>
        Voltar
      </button>
    </span>
  );
}
