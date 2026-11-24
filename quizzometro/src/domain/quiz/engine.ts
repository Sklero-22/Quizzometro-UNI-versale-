import type { QStat, Question, Session, SessionItem, SessionKind, Subject } from '../types';
import { masteryStateForQuestion } from './mastery';

export type StatusFilter = 'all' | 'seen' | 'unseen' | 'wrong' | 'recover' | 'review';
export type QuizMode = 'mixed' | 'inedite';
export const INEDITE_QUIZ_PERCENT = 15;

export const QUESTION_SELECTION_WEIGHTS = {
  neverSeen: 3,
  wrongRateBase: 1,
  wrongRateMultiplier: 2,
  lastCompletedQuiz: 0.3,
  seenWithin24Hours: 0.6,
  ageStepDays: 7,
  maxAgeMultiplier: 2,
  recoverStateMultiplier: 2,
  reviewStateMultiplier: 1.5,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

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

export interface QuizProgressSummary {
  totalQuestions: number;
  seenQuestions: number;
  unseenQuestions: number;
  wrongQuestions: number;
  seenPercent: number;
}

export function quizProgressSummary(pool: Question[], stats: SubjectStats): QuizProgressSummary {
  let seenQuestions = 0;
  let wrongQuestions = 0;
  pool.forEach((question) => {
    const stat = stats[question.id];
    if (stat?.seen) seenQuestions++;
    if (stat?.wrong) wrongQuestions++;
  });
  const totalQuestions = pool.length;
  return {
    totalQuestions,
    seenQuestions,
    unseenQuestions: totalQuestions - seenQuestions,
    wrongQuestions,
    seenPercent: totalQuestions ? Math.round((seenQuestions / totalQuestions) * 100) : 0,
  };
}

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
  const now = Date.now();
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
    if (cfg.status === 'recover' && masteryStateForQuestion(st?.log, (st?.seen ?? 0) > 0, now) !== 'recover') return false;
    if (cfg.status === 'review' && masteryStateForQuestion(st?.log, (st?.seen ?? 0) > 0, now) !== 'review') return false;
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

function interleaveByLesson(qs: Question[], lessonById?: Map<string, string>): Question[] {
  if (!lessonById || qs.length < 2) return shuffle(qs.slice());

  const buckets = new Map<string, Question[]>();
  qs.forEach((question) => {
    const key = lessonById.get(question.id) ?? `lesson:${question.lz || 0}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(question);
    buckets.set(key, bucket);
  });
  buckets.forEach((bucket, key) => buckets.set(key, shuffle(bucket)));

  const remaining = new Map([...buckets].map(([key, bucket]) => [key, bucket.slice()]));
  const result: Question[] = [];
  let previous: string | null = null;
  while (result.length < qs.length) {
    let eligible = [...remaining.entries()].filter(([key, bucket]) => bucket.length && key !== previous);
    if (!eligible.length) eligible = [...remaining.entries()].filter(([, bucket]) => bucket.length);
    const largest = Math.max(...eligible.map(([, bucket]) => bucket.length));
    const candidates = eligible.filter(([, bucket]) => bucket.length === largest);
    const [key, bucket] = candidates[rnd(candidates.length)];
    result.push(bucket.pop()!);
    previous = key;
  }
  return result;
}

/**
 * Ordine delle domande: tra molti mescolamenti casuali sceglie quello che si
 * allontana di più da come le domande sono già state viste (stessa posizione,
 * coppie consecutive, stesso test d'origine o stessa lezione in fila).
 */
export function mixQuestions(
  qs: Question[],
  history: string[][],
  lastIds: string[],
  lessonById?: Map<string, string>,
): Question[] {
  const n = qs.length;
  if (n < 3) return interleaveByLesson(qs, lessonById);
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
        const previousLesson = lessonById?.get(p.id) ?? `lesson:${p.lz || 0}`;
        const currentLesson = lessonById?.get(id) ?? `lesson:${q.lz || 0}`;
        if (previousLesson === currentLesson) c += 12;
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
    const o = interleaveByLesson(shuffle(qs.slice()), lessonById);
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
export function mixOptions(
  q: Question,
  lastPos: number | undefined,
  desiredCorrectPosition?: number,
  previousOrder?: number[],
): number[] {
  const order = shuffle(q.opts.map((_, i) => i));
  const placeCorrectAt = (position: number) => {
    const target = Math.max(0, Math.min(order.length - 1, position));
    const current = order.indexOf(q.ci);
    if (current !== target) [order[current], order[target]] = [order[target], order[current]];
  };

  if (desiredCorrectPosition !== undefined && order.length > 1) {
    let target = Math.max(0, Math.min(order.length - 1, desiredCorrectPosition));
    if (lastPos !== undefined && target === lastPos) {
      const alternatives = order.map((_, i) => i).filter((i) => i !== lastPos);
      target = alternatives[rnd(alternatives.length)];
    }
    placeCorrectAt(target);
  } else if (lastPos !== undefined && order.length > 1 && order.indexOf(q.ci) === lastPos) {
    let j = rnd(order.length - 1);
    if (j >= lastPos) j++;
    placeCorrectAt(j);
  }

  const samePrevious =
    previousOrder?.length === order.length && previousOrder.every((option, i) => option === order[i]);
  if (samePrevious && order.length > 1) {
    const correctAt = order.indexOf(q.ci);
    const wrongPositions = order.map((_, i) => i).filter((i) => i !== correctAt);
    if (wrongPositions.length > 1) {
      const first = rnd(wrongPositions.length);
      let second = rnd(wrongPositions.length - 1);
      if (second >= first) second++;
      [order[wrongPositions[first]], order[wrongPositions[second]]] = [
        order[wrongPositions[second]],
        order[wrongPositions[first]],
      ];
    } else {
      const alternatives = order.map((_, i) => i).filter((i) => i !== correctAt && i !== lastPos);
      const target = alternatives.length
        ? alternatives[rnd(alternatives.length)]
        : order.map((_, i) => i).find((i) => i !== correctAt)!;
      placeCorrectAt(target);
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

function lastCompletedQuiz(sessions: Session[], subjectId: string): Session | undefined {
  return sessions
    .filter((s) => s.subjectId === subjectId && s.finishedAt !== null)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || b.startedAt - a.startedAt)[0];
}

interface LessonQuestionGroup {
  key: string;
  number: number | null;
  questions: Question[];
}

function assignQuestionsToLessons(pool: Question[], selectedLessons?: number[]) {
  const selected = new Set(selectedLessons ?? []);
  const entries = shuffle(
    pool.map((question) => ({
      question,
      lessons: [...new Set(questionLessons(question))].filter(
        (lesson) => selectedLessons === undefined || selected.has(lesson),
      ),
    })),
  ).sort((a, b) => a.lessons.length - b.lessons.length);
  const groups = new Map<string, LessonQuestionGroup>();
  const lessonById = new Map<string, string>();

  entries.forEach(({ question, lessons }) => {
    let number: number | null = null;
    if (lessons.length) {
      const minimum = Math.min(...lessons.map((lesson) => groups.get(`lesson:${lesson}`)?.questions.length ?? 0));
      const leastLoaded = lessons.filter(
        (lesson) => (groups.get(`lesson:${lesson}`)?.questions.length ?? 0) === minimum,
      );
      number = leastLoaded[rnd(leastLoaded.length)];
    }
    const key = number === null ? 'lesson:unassigned' : `lesson:${number}`;
    const group = groups.get(key) ?? { key, number, questions: [] };
    group.questions.push(question);
    groups.set(key, group);
    lessonById.set(question.id, key);
  });

  return { groups: [...groups.values()], lessonById };
}

function lessonPracticeWeight(group: LessonQuestionGroup, stats: SubjectStats, now: number): number {
  const latestPractice = group.questions.reduce((latest, question) => Math.max(latest, stats[question.id]?.lastSeen ?? 0), 0);
  if (!latestPractice) return QUESTION_SELECTION_WEIGHTS.maxAgeMultiplier;
  const daysSincePractice = Math.max(0, (now - latestPractice) / DAY_MS);
  return Math.min(
    QUESTION_SELECTION_WEIGHTS.maxAgeMultiplier,
    1 + daysSincePractice / QUESTION_SELECTION_WEIGHTS.ageStepDays,
  );
}

function chooseWeighted<T>(items: T[], weight: (item: T) => number): T {
  const weights = items.map((item) => Math.max(Number.EPSILON, weight(item)));
  const total = weights.reduce((sum, current) => sum + current, 0);
  let target = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    target -= weights[i];
    if (target < 0) return items[i];
  }
  return items[items.length - 1];
}

function questionPracticeWeight(
  question: Question,
  stats: SubjectStats,
  lastCompletedIds: Set<string>,
  now: number,
): number {
  const stat = stats[question.id];
  let weight = 1;
  if (!stat || stat.seen <= 0) {
    weight *= QUESTION_SELECTION_WEIGHTS.neverSeen;
  } else {
    const errorRate = Math.max(0, Math.min(1, stat.wrong / stat.seen));
    weight *= QUESTION_SELECTION_WEIGHTS.wrongRateBase + QUESTION_SELECTION_WEIGHTS.wrongRateMultiplier * errorRate;
    const daysSinceSeen = stat.lastSeen > 0 ? Math.max(0, (now - stat.lastSeen) / DAY_MS) : 0;
    weight *= Math.min(
      QUESTION_SELECTION_WEIGHTS.maxAgeMultiplier,
      1 + daysSinceSeen / QUESTION_SELECTION_WEIGHTS.ageStepDays,
    );
    if (stat.lastSeen > 0 && now >= stat.lastSeen && now - stat.lastSeen <= DAY_MS) {
      weight *= QUESTION_SELECTION_WEIGHTS.seenWithin24Hours;
    }
  }
  const mastery = masteryStateForQuestion(stat?.log, (stat?.seen ?? 0) > 0, now);
  if (mastery === 'recover') weight *= QUESTION_SELECTION_WEIGHTS.recoverStateMultiplier;
  if (mastery === 'review') weight *= QUESTION_SELECTION_WEIGHTS.reviewStateMultiplier;
  if (lastCompletedIds.has(question.id)) weight *= QUESTION_SELECTION_WEIGHTS.lastCompletedQuiz;
  return Math.max(Number.EPSILON, weight);
}

function weightedQuestionOrder(
  questions: Question[],
  stats: SubjectStats,
  lastCompletedIds: Set<string>,
  now: number,
): Question[] {
  return questions
    .map((question) => {
      const weight = questionPracticeWeight(question, stats, lastCompletedIds, now);
      const random = Math.max(Number.EPSILON, Math.random());
      return { question, key: random ** (1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map(({ question }) => question);
}

type QuestionBucket = 'all' | 'inedite' | 'other';

function matchesBucket(question: Question, bucket: QuestionBucket): boolean {
  return bucket === 'all' || (bucket === 'inedite' ? isInediteQuestion(question) : !isInediteQuestion(question));
}

function selectBalancedByLesson(
  groups: LessonQuestionGroup[],
  count: number,
  bucket: QuestionBucket,
  stats: SubjectStats,
  lastCompletedIds: Set<string>,
  now: number,
  selectedCounts: Map<string, number>,
): Question[] {
  const queues = new Map(
    groups.map((group) => [
      group.key,
      weightedQuestionOrder(group.questions.filter((question) => matchesBucket(question, bucket)), stats, lastCompletedIds, now),
    ]),
  );
  const selected: Question[] = [];

  for (let i = 0; i < count; i++) {
    const eligible = groups.filter((group) => (queues.get(group.key)?.length ?? 0) > 0);
    if (!eligible.length) break;
    const minimum = Math.min(...eligible.map((group) => selectedCounts.get(group.key) ?? 0));
    const leastSelected = eligible.filter((group) => (selectedCounts.get(group.key) ?? 0) === minimum);
    const group = chooseWeighted(leastSelected, (candidate) => lessonPracticeWeight(candidate, stats, now));
    const question = queues.get(group.key)!.shift()!;
    selected.push(question);
    selectedCounts.set(group.key, (selectedCounts.get(group.key) ?? 0) + 1);
  }
  return selected;
}

function sameQuestionSet(left: Question[], rightIds: string[]): boolean {
  if (left.length !== rightIds.length) return false;
  const right = new Set(rightIds);
  return right.size === rightIds.length && left.every((question) => right.has(question.id));
}

function enforceDifferentSelection(
  selected: Question[],
  groups: LessonQuestionGroup[],
  lessonById: Map<string, string>,
  previousIds: string[],
  keepInediteQuota: boolean,
  stats: SubjectStats,
  lastCompletedIds: Set<string>,
  now: number,
): Question[] {
  if (!selected.length || !sameQuestionSet(selected, previousIds)) return selected;
  const selectedIds = new Set(selected.map((question) => question.id));
  const counts = new Map<string, number>();
  selected.forEach((question) => {
    const key = lessonById.get(question.id) ?? 'lesson:unassigned';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  for (const question of selected) {
    const sourceKey = lessonById.get(question.id) ?? 'lesson:unassigned';
    const category: QuestionBucket = keepInediteQuota ? (isInediteQuestion(question) ? 'inedite' : 'other') : 'all';
    const alternatives = groups.flatMap((group) =>
      group.questions
        .filter((candidate) => !selectedIds.has(candidate.id) && matchesBucket(candidate, category))
        .map((candidate) => ({ candidate, group })),
    );
    if (!alternatives.length) continue;
    const sameLesson = alternatives.filter(({ group }) => group.key === sourceKey);
    const lessLoaded = alternatives.filter(({ group }) => (counts.get(group.key) ?? 0) < (counts.get(sourceKey) ?? 0));
    const options = sameLesson.length ? sameLesson : lessLoaded.length ? lessLoaded : alternatives;
    const replacement = weightedQuestionOrder(
      options.map(({ candidate }) => candidate),
      stats,
      lastCompletedIds,
      now,
    )[0];
    return selected.map((candidate) => (candidate.id === question.id ? replacement : candidate));
  }
  return selected;
}

function lastOptionOrders(sessions: Session[], subjectId: string): Map<string, number[]> {
  const orders = new Map<string, number[]>();
  sessions
    .filter((session) => session.subjectId === subjectId)
    .slice()
    .sort((a, b) => a.startedAt - b.startedAt)
    .forEach((session) => session.items.forEach((item) => orders.set(item.qid, item.order)));
  return orders;
}

function correctPositionTargets(
  questions: Question[],
  stats: SubjectStats,
  previousOrders: Map<string, number[]>,
): number[] {
  const targets = new Array<number>(questions.length);
  const positionCounts = new Map<number, number>();
  const indices = shuffle(questions.map((_, index) => index)).sort(
    (a, b) => questions[a].opts.length - questions[b].opts.length,
  );
  const balanceRequired = questions.length >= 10;

  indices.forEach((index) => {
    const question = questions[index];
    const optionCount = Math.max(1, question.opts.length);
    const previousOrder = previousOrders.get(question.id);
    const previousPosition =
      previousOrder?.length === question.opts.length
        ? previousOrder.indexOf(question.ci)
        : stats[question.id]?.lp;
    let candidates = Array.from({ length: optionCount }, (_, position) => position);
    if (previousPosition !== undefined && previousPosition >= 0 && optionCount > 1) {
      candidates = candidates.filter((position) => position !== previousPosition);
    }
    if (!candidates.length) candidates = Array.from({ length: optionCount }, (_, position) => position);

    if (balanceRequired) {
      const cap = Math.max(Math.floor(questions.length * 0.4), Math.ceil(questions.length / optionCount));
      const underCap = candidates.filter((position) => (positionCounts.get(position) ?? 0) < cap);
      if (underCap.length) candidates = underCap;
    }
    const minimum = Math.min(...candidates.map((position) => positionCounts.get(position) ?? 0));
    const leastUsed = candidates.filter((position) => (positionCounts.get(position) ?? 0) === minimum);
    const target = leastUsed[rnd(leastUsed.length)];
    targets[index] = target;
    positionCounts.set(target, (positionCounts.get(target) ?? 0) + 1);
  });

  return targets;
}

function sameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameLessonAdjacencies(questions: Question[], lessonById: Map<string, string>): number {
  let count = 0;
  for (let i = 1; i < questions.length; i++) {
    if (lessonById.get(questions[i - 1].id) === lessonById.get(questions[i].id)) count++;
  }
  return count;
}

function ensureDifferentOrder(
  questions: Question[],
  previousIds: string[],
  lessonById: Map<string, string>,
): Question[] {
  if (questions.length < 2 || !sameOrder(questions.map((question) => question.id), previousIds)) return questions;
  const baselineAdjacencies = sameLessonAdjacencies(questions, lessonById);

  const safeSwaps: Question[][] = [];
  for (let first = 0; first < questions.length; first++) {
    for (let second = first + 1; second < questions.length; second++) {
      if (lessonById.get(questions[first].id) !== lessonById.get(questions[second].id)) continue;
      const swapped = questions.slice();
      [swapped[first], swapped[second]] = [swapped[second], swapped[first]];
      if (sameLessonAdjacencies(swapped, lessonById) <= baselineAdjacencies) safeSwaps.push(swapped);
    }
  }
  if (safeSwaps.length) return safeSwaps[rnd(safeSwaps.length)];

  for (let shift = 1; shift < questions.length; shift++) {
    const rotated = [...questions.slice(shift), ...questions.slice(0, shift)];
    if (sameLessonAdjacencies(rotated, lessonById) <= baselineAdjacencies) return rotated;
  }
  const swapped = questions.slice();
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  return swapped;
}

export function buildItems(
  pool: Question[],
  count: number | null,
  stats: SubjectStats,
  sessions: Session[],
  subjectId: string,
  _exact: boolean,
  includeInediteQuota = false,
  selectedLessons?: number[],
): SessionItem[] {
  if (!pool.length) return [];
  const last = lastCompletedQuiz(sessions, subjectId);
  const previousIds = last?.items.map((item) => item.qid) ?? [];
  const lastSet = new Set(previousIds);
  const wanted = count === null ? pool.length : Math.max(0, Math.min(Math.trunc(count), pool.length));
  const now = Date.now();
  const { groups, lessonById } = assignQuestionsToLessons(pool, selectedLessons);
  const picked: Question[] = [];
  const selectedCounts = new Map<string, number>();

  if (count === null || wanted >= pool.length) {
    picked.push(...pool);
  } else if (includeInediteQuota && pool.some(isInediteQuestion) && pool.some((question) => !isInediteQuestion(question))) {
    const inedite = pool.filter(isInediteQuestion);
    const regular = pool.filter((question) => !isInediteQuestion(question));
    const inediteTarget = Math.min(Math.round((wanted * INEDITE_QUIZ_PERCENT) / 100), inedite.length);
    const regularTarget = Math.min(wanted - inediteTarget, regular.length);
    const inediteCount = Math.min(inedite.length, wanted - regularTarget);
    picked.push(
      ...selectBalancedByLesson(groups, inediteCount, 'inedite', stats, lastSet, now, selectedCounts),
      ...selectBalancedByLesson(groups, regularTarget, 'other', stats, lastSet, now, selectedCounts),
    );
    picked.splice(
      0,
      picked.length,
      ...enforceDifferentSelection(
        picked,
        groups,
        lessonById,
        previousIds,
        true,
        stats,
        lastSet,
        now,
      ),
    );
  } else {
    picked.push(...selectBalancedByLesson(groups, wanted, 'all', stats, lastSet, now, selectedCounts));
    picked.splice(
      0,
      picked.length,
      ...enforceDifferentSelection(
        picked,
        groups,
        lessonById,
        previousIds,
        false,
        stats,
        lastSet,
        now,
      ),
    );
  }

  const interleaved = interleaveByLesson(picked, lessonById);
  const mixed = mixQuestions(interleaved, historyIds(sessions, subjectId), previousIds, lessonById);
  const ordered = ensureDifferentOrder(mixed, previousIds, lessonById);
  const previousOrders = lastOptionOrders(sessions, subjectId);
  const correctTargets = correctPositionTargets(ordered, stats, previousOrders);

  return ordered.map((question, index) => {
    const previousOrder = previousOrders.get(question.id);
    const previousPosition =
      previousOrder?.length === question.opts.length
        ? previousOrder.indexOf(question.ci)
        : stats[question.id]?.lp;
    return {
      qid: question.id,
      order: mixOptions(question, previousPosition, correctTargets[index], previousOrder),
    };
  });
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
