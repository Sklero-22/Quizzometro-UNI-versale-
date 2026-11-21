import type { Question } from '../types';

/** "Paniere", "Inedite", "Esami già svolti"… da mostrare sotto la risposta. */
export function sourceLabel(q: Question): string {
  if (q.sourceCategories?.length) return q.sourceCategories.join(' · ');
  if (q.origin === 'exam') return 'Inedite / esami';
  if (q.origin === 'bank') return 'Paniere';
  return '';
}

/** "Lezione 3 · Titolo" */
export function lessonLabel(q: Question): string {
  if (!q.lz) return '';
  return q.tit ? `Lezione ${q.lz} · ${q.tit}` : `Lezione ${q.lz}`;
}
