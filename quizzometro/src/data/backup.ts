import { z } from 'zod';
import type { AppData } from '../domain/types';

const question = z.object({
  id: z.string().min(1),
  lz: z.number(),
  tit: z.string(),
  q: z.string().min(1),
  opts: z.array(z.string()).min(2).max(6),
  ci: z.number().int(),
  exp: z.string(),
  origin: z.enum(['bank', 'exam']).optional(),
  sourceCategories: z.array(z.string()).optional(),
  lessonIds: z.array(z.number()).optional(),
  sourceId: z.string().optional(),
});

const subject = z.object({
  id: z.string().min(1),
  title: z.string(),
  subjectKey: z.string().optional(),
  questions: z.array(question),
  lessons: z.array(z.object({ number: z.number(), title: z.string() })).optional(),
  sourceUrl: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const qstat = z.object({
  seen: z.number(),
  correct: z.number(),
  wrong: z.number(),
  lastSeen: z.number(),
  lp: z.number().optional(),
  log: z.array(z.object({ t: z.number(), ok: z.boolean() })).max(40).optional(),
});

const session = z.object({
  id: z.string().min(1),
  subjectId: z.string(),
  kind: z.enum(['original', 'review', 'repeat']),
  label: z.string(),
  items: z.array(z.object({ qid: z.string(), order: z.array(z.number()) })),
  answers: z.array(z.number().nullable()),
  answeredAt: z.array(z.number().nullable()),
  current: z.number(),
  startedAt: z.number(),
  deadline: z.number().nullable(),
  finishedAt: z.number().nullable(),
  endReason: z.enum(['completed', 'partial', 'timeout']).optional(),
  sourceSessionId: z.string().optional(),
});

const release = z.object({
  tag: z.string(),
  name: z.string(),
  version: z.string(),
  apkUrl: z.string().nullable(),
  apkName: z.string().nullable(),
  htmlUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
});

const quizPreference = z.object({
  mode: z.enum(['mixed', 'inedite']),
  countSel: z.union([z.literal(10), z.literal(20), z.literal(30), z.enum(['all', 'custom'])]),
  customCount: z.string(),
  timerSel: z.union([z.literal(10), z.literal(20), z.literal(30), z.enum(['off', 'custom'])]),
  customTimer: z.string(),
  status: z.enum(['all', 'seen', 'unseen', 'wrong', 'recover', 'review']),
  onlyDates: z.boolean(),
  categories: z.union([z.literal('all'), z.array(z.string())]),
  lessons: z.union([z.literal('all'), z.array(z.number().int())]),
  lessonQuickN: z.number().int().nonnegative(),
  showFilters: z.boolean(),
  intervalFrom: z.string(),
  intervalTo: z.string(),
});

const appData = z.object({
  schema: z.literal(1),
  subjects: z.array(subject),
  activeSubjectId: z.string().nullable(),
  stats: z.record(z.string(), z.record(z.string(), qstat)),
  savedQuestionIds: z.record(z.string(), z.array(z.string())).default({}),
  sessions: z.array(session),
  activeSessionId: z.string().nullable(),
  settings: z.object({
    repoUrl: z.string(),
    lastN: z.number(),
    lastUpdateCheck: z.number().nullable(),
    latestRelease: release.nullable(),
    updateError: z.string().nullable(),
    dismissedTag: z.string().nullable(),
    quizPrefs: z.record(z.string(), quizPreference).default({}),
    lastQuizSubjectId: z.string().nullable().default(null),
  }),
});

const envelope = z.object({
  app: z.literal('quizzometro'),
  exportedAt: z.number(),
  data: appData,
});

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${String(d.getMilliseconds()).padStart(3, '0')}`;
  return `quizzometro-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${stamp}.json`;
}

export function serializeBackup(data: AppData): string {
  return JSON.stringify({ app: 'quizzometro', exportedAt: Date.now(), data });
}

export interface BackupSummary {
  data: AppData;
  exportedAt: number;
  subjects: number;
  questions: number;
  sessions: number;
  lastActivity: number | null;
}

/** Valida struttura e coerenza referenziale. Lancia Error con messaggio leggibile. */
export function validateBackup(text: string): BackupSummary {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un JSON valido.');
  }
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Il file non è un backup Quizzometro valido (schema non riconosciuto).');
  }
  const { data, exportedAt } = parsed.data;
  const subjectIds = new Set<string>();
  const questionIdsBySubject = new Map<string, Set<string>>();
  for (const s of data.subjects) {
    if (subjectIds.has(s.id)) throw new Error(`ID materia duplicato: ${s.id}`);
    subjectIds.add(s.id);
    const qids = new Set<string>();
    for (const q of s.questions) {
      if (qids.has(q.id)) throw new Error(`ID domanda duplicato in "${s.title}": ${q.id}`);
      qids.add(q.id);
      if (q.ci < 0 || q.ci >= q.opts.length) throw new Error(`Risposta corretta non valida (${q.id}) in "${s.title}".`);
    }
    questionIdsBySubject.set(s.id, qids);
  }
  if (data.activeSubjectId && !subjectIds.has(data.activeSubjectId)) {
    throw new Error('La materia attiva indicata nel backup non esiste.');
  }
  for (const sid of Object.keys(data.stats)) {
    if (!subjectIds.has(sid)) throw new Error('Il backup contiene statistiche di una materia inesistente.');
  }
  for (const [subjectId, savedIds] of Object.entries(data.savedQuestionIds)) {
    const questionIds = questionIdsBySubject.get(subjectId);
    if (!questionIds) throw new Error('Il backup contiene segnalibri di una materia inesistente.');
    if (new Set(savedIds).size !== savedIds.length) throw new Error('Il backup contiene domande salvate duplicate.');
    if (savedIds.some((questionId) => !questionIds.has(questionId))) {
      throw new Error('Il backup contiene un segnalibro per una domanda inesistente.');
    }
  }
  const sessionIds = new Set<string>();
  for (const s of data.sessions) {
    if (sessionIds.has(s.id)) throw new Error(`ID sessione duplicato: ${s.id}`);
    sessionIds.add(s.id);
    if (!subjectIds.has(s.subjectId)) throw new Error('Il backup contiene una sessione di una materia inesistente.');
    if (s.answers.length !== s.items.length || s.answeredAt.length !== s.items.length) {
      throw new Error('Una sessione del backup ha risposte incoerenti.');
    }
  }
  if (data.activeSessionId && !sessionIds.has(data.activeSessionId)) {
    throw new Error('La sessione attiva indicata nel backup non esiste.');
  }
  let last: number | null = null;
  for (const s of data.sessions) {
    const t = s.finishedAt ?? s.startedAt;
    if (last === null || t > last) last = t;
  }
  return {
    data: data as AppData,
    exportedAt,
    subjects: data.subjects.length,
    questions: data.subjects.reduce((n, s) => n + s.questions.length, 0),
    sessions: data.sessions.length,
    lastActivity: last,
  };
}
