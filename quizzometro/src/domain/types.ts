export type QuestionOrigin = 'bank' | 'exam';

export interface Question {
  id: string;
  lz: number;
  tit: string;
  q: string;
  opts: string[];
  ci: number;
  exp: string;
  origin?: QuestionOrigin;
  sourceCategories?: string[];
  lessonIds?: number[];
  sourceId?: string;
}

export interface Lesson {
  number: number;
  title: string;
}

export interface Subject {
  id: string;
  title: string;
  /** id_materia del file importato: chiave stabile per gli aggiornamenti */
  subjectKey?: string;
  questions: Question[];
  lessons?: Lesson[];
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QStat {
  seen: number;
  correct: number;
  wrong: number;
  lastSeen: number;
  /** posizione (0-based) in cui la risposta corretta era mostrata l'ultima volta */
  lp?: number;
  /** Ultime risposte registrate; può mancare nei dati precedenti alla 1.0.14. */
  log?: AnswerLogEntry[];
}

export interface AnswerLogEntry {
  t: number;
  ok: boolean;
}

export type SessionKind = 'original' | 'review' | 'repeat';
export type EndReason = 'completed' | 'partial' | 'timeout';

export interface SessionItem {
  qid: string;
  /** order[posizioneMostrata] = indice originale dell'opzione */
  order: number[];
}

export interface Session {
  id: string;
  subjectId: string;
  kind: SessionKind;
  label: string;
  items: SessionItem[];
  answers: (number | null)[];
  answeredAt: (number | null)[];
  current: number;
  startedAt: number;
  deadline: number | null;
  finishedAt: number | null;
  endReason?: EndReason;
  sourceSessionId?: string;
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  version: string;
  apkUrl: string | null;
  apkName: string | null;
  apkSha256?: string | null;
  apkSize?: number | null;
  htmlUrl: string | null;
  publishedAt: string | null;
}

export type QuizCountSelection = 10 | 20 | 30 | 'all' | 'custom';
export type QuizTimerSelection = 10 | 20 | 30 | 'off' | 'custom';
export type QuizPreferenceStatus = 'all' | 'seen' | 'unseen' | 'wrong' | 'recover' | 'review';

export interface QuizPreferences {
  mode: 'mixed' | 'inedite';
  countSel: QuizCountSelection;
  customCount: string;
  timerSel: QuizTimerSelection;
  customTimer: string;
  status: QuizPreferenceStatus;
  onlyDates: boolean;
  categories: 'all' | string[];
  lessons: 'all' | number[];
  lessonQuickN: number;
  showFilters: boolean;
  intervalFrom: string;
  intervalTo: string;
}

export interface Settings {
  repoUrl: string;
  lastN: number;
  lastUpdateCheck: number | null;
  latestRelease: ReleaseInfo | null;
  updateError: string | null;
  dismissedTag: string | null;
  quizPrefs: Record<string, QuizPreferences>;
  lastQuizSubjectId: string | null;
}

export interface AppData {
  schema: 1;
  subjects: Subject[];
  activeSubjectId: string | null;
  stats: Record<string, Record<string, QStat>>;
  savedQuestionIds: Record<string, string[]>;
  sessions: Session[];
  activeSessionId: string | null;
  settings: Settings;
}

export const DEFAULT_REPO_URL = 'https://github.com/Sklero-22/Quizzometro-UNI-versale-';

export const defaultSettings = (): Settings => ({
  repoUrl: DEFAULT_REPO_URL,
  lastN: 3,
  lastUpdateCheck: null,
  latestRelease: null,
  updateError: null,
  dismissedTag: null,
  quizPrefs: {},
  lastQuizSubjectId: null,
});
