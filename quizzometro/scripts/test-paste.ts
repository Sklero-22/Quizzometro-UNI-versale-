import assert from 'node:assert/strict';
import { applyImport, planImport } from '../src/domain/import/merge';
import { createPasteImportPreview } from '../src/domain/import/pasteImport';
import { parsePastedQuestions } from '../src/domain/import/pasteParser';
import { parseSubjectText } from '../src/domain/import/parse';
import { createSubjectShareExport } from '../src/domain/import/subjectShare';
import type { Question, Subject } from '../src/domain/types';

function question(
  values: Partial<Question> & Pick<Question, 'id' | 'q' | 'opts' | 'ci'>,
): Question {
  return {
    id: values.id,
    lz: values.lz ?? 1,
    tit: values.tit ?? 'Lezione 1',
    q: values.q,
    opts: values.opts,
    ci: values.ci,
    exp: values.exp ?? '',
    origin: values.origin ?? 'bank',
    sourceCategories: values.sourceCategories ?? ['Paniere'],
    lessonIds: values.lessonIds ?? [1],
    sourceId: values.sourceId ?? values.id,
  };
}

const inheritedText = [
  '• LEZIONI : 18, 20',
  '– FONTE: INEDITE',
  '1. DOMANDA: Quale legge tutela la “privacy”',
  'e i dati personali?',
  'CORRETTA: Regolamento generale sulla protezione dei dati',
  'ERRATA: Codice civile',
  'ERRATA: Codice della strada',
  'ERRATA: Trattato di Maastricht',
  'SPIEGAZIONE: La norma europea disciplina il trattamento dei dati.',
  '',
  '2. DOMANDA: In quale anno è entrato in vigore il GDPR?',
  'CORRETTA: 2018',
  'ERRATE: 2016',
  'ERRATA: 2020',
  'ERRATA: 2022',
].join('\n');

const inherited = parsePastedQuestions(inheritedText);
assert.equal(inherited.errors.length, 0);
assert.equal(inherited.questions.length, 2);
assert.deepEqual(inherited.questions[0].lessonIds, [18, 20]);
assert.equal(inherited.questions[0].source, 'inedita');
assert.equal(inherited.questions[0].question, 'Quale legge tutela la "privacy" e i dati personali?');
assert.equal(inherited.questions[1].source, 'inedita');
assert.deepEqual(inherited.questions[1].lessonIds, [18, 20]);
assert.equal(inherited.questions[1].explanation, '');
assert.deepEqual(inherited.questions[1].wrongAnswers, ['2016', '2020', '2022']);

const missingCorrect = parsePastedQuestions(
  [
    'LEZIONI: 12',
    'FONTE: paniere',
    'DOMANDA: Una domanda incompleta',
    'ERRATA: A',
    'ERRATA: B',
    'ERRATA: C',
  ].join('\n'),
);
assert.equal(missingCorrect.questions.length, 0);
assert.ok(missingCorrect.errors.some((error) => error.line === 1 && error.message.includes('CORRETTA')));

const repeatedCorrect = parsePastedQuestions(
  [
    'LEZIONI: 12',
    'FONTE: paniere',
    'DOMANDA: Una domanda con due risposte corrette',
    'CORRETTA: A',
    'CORRETTA: B',
    'ERRATA: C',
    'ERRATA: D',
    'ERRATA: E',
  ].join('\n'),
);
assert.equal(repeatedCorrect.questions.length, 0);
assert.ok(repeatedCorrect.errors.some((error) => error.message.includes('una sola riga CORRETTA')));

const wrongAnswerCount = parsePastedQuestions(
  [
    'LEZIONI: 12',
    'FONTE: paniere',
    'DOMANDA: Una domanda con due risposte errate',
    'CORRETTA: A',
    'ERRATA: B',
    'ERRATA: C',
  ].join('\n'),
);
assert.equal(wrongAnswerCount.questions.length, 0);
assert.ok(wrongAnswerCount.errors.some((error) => error.message.includes('servono 3 righe ERRATA')));

const invalidMetadata = parsePastedQuestions(
  [
    'LEZIONI: zero',
    'FONTE: appunti',
    'DOMANDA: Metadati non validi',
    'CORRETTA: A',
    'ERRATA: B',
    'ERRATA: C',
    'ERRATA: D',
  ].join('\n'),
);
assert.equal(invalidMetadata.questions.length, 0);
assert.ok(invalidMetadata.errors.some((error) => error.line === 1 && error.message.includes('LEZIONI')));
assert.ok(invalidMetadata.errors.some((error) => error.line === 2 && error.message.includes('FONTE')));

const subject: Subject = {
  id: 'subject-1',
  title: 'Diritto Pubblico',
  subjectKey: 'diritto_pubblico',
  sourceUrl: 'https://claude.ai/artifact/example',
  createdAt: 1,
  updatedAt: 1,
  lessons: [{ number: 1, title: 'Ordinamento giuridico' }],
  questions: [
    question({
      id: '1.1',
      sourceId: '1.1',
      q: 'La teoria della separazione dei poteri è stata elaborata inizialmente da?',
      opts: ['Montesquieu!', 'Rousseau', 'Hobbes', 'Machiavelli'],
      ci: 0,
    }),
    question({
      id: 'I2',
      sourceId: 'I2',
      lz: 2,
      tit: 'Lezione 2',
      q: 'Domanda inedita già presente',
      opts: ['Risposta corretta', 'Errata 1', 'Errata 2', 'Errata 3'],
      ci: 0,
      origin: 'exam',
      sourceCategories: ['Inedite'],
      lessonIds: [2],
    }),
  ],
};

const additions = parsePastedQuestions(
  [
    'LEZIONI: 1',
    'FONTE: paniere',
    'DOMANDA: La teoria della separazione dei poteri è stata elaborata inizialmente da',
    'CORRETTA: Montesquieu',
    'ERRATA: Autore 1',
    'ERRATA: Autore 2',
    'ERRATA: Autore 3',
    '',
    'LEZIONI: 19',
    'FONTE: Paniere',
    'DOMANDA: Quale organo approva il bilancio dello Stato?',
    'CORRETTA: Il Parlamento',
    'ERRATA: La Corte costituzionale',
    'ERRATA: Il Governo da solo',
    'ERRATA: La Banca d’Italia',
    '',
    'LEZIONI: 20',
    'FONTE: inedito',
    'DOMANDA: Domanda nuova fuori paniere',
    'CORRETTA: Risposta corretta',
    'ERRATA: Errata 1',
    'ERRATA: Errata 2',
    'ERRATA: Errata 3',
    '',
    'LEZIONI: 20',
    'FONTE: inedita',
    'DOMANDA: Domanda nuova fuori paniere',
    'CORRETTA: Risposta corretta',
    'ERRATA: Errata 1',
    'ERRATA: Errata 2',
    'ERRATA: Errata 3',
  ].join('\n'),
);
assert.equal(additions.errors.length, 0);
const pastePreview = createPasteImportPreview(subject, additions.questions);
assert.deepEqual(
  pastePreview.items.map((item) => item.status),
  ['already-present', 'new', 'new', 'duplicate-in-paste'],
);
assert.deepEqual(
  pastePreview.parsed.questions.map((item) => item.id),
  ['2', 'I1'],
);
assert.deepEqual(pastePreview.parsed.lessons, [
  { number: 19, title: 'Lezione 19' },
  { number: 20, title: 'Lezione 20' },
]);
assert.equal(pastePreview.plan.added.length, 2);

const exportSubject: Subject = {
  ...subject,
  lessons: [
    { number: 1, title: 'L’ordinamento giuridico' },
    { number: 2, title: 'Fonti del diritto' },
  ],
  questions: [
    question({
      id: '1.1',
      sourceId: '1.1',
      q: 'La teoria della separazione dei poteri è stata elaborata inizialmente da',
      opts: ['Montesquieu', 'Rousseau', 'Hobbes', 'Machiavelli'],
      ci: 0,
      exp: 'La teoria è associata a Montesquieu.',
      sourceCategories: ['Paniere'],
    }),
    question({
      id: 'I2',
      sourceId: 'I2',
      lz: 2,
      tit: 'Fonti del diritto',
      q: 'Domanda inedita già presente',
      opts: ['Risposta corretta', 'Errata 1', 'Errata 2', 'Errata 3'],
      ci: 0,
      origin: 'exam',
      sourceCategories: ['Inedite'],
      lessonIds: [2],
    }),
  ],
};

const stats = {
  [exportSubject.id]: {
    '1.1': { seen: 7, correct: 5, wrong: 2 },
    I2: { seen: 3, correct: 1, wrong: 2 },
  },
};
const statsBefore = JSON.stringify(stats);
const fixedDate = new Date(2026, 10, 23);
const exported = createSubjectShareExport(exportSubject, fixedDate);
const exportedData = JSON.parse(exported.text) as Record<string, unknown>;
assert.equal(exported.fileName, 'quiz_Diritto_Pubblico_2026-11-23.json');
assert.deepEqual(Object.keys(exportedData), ['corso', 'id_materia', 'link', 'aggiornato', 'lezioni', 'domande']);
assert.deepEqual(Object.keys((exportedData.domande as Record<string, unknown>[])[0]), [
  'id',
  'lezioni',
  'domanda',
  'risposta_corretta',
  'risposte_errate',
  'spiegazione',
  'fonte',
]);
assert.equal(exportedData.id_materia, 'diritto_pubblico');
assert.equal(exportedData.link, exportSubject.sourceUrl);
assert.equal('statistiche' in exportedData, false);
assert.equal('progressi' in exportedData, false);

const reimported = parseSubjectText(exported.text, exported.fileName);
const reimportPlan = planImport(exportSubject, reimported);
assert.equal(reimportPlan.added.length, 0, 'Il file condiviso non deve creare doppioni');
assert.equal(reimportPlan.identical.length, exportSubject.questions.length);
const merged = applyImport(
  exportSubject,
  reimported,
  reimportPlan,
  false,
  exportSubject.sourceUrl,
  1234,
  exportSubject.id,
);
assert.deepEqual(
  merged.questions.map((item) => item.id),
  exportSubject.questions.map((item) => item.id),
  'Gli ID delle domande restano uguali, quindi le statistiche restano associate',
);
assert.equal(merged.questions.length, exportSubject.questions.length);
assert.equal(JSON.stringify(stats), statsBefore, 'Le statistiche non vengono incluse né modificate dal file condiviso');
const reexported = createSubjectShareExport(
  {
    ...exportSubject,
    questions: reimported.questions,
    lessons: reimported.lessons,
  },
  fixedDate,
);
assert.deepEqual(JSON.parse(reexported.text), exportedData, 'Esportazione e reimportazione mantengono lo stesso JSON');

console.log('OK: parser, anteprima, deduplicazione e condivisione JSON verificati.');
