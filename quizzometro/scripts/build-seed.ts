import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseSubjectText } from '../src/domain/import/parse';
import type { Subject } from '../src/domain/types';

const dir = join(__dirname, '..', '..', 'attached_assets');
const files = readdirSync(dir);
const find = (re: RegExp) => {
  const f = files.find((x) => re.test(x));
  if (!f) throw new Error('File non trovato: ' + re);
  return f;
};

const sources = [
  { id: 'arti_visuali', title: 'Arti visuali e nuove tecnologie rappresentative', file: find(/^Quiz_Arti.*\.html$/) },
  { id: 'digital_and_social_media_management', title: 'Digital and Social Media Management', file: find(/^quiz_Digital.*\.json$/) },
  { id: 'diritto_pubblico', title: 'Diritto Pubblico', file: find(/^quiz_Diritto.*\.json$/) },
  { id: 'lingua_spagnola', title: 'Lingua Spagnola', file: find(/^quiz_Lingua.*\.json$/) },
];

const now = 1763391600000;
const subjects: Subject[] = [];
for (const s of sources) {
  const p = parseSubjectText(readFileSync(join(dir, s.file), 'utf8'), s.file, 'auto');
  if (p.discarded.length) throw new Error(`${s.id}: scartate ${p.discarded.length} domande: ${JSON.stringify(p.discarded.slice(0, 3))}`);
  const multi = p.questions.filter((q) => (q.lessonIds?.length ?? 0) > 1).length;
  const cats: Record<string, number> = {};
  p.questions.forEach((q) => q.sourceCategories?.forEach((c) => (cats[c] = (cats[c] ?? 0) + 1)));
  console.log(s.id, 'domande', p.questions.length, 'lezioni', p.lessons.length, 'multi-lezione', multi, cats, 'warn', p.warnings);
  subjects.push({ id: s.id, title: s.title, questions: p.questions, lessons: p.lessons, createdAt: now, updatedAt: now });
}
writeFileSync(join(__dirname, '..', 'src', 'data', 'seed.json'), JSON.stringify(subjects));
console.log('seed.json scritto');
