import {
  buildItems,
  filterQuestions,
  quizProgressSummary,
} from '../src/domain/quiz/engine';
import type { QStat, Question, Session, SessionItem, Subject } from '../src/domain/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function question(id: string, lesson: number, lessonIds = [lesson]): Question {
  return {
    id,
    lz: lesson,
    tit: `Lezione ${lesson}`,
    q: `Domanda ${id}`,
    opts: ['Corretta', 'Errata 1', 'Errata 2', 'Errata 3'],
    ci: 0,
    exp: '',
    origin: 'bank',
    sourceCategories: ['Paniere'],
    lessonIds,
  };
}

function makeCompletedSession(items: SessionItem[], sequence: number, kind: Session['kind'] = 'original'): Session {
  const startedAt = 1_000_000 + sequence * 10;
  return {
    id: `session-${sequence}`,
    subjectId: 'materia-test',
    kind,
    label: 'Test',
    items,
    answers: items.map(() => 0),
    answeredAt: items.map((_, index) => startedAt + index + 1),
    current: 0,
    startedAt,
    deadline: null,
    finishedAt: startedAt + items.length + 1,
  };
}

function lessonCounts(items: SessionItem[], byId: Map<string, Question>): Map<number, number> {
  const counts = new Map<number, number>();
  items.forEach((item) => {
    const lesson = byId.get(item.qid)?.lz ?? 0;
    counts.set(lesson, (counts.get(lesson) ?? 0) + 1);
  });
  return counts;
}

const lessons = Array.from({ length: 50 }, (_, index) => index + 1);
const allQuestions = lessons.flatMap((lesson) =>
  Array.from({ length: 10 }, (_, index) => question(`q-${lesson}-${index}`, lesson)),
);
const byId = new Map(allQuestions.map((item) => [item.id, item]));
const targetLessons = lessons.slice(40, 50);
const targetPool = allQuestions.filter((item) => targetLessons.includes(item.lz));

// Quote uniformi: 20 domande su 10 lezioni devono distribuirsi in modo equilibrato.
const uniformTotals = new Map(targetLessons.map((lesson) => [lesson, 0]));
let uniformMaximum = 0;
for (let trial = 0; trial < 1000; trial++) {
  const items = buildItems(targetPool, 20, {}, [], 'materia-test', false, false, targetLessons);
  const counts = lessonCounts(items, byId);
  const maximum = Math.max(...counts.values());
  uniformMaximum = Math.max(uniformMaximum, maximum);
  assert(maximum <= 4, `La lezione più presente supera 4 domande (${maximum}).`);
  targetLessons.forEach((lesson) => uniformTotals.set(lesson, (uniformTotals.get(lesson) ?? 0) + (counts.get(lesson) ?? 0)));
}
const uniformAverages = targetLessons.map((lesson) => (uniformTotals.get(lesson) ?? 0) / 1000);
assert(
  uniformAverages.every((average) => average >= 1.7 && average <= 2.3),
  `Distribuzione media non equilibrata: ${uniformAverages.map((value) => value.toFixed(2)).join(', ')}.`,
);
console.log(
  `20 domande / lezioni 41–50: media per lezione ${uniformAverages.map((value) => value.toFixed(2)).join(', ')}; massimo osservato ${uniformMaximum}.`,
);

// Le domande non viste e quelle da ripassare ricevono più peso senza rompere i limiti per lezione.
const now = Date.now();
const biasedStats: Record<string, QStat> = {};
targetPool
  .filter((item) => item.lz !== 48)
  .forEach((item) => {
    biasedStats[item.id] = {
      seen: 5,
      correct: 4,
      wrong: 1,
      lastSeen: now - 5 * 24 * 60 * 60 * 1000,
    };
  });
const biasedTotals = new Map(targetLessons.map((lesson) => [lesson, 0]));
let biasedMaximum = 0;
for (let trial = 0; trial < 1000; trial++) {
  const items = buildItems(targetPool, 20, biasedStats, [], 'materia-test', false, false, targetLessons);
  const counts = lessonCounts(items, byId);
  biasedMaximum = Math.max(biasedMaximum, ...counts.values());
  assert(Math.max(...counts.values()) <= 4, 'Le statistiche sbilanciate hanno superato il limite per lezione.');
  targetLessons.forEach((lesson) => biasedTotals.set(lesson, (biasedTotals.get(lesson) ?? 0) + (counts.get(lesson) ?? 0)));
}
const biasedAverages = targetLessons.map((lesson) => (biasedTotals.get(lesson) ?? 0) / 1000);
console.log(
  `Con lezione 48 mai vista: medie ${biasedAverages.map((value) => value.toFixed(2)).join(', ')}; massimo osservato ${biasedMaximum}.`,
);

// La quota Inedite viene scelta per prima e poi completata mantenendo le quote delle lezioni.
const mixedPool = targetLessons.flatMap((lesson) => [
  ...Array.from({ length: 10 }, (_, index) => question(`mixed-p-${lesson}-${index}`, lesson)),
  ...Array.from({ length: 4 }, (_, index) => ({
    ...question(`mixed-i-${lesson}-${index}`, lesson),
    origin: 'exam' as const,
    sourceCategories: ['Inedite'],
  })),
]);
const mixedById = new Map(mixedPool.map((item) => [item.id, item]));
for (let trial = 0; trial < 100; trial++) {
  const items = buildItems(mixedPool, 20, {}, [], 'materia-test', false, true, targetLessons);
  const inediteCount = items.filter((item) => mixedById.get(item.qid)?.sourceCategories?.includes('Inedite')).length;
  const counts = lessonCounts(items, mixedById);
  assert(inediteCount === 3, `Quota Inedite non rispettata nel quiz misto (${inediteCount}).`);
  assert(Math.max(...counts.values()) <= 4, 'Le Inedite hanno rotto la quota massima per lezione.');
}
console.log('Quiz misto: 100 prove, quota di 3 Inedite mantenuta e massimo 4 domande per lezione.');

// Con meno domande che lezioni, ogni lezione scelta compare una volta sola.
const twentyLessons = lessons.slice(0, 20);
const twentyLessonPool = allQuestions.filter((item) => twentyLessons.includes(item.lz));
for (let trial = 0; trial < 1000; trial++) {
  const items = buildItems(twentyLessonPool, 10, {}, [], 'materia-test', false, false, twentyLessons);
  const counts = lessonCounts(items, byId);
  assert(items.length === 10 && counts.size === 10, 'Un quiz da 10 domande non ha scelto 10 lezioni distinte.');
  assert([...counts.values()].every((count) => count === 1), 'Una lezione è stata scelta più di una volta.');
}
console.log('10 domande / 20 lezioni: 1000 prove, sempre 10 lezioni diverse.');

// Una nuova prova con gli stessi filtri deve cambiare sia selezione sia ordine.
const repeatedFilterSessions: Session[] = [];
let previousSelection = new Set<string>();
let previousQuestionOrder: string[] = [];
for (let trial = 0; trial < 100; trial++) {
  const items = buildItems(twentyLessonPool, 10, {}, repeatedFilterSessions, 'materia-test', false, false, twentyLessons);
  const selected = new Set(items.map((item) => item.qid));
  const order = items.map((item) => item.qid);
  if (trial > 0) {
    assert(
      [...selected].some((id) => !previousSelection.has(id)),
      'Due prove consecutive hanno mantenuto la stessa selezione di domande.',
    );
    assert(order.join('|') !== previousQuestionOrder.join('|'), 'Due prove consecutive hanno mantenuto lo stesso ordine.');
  }
  previousSelection = selected;
  previousQuestionOrder = order;
  repeatedFilterSessions.push(makeCompletedSession(items, trial));
}
console.log('Prove consecutive con filtri uguali: 100 coppie, selezione e ordine sempre diversi.');

// Il Fisher–Yates bilancia le posizioni e mantiene una distribuzione uniforme su 1000 prove.
const answerPositionPool = targetPool.slice(0, 20);
const answerPositionCounts = [0, 0, 0, 0];
for (let trial = 0; trial < 1000; trial++) {
  const items = buildItems(answerPositionPool, 20, {}, [], 'materia-test', false);
  const perQuiz = [0, 0, 0, 0];
  items.forEach((item) => {
    const question = byId.get(item.qid)!;
    const position = item.order.indexOf(question.ci);
    answerPositionCounts[position]++;
    perQuiz[position]++;
  });
  assert(Math.max(...perQuiz) <= 8, `Una posizione è stata corretta in più del 40% della prova (${perQuiz.join(', ')}).`);
}
const answerPositionPercentages = answerPositionCounts.map((count) => (count / 200).toFixed(1));
assert(
  answerPositionCounts.every((count) => count >= 4000 && count <= 6000),
  `Posizioni corrette fuori dalla fascia 20–30%: ${answerPositionCounts.join(', ')}.`,
);
console.log(`Risposte corrette su 1000 prove: ${answerPositionPercentages.join('%, ')}% (max 8/20 in ogni prova).`);

// Anche "Ripeti tutto" rimescola domanda e risposte ad ogni avvio.
const repeatPool = allQuestions.slice(0, 12);
const repeatSessions: Session[] = [];
let previousRepeat: SessionItem[] = [];
for (let trial = 0; trial < 50; trial++) {
  const items = buildItems(repeatPool, null, {}, repeatSessions, 'materia-test', false);
  if (trial > 0) {
    assert(
      items.map((item) => item.qid).join('|') !== previousRepeat.map((item) => item.qid).join('|'),
      'Ripeti tutto ha mantenuto l’ordine delle domande della prova precedente.',
    );
    const previousOrders = new Map(previousRepeat.map((item) => [item.qid, item.order]));
    assert(
      items.every((item) => JSON.stringify(item.order) !== JSON.stringify(previousOrders.get(item.qid))),
      'Ripeti tutto ha mantenuto la permutazione delle risposte di una domanda.',
    );
  }
  previousRepeat = items;
  repeatSessions.push(makeCompletedSession(items, trial, 'repeat'));
}
console.log('Ripeti tutto: 50 avvii, nessun ordine o insieme di risposte ripetuto di seguito.');

// Il riepilogo considera i filtri scelti ma non restringe il conteggio allo stato selezionato.
const progressSubject: Subject = {
  id: 'materia-test',
  title: 'Materia di test',
  createdAt: 0,
  updatedAt: 0,
  lessons: lessons.map((number) => ({ number, title: `Lezione ${number}` })),
  questions: allQuestions,
};
const progressStats: Record<string, QStat> = {};
allQuestions.forEach((item) => {
  const questionIndex = Number(item.id.split('-').at(-1));
  if (questionIndex === 0 || questionIndex === 1) {
    progressStats[item.id] = {
      seen: 1,
      correct: questionIndex === 0 ? 1 : 0,
      wrong: questionIndex === 1 ? 1 : 0,
      lastSeen: now,
    };
  }
});
const selectedProgressPool = filterQuestions(
  progressSubject,
  progressStats,
  { categories: ['Paniere'], lessons: targetLessons, status: 'all', onlyDates: false, mode: 'mixed' },
  1,
  lessons.length,
);
const progress = quizProgressSummary(selectedProgressPool, progressStats);
assert(
  progress.totalQuestions === 100 &&
    progress.seenQuestions === 20 &&
    progress.unseenQuestions === 80 &&
    progress.wrongQuestions === 10,
  `Riepilogo lezioni inatteso: ${JSON.stringify(progress)}.`,
);
const wrongOnlyPool = filterQuestions(
  progressSubject,
  progressStats,
  { categories: ['Paniere'], lessons: targetLessons, status: 'wrong', onlyDates: false, mode: 'mixed' },
  1,
  lessons.length,
);
assert(wrongOnlyPool.length === 10 && progress.totalQuestions === 100, 'Il riepilogo non ignora Stato delle domande.');
console.log(
  `Riepilogo lezioni 41–50: Y=${progress.totalQuestions}, V=${progress.seenQuestions}, M=${progress.unseenQuestions}, S=${progress.wrongQuestions}, ${progress.seenPercent}%.`,
);
