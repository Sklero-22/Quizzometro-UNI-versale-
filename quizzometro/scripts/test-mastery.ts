import { serializeBackup, validateBackup } from '../src/data/backup';
import {
  MASTERY_LOG_LIMIT,
  masteryStateForQuestion,
  rebuildMissingAnswerLogs,
  summarizeMastery,
  summarizePeriod,
} from '../src/domain/quiz/mastery';
import { defaultSettings, type AppData, type Question, type Subject } from '../src/domain/types';
import { restoreAppData } from '../src/data/restore';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const day = (number: number) => new Date(2026, 0, number, 12, 0, 0, 0).getTime();
const q: Question = {
  id: 'q1',
  lz: 1,
  tit: 'Lezione 1',
  q: 'Quale risposta è corretta?',
  opts: ['Corretta', 'Errata'],
  ci: 0,
  exp: '',
};

assert(
  masteryStateForQuestion(
    [
      { t: day(1), ok: true },
      { t: day(1) + 60_000, ok: true },
      { t: day(1) + 120_000, ok: true },
    ],
    true,
    day(1),
  ) === 'consolidating',
  'Tre risposte corrette nello stesso giorno non devono bastare per risultare imparata.',
);

assert(
  masteryStateForQuestion([{ t: day(1), ok: true }, { t: day(3), ok: true }], true, day(3)) === 'learned',
  'Una risposta corretta nei giorni 1 e 3 deve risultare imparata.',
);

assert(
  masteryStateForQuestion([{ t: day(1), ok: true }, { t: day(2), ok: true }], true, day(2)) === 'consolidating',
  'Due risposte corrette a un solo giorno di distanza devono restare in consolidamento.',
);

const recoveredLog = [{ t: day(1), ok: false }, { t: day(5), ok: true }, { t: day(8), ok: true }];
assert(masteryStateForQuestion(recoveredLog, true, day(8)) === 'learned', 'La sequenza errore, corrette a distanza deve essere imparata.');
const recovered = summarizeMastery(
  [q],
  { q1: { seen: 3, correct: 2, wrong: 1, lastSeen: day(8), log: recoveredLog } },
  day(8),
);
assert(recovered.recoveredCount === 1 && recovered.recoveryPercent === 100, 'La domanda recuperata deve entrare nella percentuale di recupero.');
const periodRecovery = summarizePeriod(
  [q],
  { q1: { seen: 3, correct: 2, wrong: 1, lastSeen: day(8), log: recoveredLog } },
  'all',
  day(8),
);
assert(
  periodRecovery.totalAnswers === 3 &&
    periodRecovery.accuracyPercent === 66.7 &&
    periodRecovery.recoveryCount === 1 &&
    periodRecovery.recoveryPercent === 100,
  'Riepilogo del periodo, accuratezza e recupero devono usare le risposte registrate.',
);

assert(
  masteryStateForQuestion(
    [{ t: day(1), ok: true }, { t: day(3), ok: true }, { t: day(5), ok: false }],
    true,
    day(5),
  ) === 'recover',
  'Una domanda imparata che viene sbagliata deve tornare da recuperare.',
);

assert(
  masteryStateForQuestion([{ t: day(1), ok: true }, { t: day(3), ok: true }], true, day(34)) === 'review',
  'Una domanda imparata senza ripasso per 31 giorni deve diventare da ripassare.',
);

assert(
  masteryStateForQuestion([{ t: day(1), ok: false }, { t: day(1) + 60_000, ok: true }], true, day(1)) === 'recover',
  'Nella stessa giornata deve contare solo la prima risposta.',
);

const q2 = { ...q, id: 'q2', q: 'Seconda domanda?' };
const migrationSessions = [
  {
    subjectId: 's1',
    items: Array.from({ length: 45 }, () => ({ qid: 'q1' })),
    answers: Array.from({ length: 45 }, (_, index) => (index === 0 ? 1 : 0)),
    answeredAt: Array.from({ length: 45 }, (_, index) => day(index + 1)),
  },
  {
    subjectId: 's1',
    items: [{ qid: 'q2' }],
    answers: [1],
    answeredAt: [day(3)],
  },
];
const migrated = rebuildMissingAnswerLogs(
  [q, q2],
  's1',
  { q1: { seen: 50, correct: 45, wrong: 5, lastSeen: day(45) } },
  migrationSessions,
);
assert(migrated.q1.log?.length === MASTERY_LOG_LIMIT, 'La migrazione deve limitare il registro a 40 voci.');
assert(migrated.q1.log?.[0].t === day(6), 'La migrazione deve conservare le 40 voci più recenti in ordine cronologico.');
assert(migrated.q1.seen === 50 && migrated.q1.wrong === 5, 'La migrazione non deve sovrascrivere i contatori già salvati.');
assert(migrated.q2.log?.[0].ok === false, 'La migrazione deve ricostruire la correttezza dalla risposta della sessione.');
assert(!migrated.q2.log?.[0].ok || migrated.q2.log.length === 1, 'La migrazione deve mantenere la singola risposta ricostruita.');
assert(!migrated.q1.log?.some((entry) => entry.t === day(1)), 'Le risposte più vecchie devono essere scartate oltre il limite.');

const subject: Subject = {
  id: 's1',
  title: 'Materia di prova',
  questions: [q, q2],
  createdAt: day(1),
  updatedAt: day(1),
};
const backupData: AppData = {
  schema: 1,
  subjects: [subject],
  activeSubjectId: subject.id,
  stats: { s1: { q1: { seen: 2, correct: 1, wrong: 1, lastSeen: day(3), log: recoveredLog } } },
  savedQuestionIds: {},
  sessions: [],
  activeSessionId: null,
  settings: defaultSettings(),
};

const newBackupText = serializeBackup(backupData);
const newBackup = validateBackup(newBackupText);
assert(
  JSON.stringify(newBackup.data.stats.s1.q1.log) === JSON.stringify(recoveredLog),
  'Il nuovo backup deve conservare il registro.',
);

const oldBackupObject = JSON.parse(newBackupText) as { data: AppData };
delete oldBackupObject.data.stats.s1.q1.log;
const oldBackup = validateBackup(JSON.stringify(oldBackupObject));
assert(oldBackup.data.stats.s1.q1.log === undefined, 'Un backup precedente senza registro deve restare valido.');
assert(
  rebuildMissingAnswerLogs(
    [q, q2],
    's1',
    restoreAppData(backupData, oldBackup.data, 'replace_all').stats.s1,
    migrationSessions,
  ).q1.log?.length === MASTERY_LOG_LIMIT,
  'Il registro di un backup precedente deve poter essere ricostruito dalle sessioni salvate.',
);

console.log('Test stati, prime risposte giornaliere, recupero, ripasso, migrazione e backup retrocompatibile superati.');
