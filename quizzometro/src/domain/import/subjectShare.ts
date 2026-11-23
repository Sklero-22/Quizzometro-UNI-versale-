import type { Question, Subject } from '../types';
import { categoryLabel } from './parse';

export interface SharedSubjectQuestion {
  id: string;
  lezioni: number[];
  domanda: string;
  risposta_corretta: string;
  risposte_errate: string[];
  spiegazione: string;
  fonte: string;
}

export interface SharedSubjectFile {
  corso: string;
  id_materia: string;
  link?: string;
  aggiornato: string;
  lezioni: { n: number; t: string }[];
  domande: SharedSubjectQuestion[];
}

export interface SubjectShareExport {
  fileName: string;
  text: string;
  data: SharedSubjectFile;
}

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sourceFor(question: Question): string {
  const categories = question.sourceCategories ?? [];
  const inedite = categories.find((category) => categoryLabel(category) === 'Inedite');
  if (inedite) return 'inedita';
  const paniere = categories.find((category) => categoryLabel(category) === 'Paniere');
  if (paniere) return 'paniere';
  if (categories.length) return categoryLabel(categories[0]) || categories[0];
  return question.origin === 'exam' ? 'esami già svolti' : 'paniere';
}

function lessonIdsFor(question: Question): number[] {
  const ids = question.lessonIds?.length ? question.lessonIds : question.lz > 0 ? [question.lz] : [];
  return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function sharedQuestion(question: Question): SharedSubjectQuestion {
  const correct = question.opts[question.ci];
  if (!correct) throw new Error(`La domanda ${question.id} non ha una risposta corretta esportabile.`);
  return {
    id: question.id,
    lezioni: lessonIdsFor(question),
    domanda: question.q,
    risposta_corretta: correct,
    risposte_errate: question.opts.filter((_, index) => index !== question.ci),
    spiegazione: question.exp ?? '',
    fonte: sourceFor(question),
  };
}

function safeMateriaName(title: string): string {
  return (
    title
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/_+/g, '_') || 'Materia'
  );
}

/** Esporta soltanto la materia e le sue domande, mai statistiche o dati personali. */
export function createSubjectShareExport(subject: Subject, date = new Date()): SubjectShareExport {
  const lessonMap = new Map<number, string>();
  (subject.lessons ?? []).forEach((lesson) => lessonMap.set(lesson.number, lesson.title));
  subject.questions.forEach((question) => {
    lessonIdsFor(question).forEach((number) => {
      if (!lessonMap.has(number)) lessonMap.set(number, `Lezione ${number}`);
    });
  });

  const updated = localDate(date);
  const data: SharedSubjectFile = {
    corso: subject.title,
    id_materia: subject.subjectKey || subject.id,
    ...(subject.sourceUrl ? { link: subject.sourceUrl } : {}),
    aggiornato: updated,
    lezioni: [...lessonMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([n, t]) => ({ n, t: t || `Lezione ${n}` })),
    domande: subject.questions.map(sharedQuestion),
  };

  return {
    fileName: `quiz_${safeMateriaName(subject.title)}_${updated}.json`,
    text: `${JSON.stringify(data, null, 2)}\n`,
    data,
  };
}
