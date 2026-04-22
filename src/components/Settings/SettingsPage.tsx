import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AppPreferences,
  CategoryMapping,
  CategoryRow,
  GroupDeletePreview,
  GroupWithCategories,
  IncomeSourceRow,
} from '../../../ipc-contract';
import { api } from '../../services/api';
import { CATEGORY_COLOR_PRESETS } from '../../services/formatters';
import { dispatchDataChanged } from '../../utils/dataChanged';
import {
  mappingAssignmentToSelectValue,
  parseMappingSelectValue,
} from '../../utils/mappingSelectValue';
import { useColorMode } from '../../theme/ColorModeContext';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { MappingTargetSelect } from '../common/MappingTargetSelect';
import './SettingsPage.css';

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '';
const IC = { chevR: '\u25B6', chevD: '\u25BC', edit: '\u270E', del: '\u00D7' };

/** Persists scroll on `main.app-shell__main` while Settings is mounted (that element is shared across routes). */
/** `v3`: re-apply scroll as settings content async-loads (early restore clamped to short layout + anchoring jumped to bottom). */
const SETTINGS_MAIN_SCROLL_KEY = 'spend-app:settings-main-scroll-y:v3';

/** Hide settings until scroll restore settles (avoids a visible jump while layout grows). */
const SCROLL_RESTORE_MASK_MIN_PX = 16;

function readPendingScrollRestoreMask(): boolean {
  try {
    const raw = sessionStorage.getItem(SETTINGS_MAIN_SCROLL_KEY);
    if (raw == null) return false;
    const y = Number(raw);
    if (Number.isNaN(y) || y < SCROLL_RESTORE_MASK_MIN_PX) return false;
    return true;
  } catch {
    return false;
  }
}

function mappingDestinationLabel(
  m: CategoryMapping,
  groups: GroupWithCategories[],
  income: IncomeSourceRow[]
): { text: string; muted: boolean; color?: string } {
  if (m.targetType === 'skip') {
    return { text: 'Skip', muted: true };
  }
  if (m.targetType === 'income_source' && m.targetId != null) {
    const name = income.find((i) => i.id === m.targetId)?.name ?? 'Income';
    return { text: name, muted: false };
  }
  if (m.targetType === 'category' && m.targetId != null) {
    for (const g of groups) {
      const c = g.categories.find((x) => x.id === m.targetId);
      if (c) {
        return {
          text: `${c.name} · ${g.name}`,
          muted: false,
          color: g.color,
        };
      }
    }
  }
  return { text: m.targetName ?? '—', muted: true };
}

export function SettingsPage() {
  const mainScrollWhileSettingsRef = useRef(0);
  /** Used so scroll handlers ignore events after the route DOM has been swapped (main still fires scroll). */
  const pageRootRef = useRef<HTMLDivElement>(null);
  const [pendingScrollMask, setPendingScrollMask] = useState(
    readPendingScrollRestoreMask
  );

  useLayoutEffect(() => {
    const main = document.querySelector(
      '.app-shell__main'
    ) as HTMLElement | null;
    if (!main) return;

    const raw = sessionStorage.getItem(SETTINGS_MAIN_SCROLL_KEY);
    const savedY =
      raw != null && !Number.isNaN(Number(raw)) && Number(raw) >= 0
        ? Number(raw)
        : null;

    const onScroll = () => {
      if (!pageRootRef.current?.isConnected) return;
      mainScrollWhileSettingsRef.current = main.scrollTop;
    };
    main.addEventListener('scroll', onScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    let stopTimer: number | undefined;

    const shouldMask =
      savedY != null && savedY >= SCROLL_RESTORE_MASK_MIN_PX;

    const revealAfterRestore = () => {
      if (!shouldMask) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPendingScrollMask(false);
        });
      });
    };

    const applyRestore = () => {
      if (savedY == null) return;
      const max = Math.max(0, main.scrollHeight - main.clientHeight);
      main.scrollTop = Math.min(savedY, max);
      mainScrollWhileSettingsRef.current = main.scrollTop;
      if (ro != null && max >= savedY - 1) {
        ro.disconnect();
        ro = null;
        if (stopTimer !== undefined) {
          clearTimeout(stopTimer);
          stopTimer = undefined;
        }
        revealAfterRestore();
      }
    };

    const pageRoot = pageRootRef.current;

    if (savedY == null) {
      main.scrollTop = 0;
      mainScrollWhileSettingsRef.current = 0;
    } else {
      applyRestore();
      requestAnimationFrame(applyRestore);
      ro = new ResizeObserver(() => {
        applyRestore();
      });
      if (pageRoot) ro.observe(pageRoot);
      ro.observe(main);
      stopTimer = window.setTimeout(() => {
        ro?.disconnect();
        ro = null;
        stopTimer = undefined;
        revealAfterRestore();
      }, 3000) as unknown as number;
    }

    return () => {
      if (stopTimer !== undefined) clearTimeout(stopTimer);
      ro?.disconnect();
      main.removeEventListener('scroll', onScroll);
      sessionStorage.setItem(
        SETTINGS_MAIN_SCROLL_KEY,
        String(mainScrollWhileSettingsRef.current)
      );
    };
  }, []);

  return (
    <div
      ref={pageRootRef}
      className={
        pendingScrollMask
          ? 'settings-page settings-page--scroll-restore-pending'
          : 'settings-page'
      }
    >
      <header className="settings-page__header">
        <h1 className="settings-page__title">Settings</h1>
        <p className="settings-page__intro">
          Manage categories, import mappings, backups, and a few app preferences.
        </p>
      </header>
      <SettingsCategoriesSection />
      <SettingsIncomeSection />
      <SettingsMappingsSection />
      <SettingsDataSection />
      <SettingsPreferencesSection />
    </div>
  );
}

function SettingsCategoriesSection() {
  const [groups, setGroups] = useState<GroupWithCategories[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [addingCatGroupId, setAddingCatGroupId] = useState<number | null>(null);
  const [deleteGroupState, setDeleteGroupState] = useState<{
    id: number;
    name: string;
    preview: GroupDeletePreview;
    moveToId: number | '';
  } | null>(null);
  const [deleteCatState, setDeleteCatState] = useState<{
    id: number;
    name: string;
    tx: number;
    budgets: number;
  } | null>(null);

  const reload = useCallback(async () => {
    const g = await api.getGroups();
    setGroups(g ?? []);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const gr of g ?? []) {
        if (!next.has(gr.id)) next.add(gr.id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Categories &amp; Groups</h2>
      <p className="settings-section__desc">
        Rename, recolor, reorder, and organize your budget groups and categories.
      </p>
      <div className="settings-card">
        {groups.length === 0 ? (
          <p className="settings-empty">
            No groups yet. Add a group below, or create categories from the
            Budget screen.
          </p>
        ) : (
          groups.map((g, gi) => (
            <div key={g.id} className="settings-group">
              {editingGroupId === g.id ? (
                <GroupEditForm
                  group={g}
                  onCancel={() => setEditingGroupId(null)}
                  onSaved={async () => {
                    setEditingGroupId(null);
                    await reload();
                    dispatchDataChanged();
                  }}
                />
              ) : (
                <div className="settings-group-head">
                  <button
                    type="button"
                    className="settings-chevron"
                    aria-expanded={expanded.has(g.id)}
                    onClick={() => toggleExpand(g.id)}
                  >
                    {expanded.has(g.id) ? IC.chevD : IC.chevR}
                  </button>
                  <span
                    className="settings-color-dot"
                    style={{ background: g.color }}
                    aria-hidden
                  />
                  <span className="settings-group-name">{g.name}</span>
                  <span className="settings-badge">
                    {g.categories.length}{' '}
                    {g.categories.length === 1 ? 'category' : 'categories'}
                  </span>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="settings-icon-btn"
                      aria-label={`Edit ${g.name}`}
                      onClick={() => setEditingGroupId(g.id)}
                    >
                      {IC.edit}
                    </button>
                    <button
                      type="button"
                      className="settings-icon-btn"
                      aria-label={`Move ${g.name} up`}
                      disabled={gi === 0}
                      onClick={() =>
                        void (async () => {
                          await api.reorderGroup({
                            id: g.id,
                            direction: 'up',
                          });
                          await reload();
                          dispatchDataChanged();
                        })()
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="settings-icon-btn"
                      aria-label={`Move ${g.name} down`}
                      disabled={gi === groups.length - 1}
                      onClick={() =>
                        void (async () => {
                          await api.reorderGroup({
                            id: g.id,
                            direction: 'down',
                          });
                          await reload();
                          dispatchDataChanged();
                        })()
                      }
                    >
                      {'\u2193'}
                    </button>
                    <button
                      type="button"
                      className="settings-icon-btn settings-icon-btn--danger"
                      aria-label={`Delete ${g.name}`}
                      onClick={() =>
                        void (async () => {
                          const preview = await api.getGroupDeletePreview(g.id);
                          setDeleteGroupState({
                            id: g.id,
                            name: g.name,
                            preview,
                            moveToId: '',
                          });
                        })()
                      }
                    >
                      {IC.del}
                    </button>
                  </div>
                </div>
              )}
              {expanded.has(g.id) && editingGroupId !== g.id ? (
                <>
                  <ul className="settings-cat-list">
                    {g.categories.map((c, ci) => (
                      <li key={c.id}>
                        {editingCatId === c.id ? (
                          <CategoryEditForm
                            category={c}
                            groups={groups}
                            onCancel={() => setEditingCatId(null)}
                            onSaved={async () => {
                              setEditingCatId(null);
                              await reload();
                              dispatchDataChanged();
                            }}
                          />
                        ) : (
                          <div className="settings-cat-row">
                            <span className="settings-cat-name">{c.name}</span>
                            <div className="settings-actions">
                              <button
                                type="button"
                                className="settings-icon-btn"
                                aria-label={`Edit ${c.name}`}
                                onClick={() => setEditingCatId(c.id)}
                              >
                                {IC.edit}
                              </button>
                              <button
                                type="button"
                                className="settings-icon-btn"
                                aria-label={`Move ${c.name} up`}
                                disabled={ci === 0}
                                onClick={() =>
                                  void (async () => {
                                    await api.reorderCategory({
                                      id: c.id,
                                      direction: 'up',
                                    });
                                    await reload();
                                    dispatchDataChanged();
                                  })()
                                }
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="settings-icon-btn"
                                aria-label={`Move ${c.name} down`}
                                disabled={ci === g.categories.length - 1}
                                onClick={() =>
                                  void (async () => {
                                    await api.reorderCategory({
                                      id: c.id,
                                      direction: 'down',
                                    });
                                    await reload();
                                    dispatchDataChanged();
                                  })()
                                }
                              >
                                {'\u2193'}
                              </button>
                              <button
                                type="button"
                                className="settings-icon-btn settings-icon-btn--danger"
                                aria-label={`Delete ${c.name}`}
                                onClick={() =>
                                  void (async () => {
                                    const p = await api.getCategoryDeletePreview(
                                      c.id
                                    );
                                    setDeleteCatState({
                                      id: c.id,
                                      name: c.name,
                                      tx: p.transactionCount,
                                      budgets: p.budgetRowCount,
                                    });
                                  })()
                                }
                              >
                                {IC.del}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {addingCatGroupId === g.id ? (
                    <AddCategoryForm
                      groupId={g.id}
                      onCancel={() => setAddingCatGroupId(null)}
                      onCreated={async () => {
                        setAddingCatGroupId(null);
                        await reload();
                        dispatchDataChanged();
                      }}
                    />
                  ) : (
                    <div className="settings-add-row">
                      <Button
                        type="button"
                        variant="dashed"
                        onClick={() => setAddingCatGroupId(g.id)}
                      >
                        Add category
                      </Button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ))
        )}
        {addingGroup ? (
          <AddGroupInlineForm
            onCancel={() => setAddingGroup(false)}
            onCreated={async () => {
              setAddingGroup(false);
              await reload();
              dispatchDataChanged();
            }}
          />
        ) : (
          <div className="settings-add-row">
            <Button
              type="button"
              variant="dashed"
              onClick={() => setAddingGroup(true)}
            >
              Add group
            </Button>
          </div>
        )}
      </div>

      <Modal
        title="Delete group"
        isOpen={deleteGroupState != null}
        onClose={() => setDeleteGroupState(null)}
      >
        {deleteGroupState ? (
          <>
            {deleteGroupState.preview.categoryCount === 0 ? (
              <p className="settings-modal-p">Delete this group?</p>
            ) : (
              <>
                <p className="settings-modal-p settings-modal-p--warn">
                  Deleting &ldquo;{deleteGroupState.name}&rdquo; will permanently
                  remove {deleteGroupState.preview.categoryCount}{' '}
                  {deleteGroupState.preview.categoryCount === 1
                    ? 'category'
                    : 'categories'}{' '}
                  and {deleteGroupState.preview.transactionCount}{' '}
                  {deleteGroupState.preview.transactionCount === 1
                    ? 'transaction'
                    : 'transactions'}
                  . This cannot be undone.
                </p>
                <p className="settings-modal-p">
                  Move categories to another group instead:
                </p>
                <select
                  className="settings-select"
                  value={deleteGroupState.moveToId}
                  onChange={(e) =>
                    setDeleteGroupState((s) =>
                      s
                        ? {
                            ...s,
                            moveToId: e.target.value
                              ? Number(e.target.value)
                              : '',
                          }
                        : null
                    )
                  }
                >
                  <option value="">Select target group…</option>
                  {groups
                    .filter((x) => x.id !== deleteGroupState.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </>
            )}
            <div className="settings-modal-actions">
              <Button
                variant="ghost"
                onClick={() => setDeleteGroupState(null)}
              >
                Cancel
              </Button>
              {deleteGroupState.preview.categoryCount > 0 &&
              deleteGroupState.moveToId !== '' ? (
                <Button
                  variant="primary"
                  onClick={() =>
                    void (async () => {
                      const m = deleteGroupState.moveToId;
                      if (m === '') return;
                      await api.moveGroupCategoriesDeleteGroup({
                        sourceGroupId: deleteGroupState.id,
                        targetGroupId: m as number,
                      });
                      setDeleteGroupState(null);
                      await reload();
                      dispatchDataChanged();
                    })()
                  }
                >
                  Move &amp; delete group
                </Button>
              ) : null}
              <Button
                variant="primary"
                onClick={() =>
                  void (async () => {
                    await api.deleteGroup(deleteGroupState.id);
                    setDeleteGroupState(null);
                    await reload();
                    dispatchDataChanged();
                  })()
                }
              >
                {deleteGroupState.preview.categoryCount === 0
                  ? 'Delete group'
                  : 'Delete group and all data'}
              </Button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        title="Delete category"
        isOpen={deleteCatState != null}
        onClose={() => setDeleteCatState(null)}
      >
        {deleteCatState ? (
          <>
            <p className="settings-modal-p">
              {deleteCatState.tx > 0 || deleteCatState.budgets > 0 ? (
                <>
                  Delete &ldquo;{deleteCatState.name}&rdquo;? This will remove{' '}
                  {deleteCatState.tx}{' '}
                  {deleteCatState.tx === 1 ? 'transaction' : 'transactions'} and{' '}
                  {deleteCatState.budgets} budget{' '}
                  {deleteCatState.budgets === 1 ? 'row' : 'rows'} (all months).
                  This cannot be undone.
                </>
              ) : (
                <>Delete category &ldquo;{deleteCatState.name}&rdquo;?</>
              )}
            </p>
            <div className="settings-modal-actions">
              <Button variant="ghost" onClick={() => setDeleteCatState(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  void (async () => {
                    await api.deleteCategory(deleteCatState.id);
                    setDeleteCatState(null);
                    await reload();
                    dispatchDataChanged();
                  })()
                }
              >
                Delete
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </section>
  );
}

function GroupEditForm({
  group,
  onCancel,
  onSaved,
}: {
  group: GroupWithCategories;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api.updateGroup({ id: group.id, name: name.trim(), color });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="settings-inline-form">
      <input
        className="settings-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Group name"
      />
      <div className="settings-swatches" role="list">
        {CATEGORY_COLOR_PRESETS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`settings-swatch${color === c.value ? ' settings-swatch--active' : ''}`}
            aria-label={c.label}
            onClick={() => setColor(c.value)}
          >
            <span
              className="settings-swatch-dot"
              style={{ background: c.value }}
            />
          </button>
        ))}
      </div>
      {err ? (
        <p className="settings-modal-p settings-modal-p--warn">{err}</p>
      ) : null}
      <div className="settings-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={!name.trim()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function AddGroupInlineForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLOR_PRESETS[0].value);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api.createGroup({ name: name.trim(), color });
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="settings-inline-form">
      <input
        className="settings-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name"
        aria-label="New group name"
      />
      <div className="settings-swatches" role="list">
        {CATEGORY_COLOR_PRESETS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`settings-swatch${color === c.value ? ' settings-swatch--active' : ''}`}
            aria-label={c.label}
            onClick={() => setColor(c.value)}
          >
            <span
              className="settings-swatch-dot"
              style={{ background: c.value }}
            />
          </button>
        ))}
      </div>
      {err ? (
        <p className="settings-modal-p settings-modal-p--warn">{err}</p>
      ) : null}
      <div className="settings-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={!name.trim()}
        >
          Create
        </Button>
      </div>
    </div>
  );
}

function CategoryEditForm({
  category,
  groups,
  onCancel,
  onSaved,
}: {
  category: CategoryRow;
  groups: GroupWithCategories[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(category.name);
  const [groupId, setGroupId] = useState(category.group_id);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api.updateCategory({
        id: category.id,
        name: name.trim(),
        groupId,
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="settings-inline-form">
      <input
        className="settings-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Category name"
      />
      <select
        className="settings-select"
        value={groupId}
        onChange={(e) => setGroupId(Number(e.target.value))}
        aria-label="Group"
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {err ? (
        <p className="settings-modal-p settings-modal-p--warn">{err}</p>
      ) : null}
      <div className="settings-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={!name.trim()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function AddCategoryForm({
  groupId,
  onCancel,
  onCreated,
}: {
  groupId: number;
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api.createCategory({ group_id: groupId, name: name.trim() });
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="settings-inline-form">
      <input
        className="settings-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Category name"
        aria-label="New category name"
      />
      {err ? (
        <p className="settings-modal-p settings-modal-p--warn">{err}</p>
      ) : null}
      <div className="settings-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={!name.trim()}
        >
          Create
        </Button>
      </div>
    </div>
  );
}

function SettingsIncomeSection() {
  const [sources, setSources] = useState<IncomeSourceRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteState, setDeleteState] = useState<{
    id: number;
    name: string;
    actual: number;
    budgets: number;
  } | null>(null);

  const reload = useCallback(async () => {
    const s = await api.getIncomeSources();
    setSources(s ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Income sources</h2>
      <p className="settings-section__desc">
        Names used for budgeted and actual income. Reorder with the arrows.
      </p>
      <div className="settings-card">
        {sources.length === 0 ? (
          <p className="settings-empty">
            No income sources yet. Add one below or from the Budget screen.
          </p>
        ) : (
          sources.map((s, si) => (
            <div key={s.id} className="settings-income-row">
              {editingId === s.id ? (
                <IncomeEditForm
                  source={s}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await reload();
                    dispatchDataChanged();
                  }}
                />
              ) : (
                <>
                  <span className="settings-cat-name">{s.name}</span>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="settings-icon-btn"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => setEditingId(s.id)}
                    >
                      {IC.edit}
                    </button>
                    <button
                      type="button"
                      className="settings-icon-btn"
                      aria-label="Move up"
                      disabled={si === 0}
                      onClick={() =>
                        void (async () => {
                          await api.reorderIncomeSource({
                            id: s.id,
                            direction: 'up',
                          });
                          await reload();
                          dispatchDataChanged();
                        })()
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="settings-icon-btn"
                      aria-label="Move down"
                      disabled={si === sources.length - 1}
                      onClick={() =>
                        void (async () => {
                          await api.reorderIncomeSource({
                            id: s.id,
                            direction: 'down',
                          });
                          await reload();
                          dispatchDataChanged();
                        })()
                      }
                    >
                      {'\u2193'}
                    </button>
                    <button
                      type="button"
                      className="settings-icon-btn settings-icon-btn--danger"
                      aria-label={`Delete ${s.name}`}
                      onClick={() =>
                        void (async () => {
                          const p = await api.getIncomeSourceDeletePreview(s.id);
                          setDeleteState({
                            id: s.id,
                            name: s.name,
                            actual: p.actualCount,
                            budgets: p.budgetRowCount,
                          });
                        })()
                      }
                    >
                      {IC.del}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
        {adding ? (
          <div className="settings-inline-form">
            <AddIncomeForm
              onCancel={() => setAdding(false)}
              onCreated={async () => {
                setAdding(false);
                await reload();
                dispatchDataChanged();
              }}
            />
          </div>
        ) : (
          <div className="settings-add-row">
            <Button type="button" variant="dashed" onClick={() => setAdding(true)}>
              Add income source
            </Button>
          </div>
        )}
      </div>
      <Modal
        title="Delete income source"
        isOpen={deleteState != null}
        onClose={() => setDeleteState(null)}
      >
        {deleteState ? (
          <>
            <p className="settings-modal-p">
              {deleteState.actual > 0 || deleteState.budgets > 0 ? (
                <>
                  Delete &ldquo;{deleteState.name}&rdquo;? This removes{' '}
                  {deleteState.actual} income{' '}
                  {deleteState.actual === 1 ? 'entry' : 'entries'} and{' '}
                  {deleteState.budgets} budget{' '}
                  {deleteState.budgets === 1 ? 'row' : 'rows'}.
                </>
              ) : (
                <>Delete income source &ldquo;{deleteState.name}&rdquo;?</>
              )}
            </p>
            <div className="settings-modal-actions">
              <Button variant="ghost" onClick={() => setDeleteState(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  void (async () => {
                    await api.deleteIncomeSource(deleteState.id);
                    setDeleteState(null);
                    await reload();
                    dispatchDataChanged();
                  })()
                }
              >
                Delete
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </section>
  );
}

function IncomeEditForm({
  source,
  onCancel,
  onSaved,
}: {
  source: IncomeSourceRow;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(source.name);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api.updateIncomeSource({ id: source.id, name: name.trim() });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="settings-inline-row" style={{ width: '100%' }}>
      <input
        className="settings-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Income source name"
      />
      {err ? (
        <span className="settings-modal-p--warn" style={{ width: '100%' }}>
          {err}
        </span>
      ) : null}
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="button"
        variant="primary"
        onClick={() => void save()}
        disabled={!name.trim()}
      >
        Save
      </Button>
    </div>
  );
}

function AddIncomeForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await api.createIncomeSource({ name: name.trim() });
      await onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <input
        className="settings-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Salary"
        aria-label="New income source name"
      />
      {err ? (
        <p className="settings-modal-p settings-modal-p--warn">{err}</p>
      ) : null}
      <div className="settings-form-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={!name.trim()}
        >
          Create
        </Button>
      </div>
    </>
  );
}

function SettingsMappingsSection() {
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [groups, setGroups] = useState<GroupWithCategories[]>([]);
  const [income, setIncome] = useState<IncomeSourceRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteMap, setDeleteMap] = useState<CategoryMapping | null>(null);

  const reload = useCallback(async () => {
    const [m, g, i] = await Promise.all([
      api.getCategoryMappings(),
      api.getGroups(),
      api.getIncomeSources(),
    ]);
    const sorted = [...(m ?? [])].sort((a, b) =>
      a.externalName.localeCompare(b.externalName, undefined, {
        sensitivity: 'base',
      })
    );
    setMappings(sorted);
    setGroups(g ?? []);
    setIncome(i ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const groupsSorted = useMemo(
    () =>
      [...groups].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [groups]
  );

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Import mappings</h2>
      <p className="settings-section__desc">
        Monarch CSV categories you have mapped to Spend. Edit or remove a
        mapping if you made a mistake.
      </p>
      <div className="settings-card settings-mapping-table">
        {mappings.length === 0 ? (
          <p className="settings-empty">
            You haven&apos;t imported any CSVs yet. Mappings appear here after
            your first import.
          </p>
        ) : (
          mappings.map((m) => {
            const dest = mappingDestinationLabel(m, groups, income);
            const sel = mappingAssignmentToSelectValue({
              targetType: m.targetType,
              targetId: m.targetId,
            });
            return (
              <div key={m.id} className="settings-mapping-row">
                <span className="settings-mapping-monarch">{m.externalName}</span>
                {editingId === m.id ? (
                  <MappingEditRow
                    key={m.id}
                    mapping={m}
                    initialSelect={sel}
                    groups={groupsSorted}
                    income={income}
                    onCancel={() => setEditingId(null)}
                    onSaved={async () => {
                      setEditingId(null);
                      await reload();
                      dispatchDataChanged();
                    }}
                  />
                ) : (
                  <>
                    <span
                      className={`settings-mapping-dest${dest.muted ? ' settings-mapping-dest--muted' : ''}`}
                    >
                      {dest.color ? (
                        <span
                          className="settings-color-dot"
                          style={{ background: dest.color }}
                          aria-hidden
                        />
                      ) : null}
                      {dest.text}
                    </span>
                    <div className="settings-actions">
                      <button
                        type="button"
                        className="settings-icon-btn"
                        aria-label="Edit mapping"
                        onClick={() => setEditingId(m.id)}
                      >
                        {IC.edit}
                      </button>
                      <button
                        type="button"
                        className="settings-icon-btn settings-icon-btn--danger"
                        aria-label="Delete mapping"
                        onClick={() => setDeleteMap(m)}
                      >
                        {IC.del}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      <Modal
        title="Delete mapping"
        isOpen={deleteMap != null}
        onClose={() => setDeleteMap(null)}
      >
        {deleteMap ? (
          <>
            <p className="settings-modal-p">
              Delete this mapping? You&apos;ll be asked to map &ldquo;
              {deleteMap.externalName}&rdquo; again on your next import.
            </p>
            <div className="settings-modal-actions">
              <Button variant="ghost" onClick={() => setDeleteMap(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() =>
                  void (async () => {
                    await api.deleteCategoryMapping(deleteMap.id);
                    setDeleteMap(null);
                    await reload();
                    dispatchDataChanged();
                  })()
                }
              >
                Delete
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </section>
  );
}

function MappingEditRow({
  mapping,
  initialSelect,
  groups,
  income,
  onCancel,
  onSaved,
}: {
  mapping: CategoryMapping;
  initialSelect: string;
  groups: GroupWithCategories[];
  income: IncomeSourceRow[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [v, setV] = useState(initialSelect);
  const save = async () => {
    const p = parseMappingSelectValue(v);
    await api.saveCategoryMapping({
      externalName: mapping.externalName,
      targetType: p.targetType,
      targetId: p.targetId,
    });
    await onSaved();
  };
  return (
    <div className="settings-mapping-edit">
      <MappingTargetSelect
        className="import-select"
        value={v}
        onChange={setV}
        groups={groups}
        incomeSources={income}
      />
      <div className="settings-form-actions" style={{ marginTop: 10 }}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

function SettingsDataSection() {
  const [importConfirm, setImportConfirm] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [resetTx, setResetTx] = useState(false);
  const [resetFull, setResetFull] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetFullToken, setResetFullToken] = useState('');

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Data</h2>
      <p className="settings-section__desc">
        Back up your SQLite database or replace / reset local data.
      </p>
      <div className="settings-card">
        <div className="settings-data-block">
          <h3 className="settings-data-block__label">Export database backup</h3>
          <p className="settings-data-block__text">
            Save a copy of all your data as a SQLite file. Useful before making
            big changes or moving to a new computer.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={() =>
              void (async () => {
                try {
                  const p = await api.exportDatabaseBackup();
                  setExportMsg(p ? `Saved to ${p}` : 'Export canceled.');
                } catch (e) {
                  setExportMsg(
                    e instanceof Error ? e.message : String(e)
                  );
                }
              })()
            }
          >
            Export database backup
          </Button>
          {exportMsg ? (
            <p className="settings-modal-p" style={{ marginTop: 12 }}>
              {exportMsg}
            </p>
          ) : null}
        </div>
        <div className="settings-data-block">
          <h3 className="settings-data-block__label">Import from backup</h3>
          <p className="settings-data-block__text">
            Replace all current data with a previously exported backup. This
            cannot be undone.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={() => setImportConfirm(true)}
          >
            Import from backup
          </Button>
        </div>
        <div className="settings-data-block settings-data-block--danger">
          <h3 className="settings-data-block__label">Reset all data</h3>
          <p className="settings-data-block__text">
            Permanently delete all transactions, budgets, and import mappings.
            Categories, groups, and income sources are kept.
          </p>
          <Button type="button" variant="primary" onClick={() => setResetTx(true)}>
            Reset all data
          </Button>
        </div>
        <div className="settings-data-block settings-data-block--danger">
          <h3 className="settings-data-block__label">Reset everything</h3>
          <p className="settings-data-block__text">
            Also deletes all categories, groups, and income sources. Type RESET
            to confirm.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={() => setResetFull(true)}
          >
            Reset everything (including categories)
          </Button>
        </div>
      </div>

      <Modal
        title="Import backup"
        isOpen={importConfirm}
        onClose={() => setImportConfirm(false)}
      >
        <p className="settings-modal-p settings-modal-p--warn">
          This will replace ALL your current data. Export a backup first if you
          want to keep it. Continue?
        </p>
        <div className="settings-modal-actions">
          <Button variant="ghost" onClick={() => setImportConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              void (async () => {
                setImportConfirm(false);
                try {
                  await api.importDatabaseBackup();
                } catch (e) {
                  window.alert(
                    e instanceof Error ? e.message : String(e)
                  );
                }
              })()
            }
          >
            Continue
          </Button>
        </div>
      </Modal>

      <Modal
        title="Reset transactions & budgets"
        isOpen={resetTx}
        onClose={() => {
          setResetTx(false);
          setResetToken('');
        }}
      >
        <p className="settings-modal-p">
          Type <strong>RESET</strong> to permanently delete transactions,
          budgets, income entries, and import mappings. Categories are kept.
        </p>
        <input
          className="settings-reset-input"
          value={resetToken}
          onChange={(e) => setResetToken(e.target.value)}
          placeholder="RESET"
          aria-label="Type RESET to confirm"
        />
        <div className="settings-modal-actions">
          <Button
            variant="ghost"
            onClick={() => {
              setResetTx(false);
              setResetToken('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={resetToken !== 'RESET'}
            onClick={() =>
              void (async () => {
                await api.resetDatabase('transactions');
                setResetTx(false);
                setResetToken('');
              })()
            }
          >
            Reset data
          </Button>
        </div>
      </Modal>

      <Modal
        title="Reset everything"
        isOpen={resetFull}
        onClose={() => {
          setResetFull(false);
          setResetFullToken('');
        }}
      >
        <p className="settings-modal-p settings-modal-p--warn">
          This deletes categories, groups, income sources, and all financial
          data. Type RESET to confirm.
        </p>
        <input
          className="settings-reset-input"
          value={resetFullToken}
          onChange={(e) => setResetFullToken(e.target.value)}
          placeholder="RESET"
          aria-label="Type RESET to confirm full reset"
        />
        <div className="settings-modal-actions">
          <Button
            variant="ghost"
            onClick={() => {
              setResetFull(false);
              setResetFullToken('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={resetFullToken !== 'RESET'}
            onClick={() =>
              void (async () => {
                await api.resetDatabase('full');
                setResetFull(false);
                setResetFullToken('');
              })()
            }
          >
            Reset everything
          </Button>
        </div>
      </Modal>
    </section>
  );
}

function SettingsPreferencesSection() {
  const [prefs, setPrefs] = useState<AppPreferences | null>(null);
  const { colorMode, setColorMode } = useColorMode();

  useEffect(() => {
    void api.getPreferences().then(setPrefs);
  }, []);

  const update = async (p: Partial<AppPreferences>) => {
    await api.setPreferences(p);
    const next = await api.getPreferences();
    setPrefs(next);
  };

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">Preferences</h2>
      <p className="settings-section__desc">
        App behavior. More options will land here over time.
      </p>
      <div className="settings-card" style={{ padding: '16px 18px' }}>
        <p className="settings-version">
          Spend.{APP_VERSION ? ` v${APP_VERSION}` : ''}
        </p>
        {prefs ? (
          <div className="settings-pref-row">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Appearance</div>
            <label>
              <input
                type="radio"
                name="color-mode"
                checked={colorMode === 'light'}
                onChange={() => setColorMode('light')}
              />
              <span>Light</span>
            </label>
            <label>
              <input
                type="radio"
                name="color-mode"
                checked={colorMode === 'dark'}
                onChange={() => setColorMode('dark')}
              />
              <span>Dark</span>
            </label>
            <div style={{ fontWeight: 600, margin: '20px 0 8px' }}>
              Default month on launch
            </div>
            <label>
              <input
                type="radio"
                name="default-month"
                checked={prefs.defaultMonthOnLaunch === 'current'}
                onChange={() =>
                  void update({ defaultMonthOnLaunch: 'current' })
                }
              />
              <span>
                Current calendar month (each launch opens the present month)
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="default-month"
                checked={prefs.defaultMonthOnLaunch === 'last_viewed'}
                onChange={() =>
                  void update({ defaultMonthOnLaunch: 'last_viewed' })
                }
              />
              <span>Last viewed month (remember month across launches)</span>
            </label>
          </div>
        ) : null}
      </div>
    </section>
  );
}
