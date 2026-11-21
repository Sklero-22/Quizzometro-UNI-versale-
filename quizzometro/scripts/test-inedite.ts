import {
  buildItems,
  filterQuestions,
  isInediteQuestion,
  lessonProgress,
  mixOptions,
} from '../src/domain/quiz/engine';
import type { Question, Session, Subject } from '../src/domain/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function question(id: string, inedite: boolean, lessonIds: number[] = [1]): Question {
  return {
    id,
    lz: lessonIds[0] ?? 0,
    tit: lessonIds.length ? `Lezione ${lessonIds[0]}` : '',
    q: `Domanda ${id}`,
    opts: ['Corretta', 'Errata'],
    ci: 0,
    exp: '',
    origin: inedite ? 'exam' : 'bank',
    sourceCategories: [inedite ? 'Inedite' : 'Paniere'],
    lessonIds,
  };
}

function assertCount(pool: Question[], count: number, expectedInedite: number): void {
  const items = buildItems(pool, count, {}, [], 'materia', false, true);
  const ids = items.map((item) => item.qid);
  assert(ids.length === Math.min(count, pool.length), `Numero domande inatteso per il quiz da ${count}.`);
  assert(new Set(ids).size === ids.length, 'Il quiz contiene domande duplicate.');
  assert(ids.filter((id) => id.startsWith('i-')).length === expectedInedite, `Quota Inedite errata per il quiz da ${count}.`);
}

const regular = Array.from({ length: 60 }, (_, i) => question(`p-${i}`, false));
const inedite = Array.from({ length: 40 }, (_, i) => question(`i-${i}`, true));
const pool = [...regular, ...inedite];

assertCount(pool, 20, 3);
assertCount(pool, 10, 2);
assertCount(pool, 3, 0);
assertCount([...regular, ...inedite.slice(0, 2)], 20, 2);

const allItems = buildItems(pool, null, {}, [], 'materia', false, true);
assert(allItems.length === pool.length, 'La modalità tutte non include l’intero archivio.');
assert(new Set(allItems.map((item) => item.qid)).size === pool.length, 'La modalità tutte duplica delle domande.');
const startedOrder = JSON.stringify(allItems);
buildItems(pool, 20, {}, [], 'materia', false, true);
assert(JSON.stringify(allItems) === startedOrder, 'L’avvio di un nuovo quiz ha cambiato l’ordine di una prova già iniziata.');

const sourceItems = pool.slice(0, 8).map((q) => ({ qid: q.id, order: [0, 1] }));
const sourceSession: Session = {
  id: 'prova-originale',
  subjectId: 'materia',
  kind: 'original',
  label: 'Prova',
  items: sourceItems,
  answers: sourceItems.map(() => 0),
  answeredAt: sourceItems.map(() => 1),
  current: 0,
  startedAt: 1,
  deadline: null,
  finishedAt: 2,
};
const sourceOrder = sourceItems.map((item) => item.qid).join('|');
const originalRandom = Math.random;
Math.random = () => 0;
try {
  const repeatedItems = buildItems(pool.slice(0, 8), null, {}, [sourceSession], 'materia', false);
  const repeatedOrder = repeatedItems.map((item) => item.qid);
  assert(repeatedOrder.length === sourceItems.length, 'La ripetizione non contiene tutte le domande originali.');
  assert(new Set(repeatedOrder).size === sourceItems.length, 'La ripetizione contiene domande duplicate.');
  assert(repeatedOrder.join('|') !== sourceOrder, 'La ripetizione ha mantenuto l’ordine originale delle domande.');
} finally {
  Math.random = originalRandom;
}

const subject: Subject = {
  id: 'materia',
  title: 'Materia',
  createdAt: 0,
  updatedAt: 0,
  lessons: [
    { number: 1, title: 'Primo capitolo' },
    { number: 2, title: 'Secondo capitolo' },
  ],
  questions: [
    question('i-lesson-1', true, [1]),
    question('i-lesson-2', true, [2]),
    question('i-unindexed', true, []),
    question('p-lesson-1', false, [1]),
  ],
};
const onlyInedite = filterQuestions(
  subject,
  {},
  { categories: ['Paniere'], lessons: [1], status: 'all', onlyDates: false, mode: 'inedite' },
  2,
  2,
);
assert(
  onlyInedite.map((q) => q.id).sort().join('|') === ['i-lesson-1', 'i-unindexed'].sort().join('|'),
  'Il filtro Solo Inedite non rispetta categorie, capitoli o domande senza capitolo.',
);
assert(onlyInedite.every(isInediteQuestion), 'Il filtro Solo Inedite ha incluso domande normali.');
const mixedByChapter = filterQuestions(
  subject,
  {},
  { categories: ['Paniere', 'Inedite'], lessons: [1], status: 'all', onlyDates: false, mode: 'mixed' },
  2,
  2,
);
assert(
  mixedByChapter.some((q) => q.id === 'i-unindexed') &&
    mixedByChapter.some((q) => q.id === 'i-lesson-1') &&
    !mixedByChapter.some((q) => q.id === 'i-lesson-2'),
  'Il quiz misto non mantiene accessibili le Inedite senza capitolo o ignora i capitoli assegnati.',
);

const progress = lessonProgress(subject, {});
assert(progress[0]?.totalQuestions === 2 && progress[1]?.totalQuestions === 1, 'Una domanda senza capitolo è finita nei progressi di una lezione.');

const lastCorrectPosition = 0;
for (let i = 0; i < 50; i++) {
  const order = mixOptions(question('option-order', false), lastCorrectPosition);
  assert(order.length === 2 && new Set(order).size === 2, 'Il mescolamento delle risposte non è una permutazione valida.');
  assert(order.indexOf(0) !== lastCorrectPosition, 'La risposta corretta è rimasta nella stessa posizione.');
}

console.log('Verificati quota Inedite, filtri, domande senza capitolo, duplicati e ordine delle risposte.');
