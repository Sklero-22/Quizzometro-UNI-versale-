import type { AnswerLogEntry, QStat, Question, Subject } from '../types';

export const MASTERY_MIN_GAP_DAYS = 2;
export const MASTERY_REVIEW_AFTER_DAYS = 30;
export const MASTERY_LOG_LIMIT = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MASTERY_STATES = ['new', 'recover', 'consolidating', 'learned', 'review'] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];
export type MasteryPeriod = 'today' | '7days' | '30days' | 'all';

export const MASTERY_LABELS: Record<MasteryState, string> = {
  new: 'Nuova',
  recover: 'Da recuperare',
  consolidating: 'In consolidamento',
  learned: 'Imparata',
  review: 'Da ripassare',
};

export interface MasteryDistribution {
  total: number;
  counts: Record<MasteryState, number>;
  learnedPercent: number;
  statesById: Record<string, MasteryState>;
  recoveredCount: number;
  everWrongCount: number;
  recoveryPercent: number;
}

export interface DailyLearningPoint {
  day: number;
  date: number;
  answers: number;
  correct: number;
  accuracy: number;
}

export interface PeriodLearningSummary {
  totalAnswers: number;
  correctAnswers: number;
  accuracyPercent: number | null;
  daily: DailyLearningPoint[];
  recoveryCount: number;
  wrongQuestionCount: number;
  recoveryPercent: number;
}

/** Numero del giorno nel fuso locale del dispositivo, senza effetti dei cambi d'ora. */
export function localCalendarDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

export function localMidnightForDay(day: number): number {
  const date = new Date(day * DAY_MS);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).getTime();
}

export function firstAnswerPerDay(log: AnswerLogEntry[] = []): AnswerLogEntry[] {
  const firstByDay = new Map<number, AnswerLogEntry>();
  log
    .filter((entry) => Number.isFinite(entry.t) && typeof entry.ok === 'boolean')
    .slice()
    .sort((a, b) => a.t - b.t)
    .forEach((entry) => {
      const day = localCalendarDay(entry.t);
      if (!firstByDay.has(day)) firstByDay.set(day, entry);
    });
  return [...firstByDay.entries()].sort(([a], [b]) => a - b).map(([, entry]) => entry);
}

export function masteryStateForQuestion(
  log: AnswerLogEntry[] | undefined,
  hasEverBeenSeen: boolean,
  now = Date.now(),
): MasteryState {
  const days = firstAnswerPerDay(log);
  if (!days.length) return hasEverBeenSeen ? 'consolidating' : 'new';

  const last = days[days.length - 1];
  if (!last.ok) return 'recover';

  const previous = days[days.length - 2];
  if (!previous?.ok || localCalendarDay(last.t) - localCalendarDay(previous.t) < MASTERY_MIN_GAP_DAYS) {
    return 'consolidating';
  }

  return localCalendarDay(now) - localCalendarDay(last.t) > MASTERY_REVIEW_AFTER_DAYS ? 'review' : 'learned';
}

export function summarizeMastery(
  questions: Question[],
  stats: Record<string, QStat>,
  now = Date.now(),
): MasteryDistribution {
  const counts: Record<MasteryState, number> = { new: 0, recover: 0, consolidating: 0, learned: 0, review: 0 };
  const statesById: Record<string, MasteryState> = {};
  let recoveredCount = 0;
  let everWrongCount = 0;

  questions.forEach((question) => {
    const stat = stats[question.id];
    const log = stat?.log ?? [];
    const state = masteryStateForQuestion(log, (stat?.seen ?? 0) > 0, now);
    statesById[question.id] = state;
    counts[state]++;
    if (log.some((entry) => !entry.ok)) {
      everWrongCount++;
      if (state === 'learned' || state === 'review') recoveredCount++;
    }
  });

  const total = questions.length;
  return {
    total,
    counts,
    learnedPercent: total ? Math.round((counts.learned / total) * 100) : 0,
    statesById,
    recoveredCount,
    everWrongCount,
    recoveryPercent: everWrongCount ? Math.round((recoveredCount / everWrongCount) * 100) : 0,
  };
}

function periodStart(period: MasteryPeriod, now: number): number {
  if (period === 'all') return Number.NEGATIVE_INFINITY;
  const today = localCalendarDay(now);
  const daysBack = period === 'today' ? 0 : period === '7days' ? 6 : 29;
  return localMidnightForDay(today - daysBack);
}

export function summarizePeriod(
  questions: Question[],
  stats: Record<string, QStat>,
  period: MasteryPeriod,
  now = Date.now(),
): PeriodLearningSummary {
  const start = periodStart(period, now);
  const dailyMap = new Map<number, { date: number; answers: number; correct: number }>();
  const recoveryCandidates = new Map<string, { hadWrong: boolean; recoveredAfterWrong: boolean }>();
  let totalAnswers = 0;
  let correctAnswers = 0;

  questions.forEach((question) => {
    const periodLog = (stats[question.id]?.log ?? [])
      .filter((entry) => entry.t >= start && entry.t <= now)
      .slice()
      .sort((a, b) => a.t - b.t);
    if (!periodLog.length) return;

    let latestWrong: number | null = null;
    let recoveredAfterWrong = false;
    periodLog.forEach((entry) => {
      const day = localCalendarDay(entry.t);
      const point = dailyMap.get(day) ?? { date: localMidnightForDay(day), answers: 0, correct: 0 };
      point.answers++;
      if (entry.ok) {
        point.correct++;
        correctAnswers++;
        if (latestWrong !== null && entry.t > latestWrong) recoveredAfterWrong = true;
      } else {
        latestWrong = entry.t;
        recoveredAfterWrong = false;
      }
      dailyMap.set(day, point);
      totalAnswers++;
    });

    if (latestWrong !== null) {
      const state = masteryStateForQuestion(
        stats[question.id]?.log,
        (stats[question.id]?.seen ?? 0) > 0,
        now,
      );
      const candidate = recoveryCandidates.get(question.id) ?? { hadWrong: false, recoveredAfterWrong: false };
      candidate.hadWrong = true;
      candidate.recoveredAfterWrong = recoveredAfterWrong && (state === 'learned' || state === 'review');
      recoveryCandidates.set(question.id, candidate);
    }
  });

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, point]) => ({
      day,
      ...point,
      accuracy: point.answers ? Math.round((point.correct / point.answers) * 1000) / 10 : 0,
    }));
  const wrongQuestionCount = [...recoveryCandidates.values()].filter((candidate) => candidate.hadWrong).length;
  const recoveryCount = [...recoveryCandidates.values()].filter(
    (candidate) => candidate.hadWrong && candidate.recoveredAfterWrong,
  ).length;

  return {
    totalAnswers,
    correctAnswers,
    accuracyPercent: totalAnswers ? Math.round((correctAnswers / totalAnswers) * 1000) / 10 : null,
    daily,
    recoveryCount,
    wrongQuestionCount,
    recoveryPercent: wrongQuestionCount ? Math.round((recoveryCount / wrongQuestionCount) * 100) : 0,
  };
}

/** Aggiunge al registro le risposte delle sessioni salvate, senza alterare i contatori storici. */
export function rebuildMissingAnswerLogs(
  questions: Question[],
  subjectId: string,
  stats: Record<string, QStat>,
  sessions: {
    subjectId: string;
    items: { qid: string }[];
    answers: (number | null)[];
    answeredAt: (number | null)[];
  }[],
): Record<string, QStat> {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const events = new Map<string, AnswerLogEntry[]>();

  sessions.forEach((session) => {
    if (session.subjectId !== subjectId) return;
    session.items.forEach((item, index) => {
      const answer = session.answers[index];
      const timestamp = session.answeredAt[index];
      const question = byId.get(item.qid);
      if (!question || answer === null || answer === undefined || timestamp === null || timestamp === undefined) return;
      const entries = events.get(item.qid) ?? [];
      entries.push({ t: timestamp, ok: answer === question.ci });
      events.set(item.qid, entries);
    });
  });

  const migrated: Record<string, QStat> = { ...stats };
  for (const question of questions) {
    const stat = stats[question.id];
    if (stat?.log !== undefined) continue;
    const recovered = (events.get(question.id) ?? []).sort((a, b) => a.t - b.t).slice(-MASTERY_LOG_LIMIT);
    if (stat) migrated[question.id] = { ...stat, log: recovered };
    else if (recovered.length) {
      const correct = recovered.filter((entry) => entry.ok).length;
      migrated[question.id] = {
        seen: recovered.length,
        correct,
        wrong: recovered.length - correct,
        lastSeen: recovered[recovered.length - 1].t,
        log: recovered,
      };
    }
  }
  return migrated;
}
