import type { MappingTargetType } from '../types/import';

export function mappingAssignmentToSelectValue(
  a:
    | { targetType: MappingTargetType; targetId: number | null }
    | undefined
): string {
  if (!a) return '';
  if (a.targetType === 'skip') return 'skip';
  if (a.targetType === 'income_source' && a.targetId != null) {
    return `income:${a.targetId}`;
  }
  if (a.targetType === 'category' && a.targetId != null) {
    return `cat:${a.targetId}`;
  }
  return '';
}

export function parseMappingSelectValue(v: string): {
  targetType: MappingTargetType;
  targetId: number | null;
} {
  if (v === 'skip') {
    return { targetType: 'skip', targetId: null };
  }
  if (v.startsWith('income:')) {
    return { targetType: 'income_source', targetId: Number(v.slice(7)) };
  }
  if (v.startsWith('cat:')) {
    return { targetType: 'category', targetId: Number(v.slice(4)) };
  }
  return { targetType: 'skip', targetId: null };
}

export function isCategoryMappingReady(
  unknownCategories: string[],
  assignments: Record<
    string,
    { targetType: MappingTargetType; targetId: number | null } | undefined
  >
): boolean {
  return unknownCategories.every((name) => assignments[name] !== undefined);
}
