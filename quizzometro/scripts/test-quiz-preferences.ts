import { serializeBackup, validateBackup } from '../src/data/backup';
import { restoreAppData } from '../src/data/restore';
import {
  defaultQuizPreferences,
  firstNLessons,
  lastNLessons,
  lessonsInRange,
  normalizeQuizSettings,
  quizPreferencesForSubject,
  saveQuizPreferenceForSubject,
  validateQuizPreferences,
} from '../src/domain/quiz/preferences';
import { defaultSettings, type AppData, type Question, type Subject } from '../src/domain/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeSubject(id: string, title: string, lessonNumbers: number[], categories = ['A', 'B']): Subject {
  const questions: Question[] = lessonNumbers.map((number, index) => ({
    id: `${id}-q${index + 1}`,
    lz: number,
    tit: `Lezione ${number}`,
    q: `Domanda ${number} di ${title}`,
    opts: ['Corretta', 'Errata'],
    ci: 0,
    exp: '',
    sourceCategories: [categories[index % categories.length]],
  }));
  return {
    id,
    title,
    questions,
    lessons: lessonNumbers.map((number) => ({ number, title: `Lezione ${number}` })),
    createdAt: 1,
    updatedAt: 1,
  };
}

const lessons = [1, 2, 3, 4, 5, 7, 9, 10, 11, 12];
const subjectA = makeSubject('subject-a', 'Diritto', lessons, ['A', 'B']);
const subjectB = makeSubject('subject-b', 'Storia', [10, 20, 30], ['X', 'Y']);
const subjectNew = makeSubject('subject-new', 'Nuova materia', [101, 104, 108], ['Nuova']);

const prefsA = {
  ...defaultQuizPreferences(subjectA),
  mode: 'mixed' as const,
  countSel: 30 as const,
  customCount: '47',
  timerSel: 20 as const,
  customTimer: '15',
  status: 'recover' as const,
  onlyDates: true,
  categories: ['A'],
  lessons: [2, 7],
  lessonQuickN: 5,
  showFilters: true,
  intervalFrom: '2',
  intervalTo: '7',
};
const prefsB = {
  ...defaultQuizPreferences(subjectB),
  mode: 'inedite' as const,
  countSel: 'custom' as const,
  customCount: '36',
  timerSel: 'custom' as const,
  customTimer: '12',
  status: 'wrong' as const,
  onlyDates: true,
  categories: 'all' as const,
  lessons: 'all' as const,
  showFilters: true,
};

let settings = defaultSettings();
settings = saveQuizPreferenceForSubject(settings, subjectA, prefsA);
settings = saveQuizPreferenceForSubject(settings, subjectB, prefsB);

assert(settings.lastQuizSubjectId === subjectB.id, 'Il salvataggio deve ricordare l’ultima materia usata.');
assert(quizPreferencesForSubject(settings, subjectA).countSel === 30, 'Le impostazioni della prima materia devono restare separate.');
assert(quizPreferencesForSubject(settings, subjectA).lessons instanceof Array, 'La selezione esplicita delle lezioni deve essere conservata.');
assert(quizPreferencesForSubject(settings, subjectB).status === 'wrong', 'La seconda materia deve conservare il proprio filtro.');

const simulatedRestart = JSON.parse(JSON.stringify(settings)) as typeof settings;
const reloaded = normalizeQuizSettings(simulatedRestart, [subjectA, subjectB]);
assert(
  JSON.stringify(quizPreferencesForSubject(reloaded, subjectA)) ===
    JSON.stringify(quizPreferencesForSubject(settings, subjectA)),
  'Le preferenze devono sopravvivere a serializzazione e ricaricamento dello store.',
);
assert(
  JSON.stringify(quizPreferencesForSubject(reloaded, subjectB)) ===
    JSON.stringify(quizPreferencesForSubject(settings, subjectB)),
  'Il ricaricamento non deve mescolare le preferenze di due materie.',
);

const inherited = quizPreferencesForSubject(settings, subjectNew);
assert(inherited.mode === 'inedite' && inherited.countSel === 'custom' && inherited.customCount === '36', 'La nuova materia deve ereditare tipo e quantità.');
assert(inherited.timerSel === 'custom' && inherited.customTimer === '12' && inherited.status === 'wrong' && inherited.onlyDates, 'La nuova materia deve ereditare timer, stato e solo date.');
assert(inherited.categories === 'all' && inherited.lessons === 'all', 'Categorie e lezioni di una materia nuova devono partire da Tutte.');
assert(inherited.lessonQuickN === 3 && !inherited.showFilters, 'La selezione rapida deve partire da 10 o dal totale lezioni, senza ereditare l’apertura dei filtri.');

const stale = validateQuizPreferences(
  { ...prefsA, categories: ['eliminata'], lessons: [999], lessonQuickN: 99 },
  subjectA,
);
assert(stale.categories === 'all' && stale.lessons === 'all', 'Selezioni non più valide o vuote devono tornare a Tutte.');
assert(stale.lessonQuickN === lessons.length, 'N non deve superare il numero di lezioni esistenti.');
const partial = validateQuizPreferences({ ...prefsA, categories: ['A', 'non-esistente'], lessons: [2, 999] }, subjectA);
assert(JSON.stringify(partial.categories) === JSON.stringify(['A']), 'Le categorie valide restano selezionate e quelle eliminate vengono scartate.');
assert(JSON.stringify(partial.lessons) === JSON.stringify([2]), 'Le lezioni valide restano selezionate e quelle eliminate vengono scartate.');
assert(partial.categories !== 'all', 'Una categoria nuova resta esclusa se si usava una selezione esplicita.');
const allSelections = saveQuizPreferenceForSubject(settings, subjectA, {
  ...prefsA,
  categories: 'all',
  lessons: 'all',
});
const expandedSubjectA = makeSubject(subjectA.id, subjectA.title, [...lessons, 15], ['A', 'B', 'C']);
const expandedSettings = normalizeQuizSettings(allSelections, [expandedSubjectA, subjectB]);
const expandedPrefs = quizPreferencesForSubject(expandedSettings, expandedSubjectA);
assert(expandedPrefs.categories === 'all' && expandedPrefs.lessons === 'all', 'Tutte deve includere automaticamente nuove categorie e lezioni.');

assert(JSON.stringify(firstNLessons(subjectA, 5)) === JSON.stringify([1, 2, 3, 4, 5]), 'Primi N deve seguire i numeri delle lezioni e tollerare i buchi.');
assert(JSON.stringify(lastNLessons(subjectA, 4)) === JSON.stringify([9, 10, 11, 12]), 'Ultimi N deve selezionare le lezioni col numero più alto.');
assert(JSON.stringify(lessonsInRange(subjectA, 9, 3)) === JSON.stringify([3, 4, 5, 7, 9]), 'Intervallo deve includere gli estremi anche se inseriti al contrario.');
for (const size of [10, 45, 60]) {
  const largeSubject = makeSubject(`size-${size}`, `Materia ${size}`, Array.from({ length: size }, (_, index) => index * 2 + 1));
  assert(firstNLessons(largeSubject, 10).length === Math.min(10, size), `Primi 10 deve funzionare con ${size} lezioni.`);
  assert(lastNLessons(largeSubject, 10).length === Math.min(10, size), `Ultimi 10 deve funzionare con ${size} lezioni.`);
  assert(firstNLessons(largeSubject, 100).length === size, `N deve essere limitato al totale di ${size} lezioni.`);
}

const backupData: AppData = {
  schema: 1,
  subjects: [subjectA, subjectB],
  activeSubjectId: subjectB.id,
  stats: {},
  savedQuestionIds: {},
  sessions: [],
  activeSessionId: null,
  settings,
};
const newBackupText = serializeBackup(backupData);
const parsedNewBackup = validateBackup(newBackupText);
assert(parsedNewBackup.data.settings.quizPrefs[subjectA.id].countSel === 30, 'Il backup deve conservare le preferenze per materia.');
assert(parsedNewBackup.data.settings.lastQuizSubjectId === subjectB.id, 'Il backup deve conservare l’ultima materia usata.');

const oldBackupObject = JSON.parse(newBackupText) as { data: AppData };
delete (oldBackupObject.data.settings as Partial<AppData['settings']>).quizPrefs;
delete (oldBackupObject.data.settings as Partial<AppData['settings']>).lastQuizSubjectId;
const oldBackup = validateBackup(JSON.stringify(oldBackupObject));
assert(Object.keys(oldBackup.data.settings.quizPrefs).length === 0, 'Un backup precedente senza preferenze Quiz deve restare valido.');

const restored = restoreAppData(backupData, parsedNewBackup.data, 'replace_all');
assert(restored.settings.quizPrefs[subjectA.id].lessons instanceof Array, 'Il ripristino completo deve includere le preferenze Quiz.');

const localSubject = { ...subjectA, id: 'local-subject' };
const localData: AppData = {
  ...backupData,
  subjects: [localSubject],
  activeSubjectId: localSubject.id,
  stats: {},
  settings: defaultSettings(),
};
const mergeBackup = {
  ...parsedNewBackup.data,
  settings: { ...parsedNewBackup.data.settings, lastQuizSubjectId: subjectA.id },
};
const merged = restoreAppData(localData, mergeBackup, 'merge_overwrite');
assert(merged.settings.quizPrefs['local-subject']?.countSel === 30, 'Il ripristino selettivo deve rimappare le preferenze sulla materia corrispondente.');
assert(merged.settings.lastQuizSubjectId === 'local-subject', 'Il ripristino selettivo deve rimappare anche l’ultima materia usata.');

console.log('Preferenze separate, ricaricamento, eredità, selezione rapida, backup e ripristino verificati.');
