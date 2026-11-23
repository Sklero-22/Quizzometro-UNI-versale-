import type { Question, Subject } from '../types';
import { planImport, type ImportPlan } from './merge';
import { categoryLabel, isExamCategory, normText, type ParsedSubject } from './parse';
import type { PastedQuestion } from './pasteParser';

export type PastePreviewStatus = 'new' | 'already-present' | 'duplicate-in-paste' | 'similar-existing';

export interface PastePreviewItem {
  pasted: PastedQuestion;
  status: PastePreviewStatus;
  id?: string;
}

export interface PasteImportPreview {
  parsed: ParsedSubject;
  plan: ImportPlan;
  items: PastePreviewItem[];
}

function comparisonKey(question: string, correct: string): string {
  return `${normText(question)}\u0000${normText(correct)}`;
}

function idsForQuestion(question: Question): string[] {
  return [question.id, question.sourceId ?? ''].filter(Boolean);
}

function numericIdPrefix(id: string): number | null {
  const match = /^(\d+)(?:\.\d+)?$/.exec(id);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function assignQuestionIds(
  subject: Subject,
  questions: PastedQuestion[],
): Array<{ pasted: PastedQuestion; question: Question }> {
  const usedIds = new Set(subject.questions.flatMap(idsForQuestion).map((id) => id.toLocaleLowerCase('en')));
  const usedBankIds = new Set<number>();
  const usedIneditaIds = new Set<number>();

  subject.questions.flatMap(idsForQuestion).forEach((id) => {
    const bankNumber = numericIdPrefix(id);
    if (bankNumber !== null) usedBankIds.add(bankNumber);
    const ineditaNumber = /^I(\d+)$/i.exec(id)?.[1];
    if (ineditaNumber) {
      const value = Number(ineditaNumber);
      if (Number.isSafeInteger(value) && value > 0) usedIneditaIds.add(value);
    }
  });

  let nextBankId = Math.max(0, ...usedBankIds) + 1;
  let nextIneditaId = 1;
  const lessons = new Map((subject.lessons ?? []).map((lesson) => [lesson.number, lesson.title]));

  return questions.map((pasted) => {
    let id: string;
    if (pasted.source === 'inedita') {
      while (usedIneditaIds.has(nextIneditaId) || usedIds.has(`i${nextIneditaId}`)) nextIneditaId++;
      id = `I${nextIneditaId}`;
      usedIneditaIds.add(nextIneditaId++);
    } else {
      while (usedBankIds.has(nextBankId) || usedIds.has(String(nextBankId))) nextBankId++;
      id = String(nextBankId);
      usedBankIds.add(nextBankId++);
    }
    usedIds.add(id.toLocaleLowerCase('en'));

    const sourceLabel = categoryLabel(pasted.source);
    const lesson = pasted.lessonIds[0] ?? 0;
    const question: Question = {
      id,
      lz: lesson,
      tit: lesson ? lessons.get(lesson) || `Lezione ${lesson}` : '',
      q: pasted.question,
      opts: [pasted.correctAnswer, ...pasted.wrongAnswers],
      ci: 0,
      exp: pasted.explanation,
      origin: isExamCategory(sourceLabel) ? 'exam' : 'bank',
      sourceCategories: [sourceLabel],
      lessonIds: [...pasted.lessonIds],
      sourceId: id,
    };
    return { pasted, question };
  });
}

/** Crea l'anteprima usando il merge esistente e filtra prima i doppioni testo+risposta corretta. */
export function createPasteImportPreview(subject: Subject, pastedQuestions: PastedQuestion[]): PasteImportPreview {
  const knownKeys = new Set(
    subject.questions.map((question) => comparisonKey(question.q, question.opts[question.ci] ?? '')),
  );
  const seenPasteKeys = new Set<string>();
  const duplicateLines = new Map<number, PastePreviewStatus>();
  const candidates: PastedQuestion[] = [];

  pastedQuestions.forEach((pasted) => {
    const key = comparisonKey(pasted.question, pasted.correctAnswer);
    if (knownKeys.has(key)) {
      duplicateLines.set(pasted.line, 'already-present');
    } else if (seenPasteKeys.has(key)) {
      duplicateLines.set(pasted.line, 'duplicate-in-paste');
    } else {
      seenPasteKeys.add(key);
      candidates.push(pasted);
    }
  });

  const assigned = assignQuestionIds(subject, candidates);
  const existingLessonNumbers = new Set((subject.lessons ?? []).map((lesson) => lesson.number));
  const lessonsToAdd = [
    ...new Set(assigned.flatMap(({ pasted }) => pasted.lessonIds)),
  ]
    .filter((number) => !existingLessonNumbers.has(number))
    .sort((a, b) => a - b)
    .map((number) => ({ number, title: `Lezione ${number}` }));

  const parsed: ParsedSubject = {
    title: subject.title,
    sourceUrl: subject.sourceUrl,
    lessons: lessonsToAdd,
    questions: assigned.map(({ question }) => question),
    discarded: [],
    warnings: [],
    format: 'json',
    subjectKey: subject.subjectKey,
  };
  const plan = planImport(subject, parsed);
  const newIds = new Set(plan.added.map((question) => question.id));
  const similarIds = new Set(plan.modified.map(({ next }) => next.id));
  const identicalIds = new Set(plan.identical.map((question) => question.id));
  const statusByLine = new Map<number, PastePreviewStatus>();
  assigned.forEach(({ pasted, question }) => {
    const status: PastePreviewStatus = newIds.has(question.id)
      ? 'new'
      : identicalIds.has(question.id)
        ? 'already-present'
        : similarIds.has(question.id)
          ? 'similar-existing'
          : 'new';
    statusByLine.set(pasted.line, status);
  });

  return {
    parsed,
    plan,
    items: pastedQuestions.map((pasted) => ({
      pasted,
      status: duplicateLines.get(pasted.line) ?? statusByLine.get(pasted.line) ?? 'new',
      id: assigned.find((entry) => entry.pasted.line === pasted.line)?.question.id,
    })),
  };
}
