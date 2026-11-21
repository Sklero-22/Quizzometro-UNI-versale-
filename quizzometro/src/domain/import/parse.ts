import type { Lesson, Question, QuestionOrigin } from '../types';

export type DefaultOrigin = 'bank' | 'exam' | 'auto';

export interface Discarded {
  ref: string;
  reason: string;
}

export interface ParsedSubject {
  title: string;
  sourceUrl?: string;
  lessons: Lesson[];
  questions: Question[];
  discarded: Discarded[];
  warnings: string[];
  format: 'json' | 'html';
  /** id_materia dichiarato nel file: identificativo stabile per gli aggiornamenti. */
  subjectKey?: string;
}

type Raw = Record<string, unknown>;

const BANK_KEYS = ['domande', 'questions', 'bank'];
const TITLE_KEYS = ['corso', 'title', 'subject', 'name'];

function isObj(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function firstDefined(o: Raw, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

export function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Parser sicuro per letterali JavaScript (oggetti, array, stringhe, numeri,
 * true/false/null, chiavi senza apici, virgole finali, commenti).
 * Non esegue mai codice: qualunque altra espressione fa fallire il parsing.
 */
class LiteralParser {
  private i = 0;
  constructor(private readonly t: string) {}

  parse(): unknown {
    const v = this.value();
    this.ws();
    return v;
  }
  get pos(): number {
    return this.i;
  }
  private fail(): never {
    throw new Error('literal');
  }
  private ws(): void {
    const t = this.t;
    for (;;) {
      const c = t[this.i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\uFEFF') this.i++;
      else if (c === '/' && t[this.i + 1] === '/') {
        while (this.i < t.length && t[this.i] !== '\n') this.i++;
      } else if (c === '/' && t[this.i + 1] === '*') {
        const e = t.indexOf('*/', this.i + 2);
        if (e < 0) this.fail();
        this.i = e + 2;
      } else return;
    }
  }
  private value(): unknown {
    this.ws();
    const c = this.t[this.i];
    if (c === '[') return this.array();
    if (c === '{') return this.object();
    if (c === '"' || c === "'" || c === '`') return this.string();
    return this.atom();
  }
  private array(): unknown[] {
    const out: unknown[] = [];
    this.i++;
    for (;;) {
      this.ws();
      if (this.t[this.i] === ']') {
        this.i++;
        return out;
      }
      out.push(this.value());
      this.ws();
      if (this.t[this.i] === ',') this.i++;
      else if (this.t[this.i] !== ']') this.fail();
    }
  }
  private object(): Record<string, unknown> {
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    this.i++;
    for (;;) {
      this.ws();
      if (this.t[this.i] === '}') {
        this.i++;
        return out;
      }
      const c = this.t[this.i];
      let key: string;
      if (c === '"' || c === "'") key = this.string();
      else {
        const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(this.t.slice(this.i, this.i + 80));
        if (!m) this.fail();
        key = m[0];
        this.i += key.length;
      }
      this.ws();
      if (this.t[this.i] !== ':') this.fail();
      this.i++;
      out[key] = this.value();
      this.ws();
      if (this.t[this.i] === ',') this.i++;
      else if (this.t[this.i] !== '}') this.fail();
    }
  }
  private string(): string {
    const t = this.t;
    const q = t[this.i++];
    let out = '';
    for (;;) {
      if (this.i >= t.length) this.fail();
      const c = t[this.i++];
      if (c === q) return out;
      if (q === '`' && c === '$' && t[this.i] === '{') this.fail();
      if (c === '\\') {
        const n = t[this.i++];
        switch (n) {
          case 'n': out += '\n'; break;
          case 't': out += '\t'; break;
          case 'r': out += '\r'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'v': out += '\v'; break;
          case '0': out += '\0'; break;
          case '\n': break;
          case 'u': {
            if (t[this.i] === '{') {
              const e = t.indexOf('}', this.i);
              const cp = parseInt(t.slice(this.i + 1, e), 16);
              if (e < 0 || !Number.isFinite(cp) || cp > 0x10ffff) this.fail();
              out += String.fromCodePoint(cp);
              this.i = e + 1;
            } else {
              const h = t.slice(this.i, this.i + 4);
              if (!/^[0-9a-fA-F]{4}$/.test(h)) this.fail();
              out += String.fromCharCode(parseInt(h, 16));
              this.i += 4;
            }
            break;
          }
          case 'x': {
            const h = t.slice(this.i, this.i + 2);
            if (!/^[0-9a-fA-F]{2}$/.test(h)) this.fail();
            out += String.fromCharCode(parseInt(h, 16));
            this.i += 2;
            break;
          }
          default:
            out += n;
        }
      } else out += c;
    }
  }
  private atom(): unknown {
    const m = /^(?:true|false|null|undefined|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(
      this.t.slice(this.i, this.i + 40),
    );
    if (!m) this.fail();
    this.i += m[0].length;
    const w = m[0];
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null' || w === 'undefined') return null;
    return Number(w);
  }
}

/** Estrae l'array di `const|let|var NAME = [...]` senza mai eseguire codice. */
export function extractArrayFromHtml(html: string, name: string): unknown[] | null {
  const m = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*\\[`).exec(html);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  try {
    const p = new LiteralParser(html.slice(start));
    const v = p.parse();
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function extractBankFromHtml(html: string): unknown[] | null {
  return extractArrayFromHtml(html, 'BANK');
}

export function categoryLabel(raw: string): string {
  const n = normText(raw);
  if (!n) return '';
  if (n.includes('extra')) return 'Extra paniere';
  if (n.includes('inedit')) return 'Inedite';
  if (n.includes('svolt') || n.includes('esam') || n.includes('exam')) return 'Esami già svolti';
  if (n.includes('sincron')) return 'Sincrone';
  if (n === 'paniere' || n === 'bank') return 'Paniere';
  return raw.trim();
}

export function isExamCategory(label: string): boolean {
  return /esame|exam|inedit|svolti/i.test(label);
}

function toCategories(v: unknown): string[] {
  const out: string[] = [];
  const add = (x: unknown) => {
    const s = str(x);
    if (!s) return;
    const l = categoryLabel(s);
    if (l && !out.includes(l)) out.push(l);
  };
  if (Array.isArray(v)) v.forEach(add);
  else add(v);
  return out;
}

function toLessonIds(v: unknown): number[] {
  const out: number[] = [];
  const add = (x: unknown) => {
    const n = typeof x === 'number' ? x : parseInt(str(x), 10);
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  };
  if (Array.isArray(v)) v.forEach(add);
  else if (v !== undefined && v !== null) add(v);
  return out;
}

function parseLessons(arr: unknown): Lesson[] {
  if (!Array.isArray(arr)) return [];
  const out: Lesson[] = [];
  for (const it of arr) {
    if (!isObj(it)) continue;
    const n = firstDefined(it, ['n', 'number', 'num', 'id']);
    const num = typeof n === 'number' ? n : parseInt(str(n), 10);
    if (!Number.isFinite(num)) continue;
    out.push({ number: num, title: str(firstDefined(it, ['t', 'title', 'titolo', 'name'])) });
  }
  return out;
}

export function parseSubjectText(
  text: string,
  fileName: string,
  defaultOrigin: DefaultOrigin = 'auto',
): ParsedSubject {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  let bank: unknown[] | null = null;
  let root: Raw | null = null;
  let format: 'json' | 'html' = 'json';
  let htmlTitle = '';
  let htmlLessons: unknown[] | null = null;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Il file non è un JSON valido.');
    }
    if (Array.isArray(parsed)) bank = parsed;
    else if (isObj(parsed)) {
      root = parsed;
      const list = firstDefined(parsed, BANK_KEYS);
      if (Array.isArray(list)) bank = list;
    }
    if (!bank) throw new Error('Nel JSON non è stata trovata una lista di domande (domande, questions o bank).');
  } else {
    format = 'html';
    bank = extractBankFromHtml(trimmed) ?? extractArrayFromHtml(trimmed, 'QUESTIONS');
    if (!bank) {
      throw new Error('Nel file HTML non è stato trovato un archivio BANK = [...] o QUESTIONS = [...] leggibile.');
    }
    htmlLessons = extractArrayFromHtml(trimmed, 'LESSONS');
    const t = /<title>([^<]*)<\/title>/i.exec(trimmed);
    if (t) {
      htmlTitle = t[1]
        .replace(/^\s*quiz\s+/i, '')
        .replace(/^\s*attivo\s*[·|—:-]\s*/i, '')
        .trim();
    }
  }

  const fileBase = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]\d{4}-\d{2}-\d{2}.*$/, '').replace(/^quiz[_\s-]*/i, '').replace(/_/g, ' ').trim();
  const title = (root && str(firstDefined(root, TITLE_KEYS))) || htmlTitle || fileBase || 'Materia importata';

  const lessonMap = new Map<number, string>();
  const rawLessons = root ? firstDefined(root, ['lezioni', 'lessons']) : htmlLessons;
  for (const l of parseLessons(rawLessons)) lessonMap.set(l.number, l.title);

  const discarded: Discarded[] = [];
  const warnings: string[] = [];
  const questions: Question[] = [];
  const idSeen = new Map<string, number>();
  let undeclared = 0;

  bank.forEach((entry, index) => {
    const ref = isObj(entry) && str(entry.id) ? `ID ${str(entry.id)}` : `n. ${index + 1}`;
    if (!isObj(entry)) {
      discarded.push({ ref, reason: 'voce non valida' });
      return;
    }
    const q = str(firstDefined(entry, ['domanda', 'question', 'q']));
    if (!q) {
      discarded.push({ ref, reason: 'testo della domanda vuoto' });
      return;
    }
    const sourceId = str(entry.id);

    let opts: string[] = [];
    let ci = -1;
    const rawOpts = firstDefined(entry, ['opts', 'options']);
    const declaredCorrect = firstDefined(entry, ['risposta_corretta', 'correctAnswer', 'correct', 'a']);
    const declaredCorrectText = typeof declaredCorrect === 'string' ? declaredCorrect.trim() : '';
    if (Array.isArray(rawOpts)) {
      opts = rawOpts.map(str);
      const idx = firstDefined(entry, ['ci', 'correctIndex']);
      ci = typeof idx === 'number' ? idx : idx !== undefined ? parseInt(str(idx), 10) : -1;
      if (ci < 0 && declaredCorrectText) ci = opts.findIndex((o) => o === declaredCorrectText);
    } else {
      const wrong = firstDefined(entry, ['risposte_errate', 'wrongAnswers', 'incorrectAnswers', 'w']);
      if (!declaredCorrectText || !Array.isArray(wrong)) {
        discarded.push({ ref, reason: 'risposta corretta o risposte errate mancanti' });
        return;
      }
      const wr = wrong.map(str);
      if (wr.some((w) => !w)) {
        discarded.push({ ref, reason: 'opzione vuota' });
        return;
      }
      const total = wr.length + 1;
      if (total < 2 || total > 6) {
        discarded.push({ ref, reason: 'numero di opzioni non valido' });
        return;
      }
      ci = hash(`${sourceId || index}|${q}`) % total;
      opts = [...wr];
      opts.splice(ci, 0, declaredCorrectText);
    }
    if (opts.length < 2 || opts.length > 6) {
      discarded.push({ ref, reason: 'servono da 2 a 6 opzioni' });
      return;
    }
    if (opts.some((o) => !o)) {
      discarded.push({ ref, reason: 'opzione vuota' });
      return;
    }
    if (new Set(opts).size !== opts.length) {
      discarded.push({ ref, reason: 'opzioni duplicate' });
      return;
    }
    if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) {
      discarded.push({ ref, reason: 'indice della risposta corretta non valido' });
      return;
    }
    if (declaredCorrectText && opts[ci] !== declaredCorrectText) {
      discarded.push({ ref, reason: 'la risposta dichiarata non coincide con l’opzione indicata' });
      return;
    }

    let lessonIds = toLessonIds(firstDefined(entry, ['lessonIds', 'lezioni', 'lz', 'lessons', 'Ls']));
    lessonIds = lessonIds.filter((n) => n > 0);
    const lz = lessonIds[0] ?? 0;
    const entryTit = str(entry.tit);
    if (entryTit && lz && !lessonMap.has(lz)) lessonMap.set(lz, entryTit);
    const tit = (lz && lessonMap.get(lz)) || entryTit || '';

    const catRaw = firstDefined(entry, [
      'sourceCategories', 'categories', 'categorie', 'fonte', 'source', 'category', 'categoria',
      'origin', 'origine', 'provenienza', 'tipo', 'type', 'src',
    ]);
    let cats = toCategories(catRaw);
    let origin: QuestionOrigin;
    if (cats.length) {
      origin = cats.some(isExamCategory) ? 'exam' : 'bank';
    } else {
      if (defaultOrigin === 'exam') {
        cats = ['Esami già svolti'];
        origin = 'exam';
      } else {
        cats = ['Paniere'];
        origin = 'bank';
        if (defaultOrigin === 'auto') undeclared++;
      }
    }

    let id = sourceId || `q${index + 1}`;
    const dup = idSeen.get(id);
    if (dup !== undefined) {
      idSeen.set(id, dup + 1);
      id = `${id}~${dup + 1}`;
      warnings.push(`ID duplicato ${sourceId}: rinominato in ${id}.`);
    } else idSeen.set(id, 1);

    questions.push({
      id,
      lz,
      tit,
      q,
      opts,
      ci,
      exp: str(firstDefined(entry, ['spiegazione', 'explanation', 'exp', 'e'])),
      origin,
      sourceCategories: cats,
      lessonIds: lessonIds.length ? lessonIds : lz ? [lz] : [],
      sourceId: sourceId || undefined,
    });
  });

  if (undeclared > 0) {
    warnings.push(`${undeclared} domande senza provenienza dichiarata sono state classificate come Paniere.`);
  }
  if (!questions.length) throw new Error('Nessuna domanda valida trovata nel file.');

  // lezioni: da elenco dichiarato, altrimenti dedotte dalle domande
  const used = new Set<number>();
  questions.forEach((x) => (x.lessonIds ?? []).forEach((n) => used.add(n)));
  const lessons: Lesson[] = [];
  const nums = new Set<number>([...lessonMap.keys(), ...used]);
  [...nums].sort((a, b) => a - b).forEach((n) => lessons.push({ number: n, title: lessonMap.get(n) ?? '' }));

  const subjectKey = root ? str(root.id_materia) : '';
  return {
    title,
    sourceUrl: root ? str(root.link) || undefined : undefined,
    lessons,
    questions,
    discarded,
    warnings,
    format,
    subjectKey: subjectKey || undefined,
  };
}
