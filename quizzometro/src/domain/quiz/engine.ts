import type { QStat, Question, Session, SessionItem, SessionKind, Subject } from '../types';

export type StatusFilter = 'all' | 'seen' | 'unseen' | 'wrong';
export type QuizMode = 'mixed' | 'inedite';
export const INEDITE_QUIZ_PERCENT = 15;

export interface QuizConfig {
  /** null = tutte */
  count: number | null;
  /** minuti, null = nessun timer */
  timerMin: number | null;
  categories: string[];
  lessons: number[];
  status: StatusFilter;
  onlyDates: boolean;
  /** Quiz misto o riservato alle domande marcate esplicitamente come Inedite. */
  mode?: QuizMode;
}

export type SubjectStats = Record<string, QStat>;

const MONTHS =
  'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
const DATE_RE = new RegExp(
  `\\b(?:1[0-9]{3}|20[0-9]{2})\\b|\\b\\d{1,2}\\s+(?:${MONTHS})\\b|\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b`,
  'i',
);

export function hasDate(q: Question): boolean {
  return DATE_RE.test(q.q) || q.opts.some((o) => DATE_RE.test(o));
}

export function questionCategories(q: Question): string[] {
  return q.sourceCategories?.length ? q.sourceCategories : [q.origin === 'exam' ? 'Esami già svolti' : 'Paniere'];
}

export function isInediteQuestion(q: Question): boolean {
  return questionCategories(q).some((category) => /inedit/i.test(category));
}

export function questionLessons(q: Question): number[] {
  if (q.lessonIds?.length) return q.lessonIds;
  return q.lz ? [q.lz] : [];
}

export function allCategories(subject: Subject): string[] {
  const set: string[] = [];
  subject.questions.forEach((q) => questionCategories(q).forEach((c) => set.includes(c) || set.push(c)));
  return set;
}

export function allLessons(subject: Subject): { number: number; title: string }[] {
  const map = new Map<number, string>();
  (subject.lessons ?? []).forEach((l) => map.set(l.number, l.title));
  subject.questions.forEach((q) =>
    questionLessons(q).forEach((n) => {
      if (!map.has(n)) map.set(n, n === q.lz ? q.tit : '');
    }),
  );
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([number, title]) => ({ number, title }));
}

export interface LessonProgress {
  number: number;
  title: string;
  totalQuestions: number;
  seenQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  answeredAttempts: number;
  accuracyPct: number | null;
}

export function lessonProgress(subject: Subject, stats: SubjectStats): LessonProgress[] {
  const lessons = allLessons(subject);
  const totals = new Map(
    lessons.map((lesson) => [
      lesson.number,
      { totalQuestions: 0, seenQuestions: 0, correctAnswers: 0, wrongAnswers: 0 },
    ]),
  );

  subject.questions.forEach((question) => {
    const stat = stats[question.id];
    new Set(questionLessons(question)).forEach((lessonNumber) => {
      const total = totals.get(lessonNumber);
      if (!total) return;
      total.totalQuestions++;
      if (stat && stat.seen > 0) total.seenQuestions++;
      total.correctAnswers += stat?.correct ?? 0;
      total.wrongAnswers += stat?.wrong ?? 0;
    });
  });

  return lessons.map(({ number, title }) => {
    const total = totals.get(number)!;
    const answeredAttempts = total.correctAnswers + total.wrongAnswers;
    return {
      number,
      title,
      ...total,
      answeredAttempts,
      accuracyPct: answeredAttempts
        ? Math.round((total.correctAnswers / answeredAttempts) * 1000) / 10
        : null,
    };
  });
}

export function filterQuestions(
  subject: Subject,
  stats: SubjectStats,
  cfg: Pick<QuizConfig, 'categories' | 'lessons' | 'status' | 'onlyDates' | 'mode'>,
  totalCategories: number,
  totalLessons: number,
): Question[] {
  const cats = new Set(cfg.categories);
  const lessons = new Set(cfg.lessons);
  return subject.questions.filter((q) => {
    if (cfg.mode === 'inedite') {
      if (!isInediteQuestion(q)) return false;
    } else if (cats.size < totalCategories || totalCategories === 0) {
      if (!questionCategories(q).some((c) => cats.has(c))) return false;
    }
    const ql = questionLessons(q);
    if (ql.length && (lessons.size < totalLessons || totalLessons === 0)) {
      if (!ql.some((n) => lessons.has(n))) return false;
    }
    const st = stats[q.id];
    if (cfg.status === 'seen' && !(st && st.seen > 0)) return false;
    if (cfg.status === 'unseen' && st && st.seen > 0) return false;
    if (cfg.status === 'wrong' && !(st && st.wrong > 0)) return false;
    if (cfg.onlyDates && !hasDate(q)) return false;
    return true;
  });
}

function rnd(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ordine delle domande: tra molti mescolamenti casuali sceglie quello che si
 * allontana di più da come le domande sono già state viste (stessa posizione,
 * coppie consecutive, stesso test d'origine o stessa lezione in fila).
 */
export function mixQuestions(qs: Question[], history: string[][], lastIds: string[]): Question[] {
  const n = qs.length;
  if (n < 3) return shuffle(qs.slice());
  const src: Record<string, number> = {};
  const pos: Record<string, number> = {};
  const pairs = new Set<string>();
  history.forEach((ids, ti) => {
    ids.forEach((id, pi) => {
      src[id] = ti;
      pos[id] = pi;
    });
    for (let i = 1; i < ids.length; i++) {
      pairs.add(ids[i - 1] + '|' + ids[i]);
      pairs.add(ids[i] + '|' + ids[i - 1]);
    }
  });
  const prev: Record<string, number> = {};
  lastIds.forEach((id, i) => (prev[id] = i));
  for (let i = 1; i < lastIds.length; i++) {
    pairs.add(lastIds[i - 1] + '|' + lastIds[i]);
    pairs.add(lastIds[i] + '|' + lastIds[i - 1]);
  }
  const share: Record<number, number> = {};
  qs.forEach((q) => {
    const k = src[q.id];
    if (k !== undefined) share[k] = (share[k] ?? 0) + 1;
  });
  const head = Math.max(2, Math.ceil(n / 4));
  const cost = (o: Question[]): number => {
    let c = 0;
    const headCount: Record<number, number> = {};
    for (let i = 0; i < n; i++) {
      const q = o[i];
      const id = q.id;
      if (prev[id] === i) c += 3;
      if (pos[id] === i) c += 2;
      if (i > 0) {
        const p = o[i - 1];
        if (pairs.has(p.id + '|' + id)) c += 5;
        if (src[p.id] !== undefined && src[p.id] === src[id]) c += 1.5;
        if (p.lz === q.lz) c += 1;
      }
      if (i < head && src[id] !== undefined) headCount[src[id]] = (headCount[src[id]] ?? 0) + 1;
    }
    for (const k in headCount) {
      const exp = (share[k] * head) / n;
      if (headCount[k] > exp + 1) c += (headCount[k] - exp - 1) * 4;
    }
    return c;
  };
  const tries = Math.max(40, Math.min(400, Math.floor(60000 / n)));
  let best: Question[] = qs;
  let bestC = Infinity;
  for (let t = 0; t < tries; t++) {
    const o = shuffle(qs.slice());
    const c = cost(o);
    if (c < bestC) {
      bestC = c;
      best = o;
      if (c === 0) break;
    }
  }
  return best;
}

/**
 * Ordine delle opzioni: casuale, ma la risposta corretta non torna nella stessa
 * posizione (A/B/C/D) dell'ultima volta in cui la domanda è stata vista.
 * Restituisce order[posizioneMostrata] = indice originale.
 */
export function mixOptions(q: Question, lastPos: number | undefined): number[] {
  const order = shuffle(q.opts.map((_, i) => i));
  if (lastPos !== undefined && order.length > 1) {
    const at = order.indexOf(q.ci);
    if (at === lastPos) {
      let j = rnd(order.length - 1);
      if (j >= at) j++;
      [order[at], order[j]] = [order[j], order[at]];
    }
  }
  return order;
}

/** ID in ordine di presentazione delle ultime prove del soggetto, per mixQuestions. */
export function historyIds(sessions: Session[], subjectId: string, max = 30): string[][] {
  return sessions
    .filter((s) => s.subjectId === subjectId && s.finishedAt !== null)
    .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
    .slice(-max)
    .map((s) => s.items.filter((_, i) => s.answers[i] !== null).map((it) => it.qid));
}

function lastOriginal(sessions: Session[], subjectId: string): Session | undefined {
  return sessions
    .filter((s) => s.subjectId === subjectId && s.kind === 'original' && s.finishedAt !== null)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0];
}

export function buildItems(
  pool: Question[],
  count: number | null,
  stats: SubjectStats,
  sessions: Session[],
  subjectId: string,
  exact: boolean,
  includeInediteQuota = false,
): SessionItem[] {
  const last = lastOriginal(sessions, subjectId);
  const lastSet = new Set(last?.items.map((i) => i.qid) ?? []);
  let picked: Question[];
  const wanted = count === null ? pool.length : Math.max(0, Math.min(Math.trunc(count), pool.length));
  const rankByPracticeNeed = (questions: Question[]) =>
    questions
      .map((q) => ({
        q,
        s: stats[q.id]?.seen ?? 0,
        inLast: lastSet.has(q.id) ? 1 : 0,
        r: Math.random(),
      }))
      .sort((a, b) => a.s - b.s || a.inLast - b.inLast || a.r - b.r)
      .map((x) => x.q);

  if (exact || count === null || wanted >= pool.length) {
    picked = pool;
  } else if (includeInediteQuota) {
    const inedite = pool.filter(isInediteQuestion);
    const other = pool.filter((q) => !isInediteQuestion(q));
    if (!inedite.length || !other.length) {
      picked = rankByPracticeNeed(pool).slice(0, wanted);
    } else {
      const inediteTarget = Math.min(Math.round((wanted * INEDITE_QUIZ_PERCENT) / 100), inedite.length);
      const otherTarget = Math.min(wanted - inediteTarget, other.length);
      // Se non ci sono abbastanza domande normali, completa con Inedite rimaste,
      // senza duplicare domande né superare il totale richiesto.
      const inediteCount = Math.min(inedite.length, wanted - otherTarget);
      picked = [
        ...rankByPracticeNeed(inedite).slice(0, inediteCount),
        ...rankByPracticeNeed(other).slice(0, otherTarget),
      ];
    }
  } else {
    picked = rankByPracticeNeed(pool).slice(0, wanted);
  }
  const mixed = exact
    ? picked.slice()
    : mixQuestions(picked, historyIds(sessions, subjectId), last?.items.map((i) => i.qid) ?? []);
  return mixed.map((q) => ({ qid: q.id, order: mixOptions(q, stats[q.id]?.lp) }));
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createSession(args: {
  subjectId: string;
  kind: SessionKind;
  label: string;
  items: SessionItem[];
  timerMin: number | null;
  sourceSessionId?: string;
}): Session {
  const now = Date.now();
  return {
    id: newId(),
    subjectId: args.subjectId,
    kind: args.kind,
    label: args.label,
    items: args.items,
    answers: args.items.map(() => null),
    answeredAt: args.items.map(() => null),
    current: 0,
    startedAt: now,
    deadline: args.timerMin ? now + args.timerMin * 60000 : null,
    finishedAt: null,
    sourceSessionId: args.sourceSessionId,
  };
}

export interface Score {
  total: number;
  correct: number;
  wrong: number;
  blank: number;
  pct: number;
}

export function scoreSession(s: Session, byId: Map<string, Question>): Score {
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  s.items.forEach((it, i) => {
    const q = byId.get(it.qid);
    const a = s.answers[i];
    if (!q || a === null || a === undefined) blank++;
    else if (a === q.ci) correct++;
    else wrong++;
  });
  const total = s.items.length;
  const pct = total ? Math.round((correct / total) * 1000) / 10 : 0;
  return { total, correct, wrong, blank, pct };
}

export function answeredQidsSince(sessions: Session[], subjectId: string, since: number): string[] {
  const out: string[] = [];
  sessions.forEach((s) => {
    if (s.subjectId !== subjectId) return;
    s.items.forEach((it, i) => {
      const t = s.answeredAt[i];
      if (t !== null && t !== undefined && t >= since && !out.includes(it.qid)) out.push(it.qid);
    });
  });
  return out;
}

export function lastOriginalTests(sessions: Session[], subjectId: string, n: number): Session[] {
  return sessions
    .filter((s) => s.subjectId === subjectId && s.kind === 'original' && s.finishedAt !== null)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, n);
}

export function qidsOfSessions(list: Session[]): string[] {
  const out: string[] = [];
  list.forEach((s) =>
    s.items.forEach((it, i) => {
      if (s.answers[i] !== null && !out.includes(it.qid)) out.push(it.qid);
    }),
  );
  return out;
}

export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface SubjectSummary {
  totalAnswers: number;
  correct: number;
  wrong: number;
  accuracy: number | null;
  met: number;
  total: number;
}

export function subjectSummary(subject: Subject, stats: SubjectStats): SubjectSummary {
  let correct = 0;
  let wrong = 0;
  let met = 0;
  subject.questions.forEach((q) => {
    const st = stats[q.id];
    if (!st) return;
    correct += st.correct;
    wrong += st.wrong;
    if (st.seen > 0) met++;
  });
  const t = correct + wrong;
  return {
    totalAnswers: t,
    correct,
    wrong,
    accuracy: t ? Math.round((correct / t) * 1000) / 10 : null,
    met,
    total: subject.questions.length,
  };
}
