import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, X } from 'lucide-react';

interface ApiKeyModalProps {
  open: boolean;
  hasApiKey: boolean;
  onClose: () => void;
  onSave: (apiKey: string) => Promise<void>;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  open,
  hasApiKey,
  onClose,
  onSave,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError('Please enter your Gemini API key.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setApiKey('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-modal-title"
        className="w-full max-w-md rounded-2xl border-2 border-slate-900 bg-[#FFFDF7] p-6 shadow-[6px_6px_0px_#0f172a]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-slate-900 bg-amber-400 text-slate-950">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="api-key-modal-title"
                className="font-display text-xl font-extrabold text-slate-900"
              >
                {hasApiKey ? 'Update Gemini API Key' : 'Enter Gemini API Key'}
              </h2>
              <p className="text-xs font-medium text-slate-600">
                Saved locally in <code className="font-mono">.env</code> on this machine
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="gemini-api-key-input"
              className="block text-xs font-bold uppercase tracking-wide text-slate-700"
            >
              GEMINI_API_KEY
            </label>
            <div className="relative mt-1.5">
              <input
                ref={inputRef}
                id="gemini-api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza..."
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border-2 border-slate-900 bg-white py-2.5 pl-3.5 pr-11 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl border-2 border-slate-900 bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-[3px_3px_0px_#0f172a] hover:bg-amber-300 disabled:cursor-wait disabled:opacity-75 cursor-pointer"
            >
              {saving ? 'Saving…' : 'Save Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
