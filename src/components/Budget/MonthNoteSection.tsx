import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../services/api';
import { dispatchMonthNotesChanged } from '../../utils/dataChanged';
import { Button } from '../common/Button';
import './MonthNoteSection.css';

type Props = { monthKey: string };

export function MonthNoteSection({ monthKey }: Props) {
  const [note, setNote] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevSaved = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const n = await api.getMonthNote(monthKey);
      setNote(n);
      prevSaved.current = n;
    } catch {
      setNote('');
      prevSaved.current = '';
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (raw: string) => {
      const next = raw.trim();
      try {
        await api.setMonthNote(monthKey, next);
        prevSaved.current = next;
        setNote(next);
        dispatchMonthNotesChanged();
      } catch {
        setNote(prevSaved.current);
      }
    },
    [monthKey]
  );

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const saveDraftAndClose = useCallback(
    async (text: string) => {
      await persist(text);
      closeModal();
    },
    [persist, closeModal]
  );

  const openModal = useCallback(() => {
    setDraft(note ?? '');
    setModalOpen(true);
  }, [note]);

  useLayoutEffect(() => {
    if (!modalOpen) return;
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPanelPos({ top: r.bottom + 8, left: r.left });
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const reposition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPanelPos({ top: r.bottom + 8, left: r.left });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void saveDraftAndClose(draft);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, draft, saveDraftAndClose]);

  useEffect(() => {
    if (!modalOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = panelRef.current;
      if (el && el.contains(e.target as Node)) return;
      void saveDraftAndClose(draft);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [modalOpen, draft, saveDraftAndClose]);

  if (loading) {
    return null;
  }

  const hasNote = (note ?? '').length > 0;

  const modal =
    modalOpen &&
    createPortal(
      <div className="month-note-modal-root" role="presentation">
        <div className="month-note-modal__backdrop" aria-hidden />
        <div
          ref={panelRef}
          className="month-note-modal__panel"
          style={{ top: panelPos.top, left: panelPos.left }}
          role="dialog"
          aria-modal="true"
          aria-label="Month note"
        >
          <textarea
            className="month-note-modal__textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            autoFocus
            aria-label="Note text"
          />
          <Button
            type="button"
            variant="primary"
            className="month-note-modal__save"
            onClick={() => void saveDraftAndClose(draft)}
          >
            Save
          </Button>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <span ref={anchorRef} className="month-note-section__anchor">
        {hasNote ? (
          <button
            type="button"
            className="month-note-section__link month-note-section__link--has"
            onClick={openModal}
          >
            There&apos;s a note for this month
          </button>
        ) : (
          <button
            type="button"
            className="month-note-section__link"
            onClick={openModal}
          >
            + Add a note for this month
          </button>
        )}
      </span>
      {modal}
    </>
  );
}
