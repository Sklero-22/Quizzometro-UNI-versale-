import type { AppData, Lesson, Question, Subject } from '../domain/types';
import { DEFAULT_REPO_URL, defaultSettings } from '../domain/types';
import seed from './seedData';

export type RestoreMode = 'replace_all' | 'merge_overwrite' | 'overwrite_common_only';

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function sameSubject(a: Subject, b: Subject): boolean {
  if (a.id === b.id) return true;
  if (a.subjectKey && b.subjectKey) return a.subjectKey === b.subjectKey;
  if (a.sourceUrl && b.sourceUrl) return a.sourceUrl === b.sourceUrl;
  return normalize(a.title) === normalize(b.title);
}

function sameQuestion(a: Question, b: Question): boolean {
  return a.id === b.id || (!!a.sourceId && !!b.sourceId && a.sourceId === b.sourceId) || normalize(a.q) === normalize(b.q);
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}~backup${suffix++}`;
  used.add(id);
  return id;
}

function mergeLessons(
  current: Lesson[] | undefined,
  incoming: Lesson[] | undefined,
  addMissing: boolean,
): Lesson[] | undefined {
  if (!incoming?.length) return current;
  const lessons = new Map((current ?? []).map((lesson) => [lesson.number, lesson.title]));
  incoming.forEach((lesson) => {
    if (addMissing || lessons.has(lesson.number)) lessons.set(lesson.number, lesson.title);
  });
  return [...lessons.entries()].sort((a, b) => a[0] - b[0]).map(([number, title]) => ({ number, title }));
}

export function isPristineInstall(data: AppData): boolean {
  const initialSubjects = (seed as unknown as Subject[]).filter((subject) => subject.id === 'arti_visuali');
  const defaults = defaultSettings();
  return (
    JSON.stringify(data.subjects) === JSON.stringify(initialSubjects) &&
    data.activeSubjectId === (initialSubjects[0]?.id ?? null) &&
    data.activeSessionId === null &&
    data.sessions.length === 0 &&
    Object.keys(data.stats).length === 0 &&
    Object.values(data.savedQuestionIds ?? {}).every((questionIds) => questionIds.length === 0) &&
    data.settings.repoUrl === DEFAULT_REPO_URL &&
    data.settings.lastN === defaults.lastN &&
    data.settings.dismissedTag === null
  );
}

/** Restores an archive in full or merges only the records allowed by the selected mode. */
export function restoreAppData(current: AppData, backup: AppData, mode: RestoreMode): AppData {
  if (mode === 'replace_all') return { ...backup, savedQuestionIds: backup.savedQuestionIds ?? {} };

  const subjects = current.subjects.map((subject) => ({
    ...subject,
    questions: subject.questions.map((question) => ({ ...question })),
    lessons: subject.lessons?.map((lesson) => ({ ...lesson })),
  }));
  const usedSubjectIds = new Set(subjects.map((subject) => subject.id));
  const subjectIds = new Map<string, string>();
  const questionIds = new Map<string, Map<string, string>>();
  const commonQuestionIds = new Map<string, Set<string>>();
  const claimedCurrentSubjects = new Set<string>();

  backup.subjects.forEach((incoming) => {
    const currentIndex = subjects.findIndex(
      (subject) => !claimedCurrentSubjects.has(subject.id) && sameSubject(subject, incoming),
    );

    if (currentIndex < 0) {
      if (mode === 'overwrite_common_only') return;
      const subjectId = uniqueId(incoming.id, usedSubjectIds);
      const usedQuestionIds = new Set<string>();
      const mappedQuestions = new Map<string, string>();
      const added = {
        ...incoming,
        id: subjectId,
        questions: incoming.questions.map((question) => {
          const questionId = uniqueId(question.id, usedQuestionIds);
          mappedQuestions.set(question.id, questionId);
          return { ...question, id: questionId };
        }),
        lessons: incoming.lessons?.map((lesson) => ({ ...lesson })),
      };
      subjects.push(added);
      subjectIds.set(incoming.id, subjectId);
      questionIds.set(incoming.id, mappedQuestions);
      commonQuestionIds.set(incoming.id, new Set());
      return;
    }

    const current = subjects[currentIndex];
    claimedCurrentSubjects.add(current.id);
    subjectIds.set(incoming.id, current.id);
    const questions = current.questions.map((question) => ({ ...question }));
    const usedQuestionIds = new Set(questions.map((question) => question.id));
    const mappedQuestions = new Map<string, string>();
    const sharedQuestions = new Set<string>();

    incoming.questions.forEach((question) => {
      const existingIndex = questions.findIndex((candidate) => sameQuestion(candidate, question));
      if (existingIndex >= 0) {
        const existing = questions[existingIndex];
        mappedQuestions.set(question.id, existing.id);
        sharedQuestions.add(existing.id);
        questions[existingIndex] = { ...question, id: existing.id };
      } else if (mode === 'merge_overwrite') {
        const questionId = uniqueId(question.id, usedQuestionIds);
        mappedQuestions.set(question.id, questionId);
        questions.push({ ...question, id: questionId });
      }
    });

    subjects[currentIndex] = {
      ...current,
      title: incoming.title,
      subjectKey: incoming.subjectKey ?? current.subjectKey,
      sourceUrl: incoming.sourceUrl ?? current.sourceUrl,
      questions,
      lessons: mergeLessons(current.lessons, incoming.lessons, mode === 'merge_overwrite'),
      updatedAt: incoming.updatedAt,
    };
    questionIds.set(incoming.id, mappedQuestions);
    commonQuestionIds.set(incoming.id, sharedQuestions);
  });

  const stats: AppData['stats'] = Object.fromEntries(
    Object.entries(current.stats).map(([subjectId, byQuestion]) => [subjectId, { ...byQuestion }]),
  );
  backup.subjects.forEach((incoming) => {
    const targetSubjectId = subjectIds.get(incoming.id);
    const mappedQuestions = questionIds.get(incoming.id);
    if (!targetSubjectId || !mappedQuestions) return;

    const currentStats = { ...(stats[targetSubjectId] ?? {}) };
    const importedStats = new Map<string, AppData['stats'][string][string]>();
    Object.entries(backup.stats[incoming.id] ?? {}).forEach(([questionId, stat]) => {
      const targetQuestionId = mappedQuestions.get(questionId);
      if (targetQuestionId) importedStats.set(targetQuestionId, stat);
    });

    const shared = commonQuestionIds.get(incoming.id) ?? new Set<string>();
    shared.forEach((questionId) => {
      const stat = importedStats.get(questionId);
      if (stat) currentStats[questionId] = stat;
      else delete currentStats[questionId];
    });
    if (mode === 'merge_overwrite') {
      importedStats.forEach((stat, questionId) => {
        if (!shared.has(questionId)) currentStats[questionId] = stat;
      });
    }
    stats[targetSubjectId] = currentStats;
  });

  const savedQuestionIds: AppData['savedQuestionIds'] = Object.fromEntries(
    Object.entries(current.savedQuestionIds ?? {}).map(([subjectId, questionIds]) => [subjectId, [...questionIds]]),
  );
  backup.subjects.forEach((incoming) => {
    const targetSubjectId = subjectIds.get(incoming.id);
    const mappedQuestions = questionIds.get(incoming.id);
    if (!targetSubjectId || !mappedQuestions) return;

    const incomingSaved = new Set(
      (backup.savedQuestionIds?.[incoming.id] ?? [])
        .map((questionId) => mappedQuestions.get(questionId))
        .filter((questionId): questionId is string => !!questionId),
    );
    const shared = commonQuestionIds.get(incoming.id) ?? new Set<string>();
    const mergedSaved = new Set(savedQuestionIds[targetSubjectId] ?? []);

    shared.forEach((questionId) => {
      if (incomingSaved.has(questionId)) mergedSaved.add(questionId);
      else mergedSaved.delete(questionId);
    });
    if (mode === 'merge_overwrite') incomingSaved.forEach((questionId) => mergedSaved.add(questionId));

    const validIds = new Set(subjects.find((subject) => subject.id === targetSubjectId)?.questions.map((question) => question.id) ?? []);
    const retained = [...mergedSaved].filter((questionId) => validIds.has(questionId));
    if (retained.length) savedQuestionIds[targetSubjectId] = retained;
    else delete savedQuestionIds[targetSubjectId];
  });

  const sessions = current.sessions.map((session) => ({
    ...session,
    items: session.items.map((item) => ({ ...item })),
    answers: [...session.answers],
    answeredAt: [...session.answeredAt],
  }));
  const currentSessionIds = new Set(sessions.map((session) => session.id));
  const restoredSessionIds = new Set<string>();

  backup.sessions.forEach((session) => {
    const subjectId = subjectIds.get(session.subjectId);
    const mappedQuestions = questionIds.get(session.subjectId);
    if (!subjectId || !mappedQuestions) return;
    const items = session.items.map((item) => {
      const qid = mappedQuestions.get(item.qid);
      return qid ? { ...item, qid } : null;
    });
    if (items.some((item) => item === null)) return;

    const restored = {
      ...session,
      subjectId,
      items: items as AppData['sessions'][number]['items'],
    };
    const index = sessions.findIndex((currentSession) => currentSession.id === session.id);
    if (index >= 0) {
      sessions[index] = restored;
      restoredSessionIds.add(session.id);
    } else if (mode === 'merge_overwrite') {
      sessions.push(restored);
      currentSessionIds.add(session.id);
      restoredSessionIds.add(session.id);
    }
  });

  const activeSubjectId = backup.activeSubjectId ? subjectIds.get(backup.activeSubjectId) ?? current.activeSubjectId : current.activeSubjectId;
  const activeSessionId =
    backup.activeSessionId && restoredSessionIds.has(backup.activeSessionId)
      ? backup.activeSessionId
      : current.activeSessionId && currentSessionIds.has(current.activeSessionId)
        ? current.activeSessionId
        : null;

  return {
    ...current,
    subjects,
    stats,
    savedQuestionIds,
    sessions,
    activeSubjectId,
    activeSessionId,
    settings: backup.settings,
  };
}
