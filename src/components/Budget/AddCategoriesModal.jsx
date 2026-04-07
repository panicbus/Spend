import React, { useEffect, useState } from 'react';
import { useCategories } from '../../hooks/useCategories';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import './AddCategoriesModal.css';

export function AddCategoriesModal({ isOpen, groupId, onClose }) {
  const { createCategory, loading } = useCategories();
  const [line, setLine] = useState('');
  const [queued, setQueued] = useState([]);

  useEffect(() => {
    if (!isOpen) {
      setQueued([]);
      setLine('');
    }
  }, [isOpen]);

  const enqueue = () => {
    const t = line.trim();
    if (!t) return;
    setQueued((q) => [...q, t]);
    setLine('');
  };

  const finish = async () => {
    if (!groupId) return;
    const last = line.trim();
    const names = last ? [...queued, last] : queued;
    for (const n of names) {
      await createCategory({ group_id: groupId, name: n });
    }
    onClose();
  };

  const skip = () => {
    onClose();
  };

  return (
    <Modal
      title="Add categories to this group"
      isOpen={isOpen}
      onClose={onClose}
    >
      <p className="add-cat__hint">
        Add line items you want to budget for in this group (for example
        &quot;Rent&quot;, &quot;Groceries&quot;).
      </p>

      <div className="add-cat__field">
        <label className="add-cat__label" htmlFor="cat-line">
          Category name
        </label>
        <div className="add-cat__row">
          <input
            id="cat-line"
            className="add-cat__input"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                enqueue();
              }
            }}
            placeholder="e.g. Groceries"
          />
          <Button type="button" variant="ghost" onClick={enqueue}>
            Queue
          </Button>
        </div>
      </div>

      {queued.length > 0 && (
        <ul className="add-cat__queued">
          {queued.map((n, i) => (
            <li key={`${n}-${i}`} className="add-cat__queued-item">
              {n}
            </li>
          ))}
        </ul>
      )}

      <div className="add-cat__actions">
        <Button variant="ghost" onClick={skip} disabled={loading}>
          Skip for now
        </Button>
        <Button
          variant="primary"
          onClick={finish}
          disabled={loading || (queued.length === 0 && !line.trim())}
        >
          Save categories
        </Button>
      </div>
    </Modal>
  );
}
