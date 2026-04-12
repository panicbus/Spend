import React, { useCallback, useMemo, useState } from 'react';
import type {
  CreateCategoryForImportPayload,
  GroupWithCategories,
} from '../../../ipc-contract';
import { CATEGORY_COLOR_PRESETS } from '../../services/formatters';
import { api } from '../../services/api';
import { Button } from '../common/Button';

const CREATE_NEW_GROUP = '__new_group__';

function defaultUnusedColor(groups: GroupWithCategories[]): string {
  const used = new Set(groups.map((g) => g.color.toLowerCase()));
  for (const p of CATEGORY_COLOR_PRESETS) {
    if (!used.has(p.value.toLowerCase())) return p.value;
  }
  return CATEGORY_COLOR_PRESETS[0].value;
}

type ImportCreateCategoryFormProps = {
  groupsSorted: GroupWithCategories[];
  onCancel: () => void;
  onSubmitSuccess: (categoryId: number) => Promise<void>;
};

export function ImportCreateCategoryForm({
  groupsSorted,
  onCancel,
  onSubmitSuccess,
}: ImportCreateCategoryFormProps) {
  const [categoryName, setCategoryName] = useState('');
  const [groupSelect, setGroupSelect] = useState<string>(() => {
    if (groupsSorted.length === 0) return CREATE_NEW_GROUP;
    return String(groupsSorted[0].id);
  });
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(() =>
    defaultUnusedColor(groupsSorted)
  );
  const [categoryError, setCategoryError] = useState('');
  const [groupError, setGroupError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const showNewGroup = groupSelect === CREATE_NEW_GROUP;

  const clientValid = useMemo(() => {
    const cn = categoryName.trim();
    if (!cn) return false;
    if (showNewGroup) {
      return newGroupName.trim().length > 0;
    }
    return true;
  }, [categoryName, newGroupName, showNewGroup]);

  const submit = useCallback(async () => {
    setCategoryError('');
    setGroupError('');
    const cn = categoryName.trim();
    if (!cn) {
      setCategoryError('Enter a category name.');
      return;
    }
    if (showNewGroup && !newGroupName.trim()) {
      setGroupError('Enter a group name.');
      return;
    }

    let payload: CreateCategoryForImportPayload;
    if (showNewGroup) {
      payload = {
        categoryName: cn,
        newGroup: { name: newGroupName.trim(), color: newGroupColor },
      };
    } else {
      payload = {
        categoryName: cn,
        existingGroupId: Number(groupSelect),
      };
    }

    setSubmitting(true);
    try {
      const { categoryId } = await api.createCategoryForImport(payload);
      await onSubmitSuccess(categoryId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('A group with this name')) {
        setGroupError(msg);
      } else if (msg.startsWith('A category with this name')) {
        setCategoryError(msg);
      } else {
        setCategoryError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    categoryName,
    newGroupColor,
    newGroupName,
    onSubmitSuccess,
    groupSelect,
    showNewGroup,
  ]);

  return (
    <div className="import-create-form" onClick={(e) => e.stopPropagation()}>
      <div className="import-create-form__field">
        <input
          className="import-create-form__input"
          value={categoryName}
          onChange={(e) => {
            setCategoryName(e.target.value);
            setCategoryError('');
          }}
          placeholder="e.g. Subscriptions"
          aria-label="New category name"
          autoFocus
        />
        {categoryError ? (
          <p className="import-create-form__error">{categoryError}</p>
        ) : null}
      </div>

      <div className="import-create-form__field">
        <select
          className="import-create-form__select"
          value={groupSelect}
          onChange={(e) => {
            setGroupSelect(e.target.value);
            setGroupError('');
          }}
          aria-label="Category group"
        >
          {groupsSorted.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.name}
            </option>
          ))}
          <option value={CREATE_NEW_GROUP}>+ Create new group...</option>
        </select>
      </div>

      {showNewGroup ? (
        <div className="import-create-form__field import-create-form__field--nested">
          <input
            className="import-create-form__input"
            value={newGroupName}
            onChange={(e) => {
              setNewGroupName(e.target.value);
              setGroupError('');
            }}
            placeholder="e.g. Subscriptions & Memberships"
            aria-label="New group name"
          />
          {groupError ? (
            <p className="import-create-form__error">{groupError}</p>
          ) : null}
          <div className="import-create-form__swatches" role="list">
            {CATEGORY_COLOR_PRESETS.map((c) => {
              const active = c.value === newGroupColor;
              return (
                <button
                  key={c.value}
                  type="button"
                  className={`import-create-form__swatch${active ? ' import-create-form__swatch--active' : ''}`}
                  aria-label={c.label}
                  aria-pressed={active}
                  onClick={() => setNewGroupColor(c.value)}
                >
                  <span
                    className="import-create-form__swatch-dot"
                    style={{ background: c.value }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="import-create-form__actions">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void submit()}
          disabled={submitting || !clientValid}
        >
          Create
        </Button>
      </div>
    </div>
  );
}
