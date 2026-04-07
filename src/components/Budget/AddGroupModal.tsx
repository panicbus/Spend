import React, { useEffect, useState } from 'react';
import { CATEGORY_COLOR_PRESETS } from '../../services/formatters';
import { useCategories } from '../../hooks/useCategories';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import './AddGroupModal.css';

type AddGroupModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
};

export function AddGroupModal({ isOpen, onClose, onCreated }: AddGroupModalProps) {
  const { createGroup, loading } = useCategories();
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLOR_PRESETS[0].value);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setColor(CATEGORY_COLOR_PRESETS[0].value);
    }
  }, [isOpen]);

  const submit = async () => {
    const n = name.trim();
    if (!n) return;
    const { id } = await createGroup({ name: n, color });
    onCreated(id);
    onClose();
  };

  return (
    <Modal title="New category group" isOpen={isOpen} onClose={onClose}>
      <div className="add-group__field">
        <label className="add-group__label" htmlFor="group-name">
          Group name
        </label>
        <input
          id="group-name"
          className="add-group__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Housing"
        />
      </div>

      <div className="add-group__field">
        <div className="add-group__label">Color</div>
        <div className="add-group__swatches" role="list">
          {CATEGORY_COLOR_PRESETS.map((c) => {
            const active = c.value === color;
            return (
              <button
                key={c.value}
                type="button"
                className={`add-group__swatch${active ? ' add-group__swatch--active' : ''}`}
                aria-label={c.label}
                aria-pressed={active}
                onClick={() => setColor(c.value)}
              >
                <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden>
                  <circle cx="16" cy="16" r="14" fill={c.value} />
                </svg>
              </button>
            );
          })}
        </div>
      </div>

      <div className="add-group__actions">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void submit()} disabled={loading || !name.trim()}>
          Create group
        </Button>
      </div>
    </Modal>
  );
}
