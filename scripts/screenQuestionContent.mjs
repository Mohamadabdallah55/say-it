import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [inventoryDir, outputDir] = process.argv.slice(2);
if (!inventoryDir || !outputDir) {
  throw new Error('Usage: node scripts/screenQuestionContent.mjs <inventory-dir> <audit-dir>');
}

const readJsonl = (file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const normalize = (value = '') => value.normalize('NFKC').replace(/\p{M}|ـ/gu, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 15))
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function group(items, key) {
  const result = new Map();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    if (!result.has(value)) result.set(value, []);
    result.get(value).push(item);
  }
  return result;
}

const inventory = JSON.parse(readFileSync(join(inventoryDir, 'inventory.json'), 'utf8'));
const rows = readJsonl(join(inventoryDir, 'questions.jsonl')).filter((row) => row.status === 'approved');
const byCategory = group(rows, (row) => row.categoryId);
const categories = new Map(inventory.categories.map(({ id, name, counts }) => [id, {
  name, tiers: counts, screened: byCategory.get(id)?.length ?? 0, candidates: {}, mediaRows: 0,
}]));
if (rows.length !== inventory.totalApprovedRows || byCategory.size !== categories.size
  || inventory.categories.some(({ id, total }) => categories.get(id).screened !== total)) {
  throw new Error('Questions file and inventory have different catalog counts');
}
const candidates = [];
const repairQueue = [];

function addCandidate(reason, affected) {
  candidates.push({ reason, status: 'candidate', questions: affected.map(({ id, categoryId, points }) => ({ id, categoryId, points })) });
  for (const categoryId of new Set(affected.map((row) => row.categoryId))) {
    const counts = categories.get(categoryId).candidates;
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
}

function playableMedia(row) {
  return row.media.audio.length > 0 || row.media.video.length > 0
    || (row.media.images.length > 0 && row.imageDisplay !== 'after_reveal');
}

for (const row of rows) {
  const { id, categoryId, points, questionType, orderItems, correctOrder, startingLetter, options } = row;
  const prompt = normalize(row.prompt);
  const answer = normalize(row.answer);
  const refs = Object.entries(row.media).flatMap(([kind, entries]) => entries.map((entry) => ({ kind, ...entry })));
  categories.get(categoryId).mediaRows += Number(refs.length > 0);

  if (!prompt || !answer) addCandidate('empty_text', [row]);
  if ({ 200: 'easy', 400: 'medium', 600: 'hard' }[points] !== row.difficulty) addCandidate('point_difficulty_mismatch', [row]);
  if (row.sourceSnippet && !row.sourceRef) addCandidate('evidence_without_reference', [row]);
  if (startingLetter) {
    const letter = normalize(startingLetter);
    const forms = [answer, ...((row.acceptableAnswers ?? []).map(normalize))];
    if (letter.length !== 1 || !forms.some((form) => form[0] === letter || (form.startsWith('ال') && form[2] === letter))) {
      addCandidate('letter_answer_mismatch', [row]);
    }
  }
  if (questionType === 'order_steps') {
    const items = (orderItems ?? []).map(normalize);
    const order = (correctOrder ?? []).map(normalize);
    const itemSet = new Set(items);
    if (items.length < 2 || itemSet.size !== items.length || items.some((item) => !item)
      || order.length !== items.length || new Set(order).size !== items.length || order.some((item) => !itemSet.has(item))) {
      addCandidate('order_items_mismatch', [row]);
    } else if (items.every((item, index) => item === order[index])) {
      addCandidate('stored_order_already_sorted', [row]);
    }
  }
  if (questionType !== 'order_steps' && answer.replace(/ /g, '').length >= 5
    && /\p{L}/u.test(answer) && (` ${prompt} `).includes(` ${answer} `)) {
    addCandidate('answer_in_prompt', [row]);
  }
  if (points === 600 && (questionType === 'true_false_explain' || (options && options.length > 1 && options.length <= 3))) {
    addCandidate('hard_label_with_few_options', [row]);
  }
  if (points === 600 && !playableMedia(row) && /^(هل|ايهما|صح ام خطا|صحيح ام خطا)(?: |$)/u.test(prompt)) {
    addCandidate('possible_binary_hard_prompt', [row]);
  }

  const missing = refs.filter((ref) => ref.presence === 'local_file_unreadable');
  if (missing.length) {
    repairQueue.push({ categoryId, questionId: id, reason: 'local_file_unreadable', status: 'pending', refs: missing.map(({ kind, ref }) => ({ kind, ref })) });
  }
}

for (const sameText of group(rows, (row) => JSON.stringify([normalize(row.prompt), normalize(row.answer)])).values()) {
  if (sameText.length < 2) continue;
  const textOnly = sameText.filter((row) => !playableMedia(row));
  if (textOnly.length > 1) addCandidate('same_prompt_and_answer', textOnly);
  if (textOnly.length !== sameText.length) {
    repairQueue.push({ reason: 'same_text_compare_media', status: 'pending', questions: sameText.map(({ categoryId, id }) => ({ categoryId, questionId: id })) });
  }
}

const quranGroups = group(rows.filter((row) => !playableMedia(row)), (row) => {
  const references = [...new Set(row.sourceRef?.match(/https:\/\/quran\.com\/\d+\/\d+(?:-\d+)?(?=[\s·]|$)/g) ?? [])];
  if (references.length === 1) return JSON.stringify([references[0], normalize(row.answer)]);
});
for (const matchingFact of quranGroups.values()) {
  if (matchingFact.length > 1 && new Set(matchingFact.map((row) => normalize(row.prompt))).size > 1) {
    addCandidate('same_quran_reference_and_answer', matchingFact);
  }
}

const questionIdCounts = group(rows, (row) => row.id);
for (const sameId of questionIdCounts.values()) {
  if (sameId.length > 1) addCandidate('duplicate_playable_id', sameId);
}

const report = {
  bankDigest: createHash('sha256').update(rows.map((row) => row.contentHash).join('\n')).digest('hex'),
  scope: 'Automated screening of the effective official catalog. Flags require review. Counts are not factual, difficulty, or media approvals.',
  questions: rows.length,
  categoryCount: categories.size,
  contentCandidateGroups: candidates.length,
  automatedMediaCases: repairQueue.length,
  categories: Object.fromEntries(categories),
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'content-screen.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(outputDir, 'content-candidates.jsonl'), candidates.map((row) => JSON.stringify(row) + '\n').join(''));
writeFileSync(join(outputDir, 'media-candidates.jsonl'), repairQueue.map((row) => JSON.stringify(row) + '\n').join(''));
console.log(JSON.stringify({ questions: report.questions, categories: report.categoryCount, content: candidates.length, media: repairQueue.length }));
