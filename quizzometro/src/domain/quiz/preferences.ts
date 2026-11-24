import { allCategories, allLessons } from './engine';
import type { QuizPreferences, Settings, Subject } from '../types';

const STATUSES = new Set<QuizPreferences['status']>(['all', 'seen', 'unseen', 'wrong', 'recover', 'review']);
const COUNTS = new Set([10, 20, 30]);
const TIMERS = new Set([10, 20, 30]);

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function defaultQuizPreferences(subject: Subject): QuizPreferences {
  return {
    mode: 'mixed',
    countSel: 20,
    customCount: '',
    timerSel: 'off',
    customTimer: '',
    status: 'all',
    onlyDates: false,
    categories: 'all',
    lessons: 'all',
    lessonQuickN: Math.min(10, allLessons(subject).length),
    showFilters: false,
    intervalFrom: '',
    intervalTo: '',
  };
}

/** Discard deleted categories/lessons and clamp the quick-selection amount to this subject. */
export function validateQuizPreferences(value: unknown, subject: Subject): QuizPreferences {
  const raw = asRecord(value);
  const defaults = defaultQuizPreferences(subject);
  const categorySet = new Set(allCategories(subject));
  const lessonSet = new Set(allLessons(subject).map((lesson) => lesson.number));

  let categories: 'all' | string[];
  if (raw.categories === 'all' || !Array.isArray(raw.categories)) {
    categories = 'all';
  } else {
    const valid = [...new Set(raw.categories.filter((item): item is string => typeof item === 'string' && categorySet.has(item)))];
    categories = valid.length ? valid : 'all';
  }

  let lessons: 'all' | number[];
  if (raw.lessons === 'all' || !Array.isArray(raw.lessons)) {
    lessons = 'all';
  } else {
    const valid = [...new Set(
      raw.lessons.filter(
        (item): item is number => typeof item === 'number' && Number.isInteger(item) && lessonSet.has(item),
      ),
    )];
    lessons = valid.length ? valid : 'all';
  }

  const lessonCount = lessonSet.size;
  const rawQuickN = typeof raw.lessonQuickN === 'number' ? Math.floor(raw.lessonQuickN) : defaults.lessonQuickN;
  const lessonQuickN = lessonCount === 0 ? 0 : Math.max(1, Math.min(lessonCount, rawQuickN));

  return {
    mode: raw.mode === 'inedite' ? 'inedite' : 'mixed',
    countSel: raw.countSel === 'all' || raw.countSel === 'custom' ||
      (typeof raw.countSel === 'number' && COUNTS.has(raw.countSel))
      ? (raw.countSel as QuizPreferences['countSel'])
      : defaults.countSel,
    customCount: typeof raw.customCount === 'string' ? raw.customCount.replace(/[^0-9]/g, '').slice(0, 5) : '',
    timerSel: raw.timerSel === 'off' || raw.timerSel === 'custom' ||
      (typeof raw.timerSel === 'number' && TIMERS.has(raw.timerSel))
      ? (raw.timerSel as QuizPreferences['timerSel'])
      : defaults.timerSel,
    customTimer: typeof raw.customTimer === 'string' ? raw.customTimer.replace(/[^0-9]/g, '').slice(0, 4) : '',
    status: typeof raw.status === 'string' && STATUSES.has(raw.status as QuizPreferences['status'])
      ? (raw.status as QuizPreferences['status'])
      : defaults.status,
    onlyDates: typeof raw.onlyDates === 'boolean' ? raw.onlyDates : defaults.onlyDates,
    categories,
    lessons,
    lessonQuickN,
    showFilters: typeof raw.showFilters === 'boolean' ? raw.showFilters : defaults.showFilters,
    intervalFrom: typeof raw.intervalFrom === 'string' ? raw.intervalFrom.replace(/[^0-9]/g, '').slice(0, 4) : '',
    intervalTo: typeof raw.intervalTo === 'string' ? raw.intervalTo.replace(/[^0-9]/g, '').slice(0, 4) : '',
  };
}

function inheritedPreferences(value: unknown, subject: Subject): QuizPreferences {
  const base = defaultQuizPreferences(subject);
  if (value === undefined || value === null) return base;
  const inherited = validateQuizPreferences(value, subject);
  return {
    ...base,
    mode: inherited.mode,
    countSel: inherited.countSel,
    customCount: inherited.customCount,
    timerSel: inherited.timerSel,
    customTimer: inherited.customTimer,
    status: inherited.status,
    onlyDates: inherited.onlyDates,
  };
}

export function quizPreferencesForSubject(settings: Settings, subject: Subject): QuizPreferences {
  const saved = settings.quizPrefs?.[subject.id];
  if (saved) return validateQuizPreferences(saved, subject);
  const last = settings.lastQuizSubjectId ? settings.quizPrefs?.[settings.lastQuizSubjectId] : undefined;
  return inheritedPreferences(last, subject);
}

export function saveQuizPreferenceForSubject(
  settings: Settings,
  subject: Subject,
  preferences: QuizPreferences,
): Settings {
  return {
    ...settings,
    quizPrefs: {
      ...settings.quizPrefs,
      [subject.id]: validateQuizPreferences(preferences, subject),
    },
    lastQuizSubjectId: subject.id,
  };
}

/** Validate and remove stored preference entries for subjects no longer in the archive. */
export function normalizeQuizSettings(settings: Settings, subjects: Subject[]): Settings {
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const quizPrefs: Record<string, QuizPreferences> = {};
  Object.entries(settings.quizPrefs ?? {}).forEach(([subjectId, preferences]) => {
    const subject = subjectsById.get(subjectId);
    if (subject) quizPrefs[subjectId] = validateQuizPreferences(preferences, subject);
  });
  const lastQuizSubjectId =
    settings.lastQuizSubjectId && quizPrefs[settings.lastQuizSubjectId] ? settings.lastQuizSubjectId : null;
  return { ...settings, quizPrefs, lastQuizSubjectId };
}

export function firstNLessons(subject: Subject, count: number): number[] {
  const numbers = allLessons(subject).map((lesson) => lesson.number);
  const n = Math.max(0, Math.min(numbers.length, Math.floor(count)));
  return numbers.slice(0, n);
}

export function lastNLessons(subject: Subject, count: number): number[] {
  const numbers = allLessons(subject).map((lesson) => lesson.number);
  const n = Math.max(0, Math.min(numbers.length, Math.floor(count)));
  return n === 0 ? [] : numbers.slice(-n);
}

export function lessonsInRange(subject: Subject, from: number, to: number): number[] {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  return allLessons(subject)
    .map((lesson) => lesson.number)
    .filter((number) => number >= low && number <= high);
}
