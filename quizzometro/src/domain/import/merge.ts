import type { Lesson, Question, Subject } from '../types';
import { isExamCategory, normText, type ParsedSubject } from './parse';

export interface ModifiedPair {
  old: Question;
  next: Question;
}

export interface ImportPlan {
  added: Question[];
  identical: Question[];
  modified: ModifiedPair[];
}

function contentKey(q: Question): string {
  const opts = q.opts.map(normText).sort().join('|');
  return `${normText(q.q)}#${opts}#${normText(q.opts[q.ci] ?? '')}`;
}

function words(s: string): Set<string> {
  return new Set(normText(s).split(' ').filter((w) => w.length > 2));
}

function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => B.has(w) && inter++);
  return inter / (A.size + B.size - inter);
}

export function planImport(existing: Subject | undefined, parsed: ParsedSubject): ImportPlan {
  const plan: ImportPlan = { added: [], identical: [], modified: [] };
  if (!existing) {
    plan.added = parsed.questions;
    return plan;
  }
  const byKey = new Map<string, Question>();
  const bySourceId = new Map<string, Question>();
  const byText = new Map<string, Question>();
  existing.questions.forEach((q) => {
    byKey.set(contentKey(q), q);
    if (q.sourceId) bySourceId.set(q.sourceId, q);
    byText.set(normText(q.q), q);
  });
  const claimed = new Set<string>();
  parsed.questions.forEach((nq) => {
    const same = byKey.get(contentKey(nq));
    if (same) {
      plan.identical.push(nq);
      claimed.add(same.id);
      return;
    }
    let cand: Question | undefined = nq.sourceId ? bySourceId.get(nq.sourceId) : undefined;
    if (cand && similarity(cand.q, nq.q) < 0.3 && normText(cand.q) !== normText(nq.q)) cand = undefined;
    if (!cand) cand = byText.get(normText(nq.q));
    if (!cand) {
      let best = 0;
      for (const q of existing.questions) {
        if (claimed.has(q.id)) continue;
        const s = similarity(q.q, nq.q);
        if (s > best) {
          best = s;
          cand = q;
        }
      }
      if (best < 0.8) cand = undefined;
    }
    if (cand && !claimed.has(cand.id)) {
      claimed.add(cand.id);
      plan.modified.push({ old: cand, next: nq });
    } else plan.added.push(nq);
  });
  return plan;
}

function mergeLists<T>(a: T[] | undefined, b: T[] | undefined): T[] {
  const out = [...(a ?? [])];
  (b ?? []).forEach((x) => out.includes(x) || out.push(x));
  return out;
}

function mergeLessons(a: Lesson[] | undefined, b: Lesson[]): Lesson[] {
  const map = new Map<number, string>();
  (a ?? []).forEach((l) => map.set(l.number, l.title));
  b.forEach((l) => {
    if (l.title || !map.has(l.number)) map.set(l.number, l.title || map.get(l.number) || '');
  });
  return [...map.entries()].sort((x, y) => x[0] - y[0]).map(([number, title]) => ({ number, title }));
}

/** Applica il piano. Gli ID esistenti restano invariati così i progressi non si azzerano. */
export function applyImport(
  existing: Subject | undefined,
  parsed: ParsedSubject,
  plan: ImportPlan,
  approveModified: boolean,
  sourceUrl: string | undefined,
  now: number,
  newId: string,
): Subject {
  if (!existing) {
    return {
      id: newId,
      title: parsed.title,
      subjectKey: parsed.subjectKey,
      questions: parsed.questions,
      lessons: parsed.lessons,
      sourceUrl,
      createdAt: now,
      updatedAt: now,
    };
  }
  const questions = existing.questions.map((q) => ({ ...q }));
  const byKey = new Map<string, Question>();
  questions.forEach((q) => byKey.set(contentKey(q), q));
  plan.identical.forEach((nq) => {
    const q = byKey.get(contentKey(nq));
    if (!q) return;
    q.sourceCategories = mergeLists(q.sourceCategories, nq.sourceCategories);
    q.lessonIds = mergeLists(q.lessonIds, nq.lessonIds);
    if (!q.exp && nq.exp) q.exp = nq.exp;
    if (!q.sourceId && nq.sourceId) q.sourceId = nq.sourceId;
    if (q.sourceCategories?.some(isExamCategory)) q.origin = 'exam';
  });
  if (approveModified) {
    plan.modified.forEach(({ old, next }) => {
      const i = questions.findIndex((q) => q.id === old.id);
      if (i < 0) return;
      questions[i] = {
        ...next,
        id: old.id,
        sourceCategories: mergeLists(old.sourceCategories, next.sourceCategories),
        lessonIds: mergeLists(old.lessonIds, next.lessonIds),
      };
    });
  }
  const ids = new Set(questions.map((q) => q.id));
  plan.added.forEach((nq) => {
    let id = nq.id;
    let n = 2;
    while (ids.has(id)) id = `${nq.id}~${n++}`;
    ids.add(id);
    questions.push({ ...nq, id });
  });
  return {
    ...existing,
    title: parsed.title || existing.title,
    subjectKey: parsed.subjectKey ?? existing.subjectKey,
    questions,
    lessons: mergeLessons(existing.lessons, parsed.lessons),
    sourceUrl: sourceUrl ?? existing.sourceUrl,
    updatedAt: now,
  };
}
