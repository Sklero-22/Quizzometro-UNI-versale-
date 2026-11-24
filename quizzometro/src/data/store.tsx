import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  defaultSettings,
  type AppData,
  type EndReason,
  type QStat,
  type Session,
  type SessionKind,
  type Settings,
  type Subject,
} from '../domain/types';
import {
  allCategories,
  allLessons,
  buildItems,
  createSession,
  filterQuestions,
  newId,
  type QuizConfig,
} from '../domain/quiz/engine';
import { MASTERY_LOG_LIMIT, rebuildMissingAnswerLogs } from '../domain/quiz/mastery';
import { applyImport, type ImportPlan } from '../domain/import/merge';
import type { ParsedSubject } from '../domain/import/parse';
import { fetchLatestRelease, isNewer } from './releases';
import { restoreAppData, type RestoreMode } from './restore';
import seed from './seedData';

const KEY = 'quizzometro:data:v1';
const SUBJECT_KEY = (id: string) => `${KEY}:subject:${id}`;
const SESSION_KEY = (id: string) => `${KEY}:session:${id}`;
const MAX_SESSIONS = 300;
const SIX_HOURS = 6 * 60 * 60 * 1000;

interface Meta {
  schema: 1;
  subjectIds: string[];
  sessionIds: string[];
  activeSubjectId: string | null;
  activeSessionId: string | null;
  stats: AppData['stats'];
  savedQuestionIds: AppData['savedQuestionIds'];
  settings: Settings;
}

function initialData(): AppData {
  const subjects = (seed as unknown as Subject[]).filter((subject) => subject.id === 'arti_visuali');
  return {
    schema: 1,
    subjects,
    activeSubjectId: subjects[0]?.id ?? null,
    stats: {},
    savedQuestionIds: {},
    sessions: [],
    activeSessionId: null,
    settings: defaultSettings(),
  };
}

function migrate(meta: Meta): Meta {
  // Schema 1 è l'unico esistente: le migrazioni future vanno aggiunte qui, mai perdendo campi.
  if (meta.schema !== 1) throw new Error(`Versione dello schema non supportata: ${String(meta.schema)}`);
  return { ...meta, savedQuestionIds: meta.savedQuestionIds ?? {}, settings: { ...defaultSettings(), ...meta.settings } };
}

async function loadAll(): Promise<AppData> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return initialData();
  const parsed = JSON.parse(raw) as Meta;
  const meta = migrate({ ...parsed, savedQuestionIds: parsed.savedQuestionIds ?? {} });
  const subjectPairs = await AsyncStorage.multiGet(meta.subjectIds.map(SUBJECT_KEY));
  const sessionPairs = await AsyncStorage.multiGet(meta.sessionIds.map(SESSION_KEY));
  const subjects = subjectPairs.map(([k, v]) => {
    if (!v) throw new Error(`Dati mancanti per una materia (${k}).`);
    return JSON.parse(v) as Subject;
  });
  const sessions = sessionPairs.map(([k, v]) => {
    if (!v) throw new Error(`Dati mancanti per una sessione (${k}).`);
    return JSON.parse(v) as Session;
  });
  const stats = { ...(meta.stats ?? {}) };
  subjects.forEach((subject) => {
    stats[subject.id] = rebuildMissingAnswerLogs(
      subject.questions,
      subject.id,
      stats[subject.id] ?? {},
      sessions,
    );
  });
  return {
    schema: 1,
    subjects,
    sessions,
    activeSubjectId: meta.activeSubjectId,
    activeSessionId: meta.activeSessionId,
    stats,
    savedQuestionIds: meta.savedQuestionIds,
    settings: meta.settings,
  };
}

interface Persisted {
  metaSig: Meta | null;
  subjects: Map<string, Subject>;
  sessions: Map<string, Session>;
}

interface Store {
  status: 'loading' | 'ready' | 'error';
  loadError: string | null;
  data: AppData;
  activeSubject: Subject | null;
  activeSession: Session | null;
  subjectStats: (subjectId: string) => Record<string, QStat>;
  toggleSavedQuestion: (subjectId: string, questionId: string) => void;
  setActiveSubject: (id: string) => void;
  startQuiz: (subjectId: string, cfg: QuizConfig) => string | null;
  startFromQids: (args: {
    subjectId: string;
    qids: string[];
    kind: SessionKind;
    label: string;
    keepOrder: boolean;
    sourceSessionId?: string;
    timerMin?: number | null;
  }) => string | null;
  answer: (index: number, choice: number) => void;
  goTo: (index: number) => void;
  finish: (reason: EndReason) => string | null;
  archiveActive: () => void;
  applyImportPlan: (args: {
    target: Subject | undefined;
    parsed: ParsedSubject;
    plan: ImportPlan;
    approveModified: boolean;
    sourceUrl?: string;
  }) => string;
  deleteSubject: (id: string) => void;
  resetProgress: (id: string) => void;
  restoreBackup: (data: AppData, mode?: RestoreMode) => void;
  resetEverything: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  checkUpdates: (manual: boolean) => Promise<void>;
  checkingUpdates: boolean;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider mancante');
  return s;
}

function closeSession(s: Session, reason: EndReason): Session {
  return { ...s, finishedAt: Date.now(), endReason: reason };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<AppData>(() => ({ ...initialData(), subjects: [], activeSubjectId: null }));
  const [checkingUpdates, setChecking] = useState(false);
  const dataRef = useRef<AppData>(data);
  const persisted = useRef<Persisted>({ metaSig: null, subjects: new Map(), sessions: new Map() });
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const readyRef = useRef(false);
  const updateCheckInFlight = useRef<Promise<void> | null>(null);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    const next = fn(dataRef.current);
    if (next === dataRef.current) return;
    dataRef.current = next;
    setData(next);
  }, []);

  // ---- caricamento ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadAll();
        if (cancelled) return;
        const first = (await AsyncStorage.getItem(KEY)) === null;
        // sessione scaduta mentre l'app era chiusa
        let d = loaded;
        const act = d.sessions.find((s) => s.id === d.activeSessionId);
        if (act && act.finishedAt === null && act.deadline !== null && act.deadline <= Date.now()) {
          d = {
            ...d,
            sessions: d.sessions.map((s) => (s.id === act.id ? closeSession(s, 'timeout') : s)),
            activeSessionId: null,
          };
        }
        if (!first) {
          persisted.current = {
            metaSig: null,
            subjects: new Map(loaded.subjects.map((s) => [s.id, s])),
            sessions: new Map(loaded.sessions.map((s) => [s.id, s])),
          };
        }
        dataRef.current = d;
        setData(d);
        readyRef.current = true;
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- persistenza incrementale ----
  const flush = useCallback(() => {
    if (!readyRef.current) return;
    const d = dataRef.current;
    const p = persisted.current;
    const sets: [string, string][] = [];
    const removes: string[] = [];
    const nextSubjects = new Map<string, Subject>();
    d.subjects.forEach((s) => {
      nextSubjects.set(s.id, s);
      if (p.subjects.get(s.id) !== s) sets.push([SUBJECT_KEY(s.id), JSON.stringify(s)]);
    });
    p.subjects.forEach((_, id) => nextSubjects.has(id) || removes.push(SUBJECT_KEY(id)));
    const nextSessions = new Map<string, Session>();
    d.sessions.forEach((s) => {
      nextSessions.set(s.id, s);
      if (p.sessions.get(s.id) !== s) sets.push([SESSION_KEY(s.id), JSON.stringify(s)]);
    });
    p.sessions.forEach((_, id) => nextSessions.has(id) || removes.push(SESSION_KEY(id)));
    const meta: Meta = {
      schema: 1,
      subjectIds: d.subjects.map((s) => s.id),
      sessionIds: d.sessions.map((s) => s.id),
      activeSubjectId: d.activeSubjectId,
      activeSessionId: d.activeSessionId,
      stats: d.stats,
      savedQuestionIds: d.savedQuestionIds,
      settings: d.settings,
    };
    const sig = p.metaSig;
    const metaChanged =
      !sig ||
      sig.stats !== meta.stats ||
      sig.savedQuestionIds !== meta.savedQuestionIds ||
      sig.settings !== meta.settings ||
      sig.activeSubjectId !== meta.activeSubjectId ||
      sig.activeSessionId !== meta.activeSessionId ||
      sig.subjectIds.join('|') !== meta.subjectIds.join('|') ||
      sig.sessionIds.join('|') !== meta.sessionIds.join('|');
    if (!sets.length && !removes.length && !metaChanged) return;
    if (metaChanged) sets.push([KEY, JSON.stringify(meta)]);
    persisted.current = { metaSig: meta, subjects: nextSubjects, sessions: nextSessions };
    writeChain.current = writeChain.current
      .then(async () => {
        if (removes.length) await AsyncStorage.multiRemove(removes);
        // i dati pesanti prima, il meta per ultimo
        const ordered = [...sets.filter(([k]) => k !== KEY), ...sets.filter(([k]) => k === KEY)];
        for (let i = 0; i < ordered.length; i += 8) await AsyncStorage.multiSet(ordered.slice(i, i + 8));
      })
      .catch(() => {
        // forza una nuova scrittura completa al prossimo salvataggio
        persisted.current = { metaSig: null, subjects: new Map(), sessions: new Map() };
      });
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    const t = setTimeout(flush, 250);
    return () => clearTimeout(t);
  }, [data, status, flush]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flush();
    });
    return () => sub.remove();
  }, [flush]);

  // ---- aggiornamenti app ----
  const checkUpdates = useCallback(
    (manual: boolean) => {
      if (updateCheckInFlight.current) return updateCheckInFlight.current;
      const request = (async () => {
        const repoUrl = dataRef.current.settings.repoUrl;
        setChecking(true);
        try {
          const rel = await fetchLatestRelease(repoUrl);
          update((d) => ({
            ...d,
            settings: { ...d.settings, latestRelease: rel, lastUpdateCheck: Date.now(), updateError: null },
          }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Controllo non riuscito.';
          update((d) => ({
            ...d,
            settings: { ...d.settings, lastUpdateCheck: Date.now(), updateError: msg },
          }));
          if (manual) return;
        } finally {
          setChecking(false);
          updateCheckInFlight.current = null;
        }
      })();
      updateCheckInFlight.current = request;
      return request;
    },
    [update],
  );

  useEffect(() => {
    if (status !== 'ready') return;
    void checkUpdates(false);
    let wasActive = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', (nextState) => {
      const resumed = nextState === 'active' && !wasActive;
      wasActive = nextState === 'active';
      if (resumed) void checkUpdates(false);
    });
    const tick = () => {
      if (AppState.currentState !== 'active') return;
      const last = dataRef.current.settings.lastUpdateCheck;
      if (last === null || Date.now() - last >= SIX_HOURS) void checkUpdates(false);
    };
    const id = setInterval(tick, 10 * 60 * 1000);
    return () => {
      subscription.remove();
      clearInterval(id);
    };
  }, [status, checkUpdates]);

  // ---- azioni ----
  const setActiveSubject = useCallback(
    (id: string) => update((d) => (d.activeSubjectId === id ? d : { ...d, activeSubjectId: id })),
    [update],
  );

  const toggleSavedQuestion = useCallback(
    (subjectId: string, questionId: string) => {
      update((d) => {
        const subject = d.subjects.find((s) => s.id === subjectId);
        if (!subject?.questions.some((question) => question.id === questionId)) return d;
        const current = d.savedQuestionIds[subjectId] ?? [];
        const next = current.includes(questionId)
          ? current.filter((id) => id !== questionId)
          : [...current, questionId];
        const savedQuestionIds = { ...d.savedQuestionIds };
        if (next.length) savedQuestionIds[subjectId] = next;
        else delete savedQuestionIds[subjectId];
        return { ...d, savedQuestionIds };
      });
    },
    [update],
  );

  const withNewSession = (d: AppData, session: Session): AppData => {
    let sessions = d.sessions;
    // chiude come parziale l'eventuale prova incompleta
    const act = sessions.find((s) => s.id === d.activeSessionId && s.finishedAt === null);
    if (act) {
      sessions = act.answers.some((a) => a !== null)
        ? sessions.map((s) => (s.id === act.id ? closeSession(s, 'partial') : s))
        : sessions.filter((s) => s.id !== act.id);
    }
    sessions = [...sessions, session];
    if (sessions.length > MAX_SESSIONS) {
      const finished = sessions.filter((s) => s.finishedAt !== null && s.id !== session.id);
      const drop = new Set(finished.slice(0, sessions.length - MAX_SESSIONS).map((s) => s.id));
      sessions = sessions.filter((s) => !drop.has(s.id));
    }
    return { ...d, sessions, activeSessionId: session.id, activeSubjectId: session.subjectId };
  };

  const startQuiz = useCallback(
    (subjectId: string, cfg: QuizConfig): string | null => {
      const d = dataRef.current;
      const subject = d.subjects.find((s) => s.id === subjectId);
      if (!subject) return null;
      const stats = d.stats[subjectId] ?? {};
      const pool = filterQuestions(
        subject,
        stats,
        cfg,
        allCategories(subject).length,
        allLessons(subject).length,
      );
      if (!pool.length) return null;
      const items = buildItems(
        pool,
        cfg.count,
        stats,
        d.sessions,
        subjectId,
        false,
        cfg.mode !== 'inedite',
        cfg.lessons,
      );
      const session = createSession({
        subjectId,
        kind: 'original',
        label: cfg.mode === 'inedite' ? 'Solo Inedite' : 'Quiz misto',
        items,
        timerMin: cfg.timerMin,
      });
      update((cur) => withNewSession(cur, session));
      return session.id;
    },
    [update],
  );

  const startFromQids = useCallback<Store['startFromQids']>(
    ({ subjectId, qids, kind, label, keepOrder, sourceSessionId, timerMin }) => {
      const d = dataRef.current;
      const subject = d.subjects.find((s) => s.id === subjectId);
      if (!subject || !qids.length) return null;
      const byId = new Map(subject.questions.map((q) => [q.id, q]));
      const pool = qids.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => !!q);
      if (!pool.length) return null;
      const items = buildItems(pool, null, d.stats[subjectId] ?? {}, d.sessions, subjectId, keepOrder);
      const session = createSession({
        subjectId,
        kind,
        label,
        items,
        timerMin: timerMin ?? null,
        sourceSessionId,
      });
      update((cur) => withNewSession(cur, session));
      return session.id;
    },
    [update],
  );

  const answer = useCallback(
    (index: number, choice: number) => {
      update((d) => {
        const sid = d.activeSessionId;
        const s = d.sessions.find((x) => x.id === sid);
        if (!s || s.finishedAt !== null || s.answers[index] !== null || s.answers[index] === undefined) return d;
        const subject = d.subjects.find((x) => x.id === s.subjectId);
        const item = s.items[index];
        const q = subject?.questions.find((x) => x.id === item.qid);
        if (!q) return d;
        const now = Date.now();
        const answers = s.answers.slice();
        answers[index] = choice;
        const answeredAt = s.answeredAt.slice();
        answeredAt[index] = now;
        const nextSession = { ...s, answers, answeredAt };
        const subjStats = d.stats[s.subjectId] ?? {};
        const prev = subjStats[q.id] ?? { seen: 0, correct: 0, wrong: 0, lastSeen: 0 };
        const ok = choice === q.ci;
        const st: QStat = {
          seen: prev.seen + 1,
          correct: prev.correct + (ok ? 1 : 0),
          wrong: prev.wrong + (ok ? 0 : 1),
          lastSeen: now,
          lp: item.order.indexOf(q.ci),
          log: [...(prev.log ?? []), { t: now, ok }].slice(-MASTERY_LOG_LIMIT),
        };
        return {
          ...d,
          sessions: d.sessions.map((x) => (x.id === s.id ? nextSession : x)),
          stats: { ...d.stats, [s.subjectId]: { ...subjStats, [q.id]: st } },
        };
      });
    },
    [update],
  );

  const goTo = useCallback(
    (index: number) => {
      update((d) => {
        const s = d.sessions.find((x) => x.id === d.activeSessionId);
        if (!s || s.current === index || index < 0 || index >= s.items.length) return d;
        return { ...d, sessions: d.sessions.map((x) => (x.id === s.id ? { ...x, current: index } : x)) };
      });
    },
    [update],
  );

  const finish = useCallback(
    (reason: EndReason): string | null => {
      const d = dataRef.current;
      const s = d.sessions.find((x) => x.id === d.activeSessionId);
      if (!s) return null;
      update((cur) => ({
        ...cur,
        sessions: cur.sessions.map((x) => (x.id === s.id ? closeSession(x, reason) : x)),
        activeSessionId: null,
      }));
      return s.id;
    },
    [update],
  );

  const archiveActive = useCallback(() => {
    const d = dataRef.current;
    const s = d.sessions.find((x) => x.id === d.activeSessionId);
    if (!s) return;
    update((cur) => ({
      ...cur,
      sessions: s.answers.some((a) => a !== null)
        ? cur.sessions.map((x) => (x.id === s.id ? closeSession(x, 'partial') : x))
        : cur.sessions.filter((x) => x.id !== s.id),
      activeSessionId: null,
    }));
  }, [update]);

  const applyImportPlan = useCallback<Store['applyImportPlan']>(
    ({ target, parsed, plan, approveModified, sourceUrl }) => {
      const id = target?.id ?? `subj-${newId()}`;
      update((d) => {
        const merged = applyImport(target, parsed, plan, approveModified, sourceUrl, Date.now(), id);
        const subjects = target ? d.subjects.map((s) => (s.id === id ? merged : s)) : [...d.subjects, merged];
        const savedQuestionIds = { ...d.savedQuestionIds };
        const validIds = new Set(merged.questions.map((question) => question.id));
        const retained = (savedQuestionIds[id] ?? []).filter((questionId) => validIds.has(questionId));
        if (retained.length) savedQuestionIds[id] = retained;
        else delete savedQuestionIds[id];
        return { ...d, subjects, savedQuestionIds, activeSubjectId: id };
      });
      return id;
    },
    [update],
  );

  const deleteSubject = useCallback(
    (id: string) => {
      update((d) => {
        const subjects = d.subjects.filter((s) => s.id !== id);
        const stats = { ...d.stats };
        delete stats[id];
        const savedQuestionIds = { ...d.savedQuestionIds };
        delete savedQuestionIds[id];
        const sessions = d.sessions.filter((s) => s.subjectId !== id);
        const activeSessionId = sessions.some((s) => s.id === d.activeSessionId) ? d.activeSessionId : null;
        const activeSubjectId = d.activeSubjectId === id ? subjects[0]?.id ?? null : d.activeSubjectId;
        return { ...d, subjects, stats, savedQuestionIds, sessions, activeSessionId, activeSubjectId };
      });
    },
    [update],
  );

  const resetProgress = useCallback(
    (id: string) => {
      update((d) => {
        const stats = { ...d.stats };
        delete stats[id];
        const sessions = d.sessions.filter((s) => s.subjectId !== id);
        const activeSessionId = sessions.some((s) => s.id === d.activeSessionId) ? d.activeSessionId : null;
        return { ...d, stats, sessions, activeSessionId };
      });
    },
    [update],
  );

  const restoreBackup = useCallback(
    (backup: AppData, mode: RestoreMode = 'replace_all') => {
      const run = () => {
        const restored = restoreAppData(dataRef.current, backup, mode);
        const stats = { ...restored.stats };
        restored.subjects.forEach((subject) => {
          stats[subject.id] = rebuildMissingAnswerLogs(
            subject.questions,
            subject.id,
            stats[subject.id] ?? {},
            restored.sessions,
          );
        });
        const next = { ...restored, stats };
        // sostituzione integrale: forza la riscrittura di tutte le chiavi
        persisted.current = {
          metaSig: null,
          subjects: persisted.current.subjects,
          sessions: persisted.current.sessions,
        };
        dataRef.current = next;
        setData(next);
        readyRef.current = true;
        setLoadError(null);
        setStatus('ready');
      };
      run();
    },
    [],
  );

  const resetEverything = useCallback(() => {
    restoreBackup(initialData());
  }, [restoreBackup]);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
    [update],
  );

  const subjectStats = useCallback((id: string) => data.stats[id] ?? {}, [data.stats]);

  const activeSubject = useMemo(
    () => data.subjects.find((s) => s.id === data.activeSubjectId) ?? data.subjects[0] ?? null,
    [data.subjects, data.activeSubjectId],
  );
  const activeSession = useMemo(
    () => data.sessions.find((s) => s.id === data.activeSessionId && s.finishedAt === null) ?? null,
    [data.sessions, data.activeSessionId],
  );

  const value: Store = {
    status,
    loadError,
    data,
    activeSubject,
    activeSession,
    subjectStats,
    toggleSavedQuestion,
    setActiveSubject,
    startQuiz,
    startFromQids,
    answer,
    goTo,
    finish,
    archiveActive,
    applyImportPlan,
    deleteSubject,
    resetProgress,
    restoreBackup,
    resetEverything,
    updateSettings,
    checkUpdates,
    checkingUpdates,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function hasNewerRelease(d: AppData): boolean {
  const r = d.settings.latestRelease;
  return !!r && isNewer(r.tag);
}
