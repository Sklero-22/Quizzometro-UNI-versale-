export type PasteSource = 'paniere' | 'inedita';

export interface PastedQuestion {
  line: number;
  lessonIds: number[];
  source: PasteSource;
  question: string;
  correctAnswer: string;
  wrongAnswers: [string, string, string];
  explanation: string;
}

export interface PasteParseError {
  line: number;
  message: string;
}

export interface PasteParseResult {
  questions: PastedQuestion[];
  errors: PasteParseError[];
}

type FieldName = 'lessons' | 'source' | 'question' | 'correct' | 'wrong' | 'explanation';

interface FieldLine {
  line: number;
  value: string;
}

interface SourceLine {
  line: number;
  text: string;
}

const LABELS: Record<string, FieldName> = {
  LEZIONE: 'lessons',
  LEZIONI: 'lessons',
  FONTE: 'source',
  DOMANDA: 'question',
  CORRETTA: 'correct',
  ERRATA: 'wrong',
  ERRATE: 'wrong',
  SPIEGAZIONE: 'explanation',
};

function cleanLine(raw: string): string {
  let line = raw
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .trim();

  if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'"))) {
    line = line.slice(1, -1).trim();
  }

  for (;;) {
    const next = line.replace(/^(?:\d+[.)]\s*|[•–—-]\s*)/u, '').trimStart();
    if (next === line) return line.trim();
    line = next;
  }
}

function parseLessonIds(value: string): number[] | null {
  const normalized = value.trim().replace(/\s*,\s*/g, ' ');
  if (!/^\d+(?:\s+\d+)*$/.test(normalized)) return null;
  const ids = normalized.split(/\s+/).map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null;
  return [...new Set(ids)];
}

function parseSource(value: string): PasteSource | null {
  const source = value.trim().toLocaleLowerCase('it');
  if (source === 'paniere') return 'paniere';
  if (source === 'inedita' || source === 'inedite' || source === 'inedito') return 'inedita';
  return null;
}

function splitBlocks(lines: SourceLine[]): SourceLine[][] {
  const blocks: SourceLine[][] = [];
  let block: SourceLine[] = [];
  for (const line of lines) {
    if (!line.text) {
      if (block.length) blocks.push(block);
      block = [];
    } else block.push(line);
  }
  if (block.length) blocks.push(block);
  return blocks;
}

function parseBlock(
  block: SourceLine[],
  previousLessons: number[] | undefined,
  previousSource: PasteSource | undefined,
): { question?: PastedQuestion; errors: PasteParseError[] } {
  const errors: PasteParseError[] = [];
  const fields = new Map<FieldName, FieldLine[]>();
  let current: { name: FieldName; field: FieldLine } | null = null;

  const addError = (line: number, message: string) => errors.push({ line, message: `Riga ${line}: ${message}` });

  for (const line of block) {
    const label = /^\s*([A-Z]+)\s*:\s*(.*)$/i.exec(line.text);
    if (label) {
      const name = LABELS[label[1].toUpperCase()];
      if (!name) {
        current = null;
        addError(line.line, `etichetta "${label[1]}" non riconosciuta.`);
        continue;
      }
      const field = { line: line.line, value: label[2].trim() };
      const values = fields.get(name) ?? [];
      values.push(field);
      fields.set(name, values);
      current = { name, field };
      continue;
    }

    if (current && (current.name === 'question' || current.name === 'explanation')) {
      current.field.value = [current.field.value, line.text].filter(Boolean).join(' ').trim();
    } else {
      addError(line.line, 'testo senza etichetta non atteso.');
      current = null;
    }
  }

  const one = (name: FieldName, label: string): FieldLine | undefined => {
    const values = fields.get(name) ?? [];
    if (values.length > 1 && name !== 'wrong') {
      addError(values[1].line, `la riga ${label} è ripetuta; inseriscila una sola volta.`);
    }
    return values[0];
  };

  const lessonsField = one('lessons', 'LEZIONI');
  const sourceField = one('source', 'FONTE');
  const questionField = one('question', 'DOMANDA');
  const correctFields = fields.get('correct') ?? [];
  const explanationField = one('explanation', 'SPIEGAZIONE');
  const wrongFields = fields.get('wrong') ?? [];
  const startLine = block[0]?.line ?? 1;

  let lessonIds: number[] | undefined;
  if (lessonsField) {
    lessonIds = parseLessonIds(lessonsField.value) ?? undefined;
    if (!lessonIds) {
      addError(
        lessonsField.line,
        'LEZIONI deve contenere uno o più numeri interi ≥ 1 separati da virgole o spazi.',
      );
    }
  } else if (previousLessons?.length) lessonIds = previousLessons;
  else addError(startLine, 'manca la riga LEZIONI.');

  let source: PasteSource | undefined;
  if (sourceField) {
    source = parseSource(sourceField.value) ?? undefined;
    if (!source) addError(sourceField.line, 'FONTE deve essere paniere o inedita.');
  } else if (previousSource) source = previousSource;
  else addError(startLine, 'manca la riga FONTE.');

  if (!questionField?.value.trim()) {
    addError(questionField?.line ?? startLine, 'manca la riga DOMANDA o il suo testo è vuoto.');
  }

  if (correctFields.length === 0) addError(startLine, 'manca la riga CORRETTA.');
  else if (correctFields.length > 1) addError(correctFields[1].line, 'servirebbe una sola riga CORRETTA, ne ho trovate due o più.');
  else if (!correctFields[0].value.trim()) addError(correctFields[0].line, 'il testo della risposta CORRETTA è vuoto.');

  if (wrongFields.length !== 3) {
    addError(startLine, `servono 3 righe ERRATA, ne ho trovate ${wrongFields.length}.`);
  }
  wrongFields.forEach((field) => {
    if (!field.value.trim()) addError(field.line, 'il testo della risposta ERRATA è vuoto.');
  });

  if (
    errors.length ||
    !lessonIds?.length ||
    !source ||
    !questionField?.value.trim() ||
    correctFields.length !== 1 ||
    !correctFields[0].value.trim() ||
    wrongFields.length !== 3
  ) {
    return { errors };
  }

  return {
    question: {
      line: startLine,
      lessonIds,
      source,
      question: questionField.value.trim(),
      correctAnswer: correctFields[0].value.trim(),
      wrongAnswers: wrongFields.map((field) => field.value.trim()) as [string, string, string],
      explanation: explanationField?.value.trim() ?? '',
    },
    errors,
  };
}

/** Legge domande incollate senza eseguire codice e segnala gli errori con la riga originale. */
export function parsePastedQuestions(text: string): PasteParseResult {
  const sourceLines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: cleanLine(line) }));

  const questions: PastedQuestion[] = [];
  const errors: PasteParseError[] = [];
  let previousLessons: number[] | undefined;
  let previousSource: PasteSource | undefined;

  for (const block of splitBlocks(sourceLines)) {
    const result = parseBlock(block, previousLessons, previousSource);
    errors.push(...result.errors);
    if (!result.question || result.errors.length) continue;
    questions.push(result.question);
    previousLessons = result.question.lessonIds;
    previousSource = result.question.source;
  }

  errors.sort((a, b) => a.line - b.line || a.message.localeCompare(b.message, 'it'));
  return { questions, errors };
}
