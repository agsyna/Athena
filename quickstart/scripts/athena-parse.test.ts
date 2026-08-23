import assert from 'node:assert/strict';
import { parseTurn, applyControl, createTopics } from '../lib/athena/parse';

let passed = 0;
function t(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

console.log('parseTurn');
t('extracts a trailing control object and strips it from speech', () => {
  const r = parseTurn('What problem does it solve? {"focus":"Normalization"}');
  assert.equal(r.spoken, 'What problem does it solve?');
  assert.deepEqual(r.control, { focus: 'Normalization' });
});

t('handles the nested mark object', () => {
  const r = parseTurn('Good. {"focus":"Indexing","mark":{"topic":"Normalization","result":"correct"}}');
  assert.equal(r.spoken, 'Good.');
  assert.equal(r.control?.mark?.result, 'correct');
  assert.equal(r.control?.mark?.topic, 'Normalization');
});

t('handles the first turn with a topics array', () => {
  const r = parseTurn('Let us start. {"topics":["A","B","C","D"],"focus":"A"}');
  assert.deepEqual(r.control?.topics, ['A', 'B', 'C', 'D']);
});

t('leaves an ordinary turn untouched', () => {
  const r = parseTurn('Can you say more about that?');
  assert.equal(r.control, null);
  assert.equal(r.spoken, 'Can you say more about that?');
});

t('ignores a brace that is not our payload', () => {
  const r = parseTurn('The set notation {1, 2, 3} is fine.');
  assert.equal(r.control, null);
  assert.equal(r.spoken, 'The set notation {1, 2, 3} is fine.');
});

t('survives a truncated mid-stream object', () => {
  const r = parseTurn('Right. {"focus":"Index');
  assert.equal(r.control, null);
});

t('does not terminate on a brace inside a string value', () => {
  const r = parseTurn('Ok. {"focus":"A } B"}');
  assert.equal(r.control?.focus, 'A } B');
  assert.equal(r.spoken, 'Ok.');
});

t('takes the last object when the model emits two', () => {
  const r = parseTurn('Hm {"focus":"A"} and {"mark":{"topic":"A","result":"wrong"}}');
  assert.equal(r.control?.mark?.result, 'wrong');
});

t('survives an unbalanced quote in the spoken prose', () => {
  // Observed in the wild: the model copied a quoted example and left its
  // opening quote in the turn, which desynced the old string-state scanner and
  // hid the payload completely.
  const r = parseTurn('"Right, let us start. {"topics":["A","B"],"focus":"A"}');
  assert.deepEqual(r.control?.topics, ['A', 'B']);
  assert.equal(r.control?.focus, 'A');
});

t('survives an apostrophe and a stray quote before the payload', () => {
  const r = parseTurn(`That's the "anomaly" argument. {"mark":{"topic":"Joins","result":"correct"}}`);
  assert.equal(r.control?.mark?.topic, 'Joins');
});

t('finds the payload after prose containing braces', () => {
  const r = parseTurn('Consider the set {1, 2, 3}. {"focus":"Sets"}');
  assert.equal(r.control?.focus, 'Sets');
});

t('returns null when the only braces are prose', () => {
  const r = parseTurn('Consider the set {1, 2, 3} carefully.');
  assert.equal(r.control, null);
});

console.log('applyControl');
const base = createTopics(['Normalization', 'Indexing', 'Transactions', 'Joins']);

t('createTopics dedupes case-insensitively and caps at six', () => {
  const many = createTopics(['A', 'a', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.equal(many.length, 6);
  assert.equal(many[1].name, 'B');
});

t('focus marks exactly one chip active', () => {
  const { topics } = applyControl(base, { focus: 'Indexing' });
  assert.equal(topics.filter((x) => x.status === 'active').length, 1);
  assert.equal(topics[1].status, 'active');
});

t('mark records a wrong answer and emits a transition', () => {
  const { topics, transitions } = applyControl(base, {
    mark: { topic: 'Indexing', result: 'wrong' },
  });
  assert.equal(topics[1].status, 'wrong');
  assert.equal(topics[1].attempts, 1);
  assert.equal(transitions[0].redemption, false);
});

t('the recovery beat: wrong then correct flags redemption', () => {
  const first = applyControl(base, { mark: { topic: 'Indexing', result: 'wrong' } }).topics;
  const { topics, transitions } = applyControl(first, {
    mark: { topic: 'Indexing', result: 'correct' },
  });
  assert.equal(topics[1].status, 'correct');
  assert.equal(topics[1].attempts, 2);
  assert.equal(topics[1].redeemed, true);
  assert.equal(transitions[0].redemption, true);
});

t('partial then correct also counts as redemption', () => {
  const first = applyControl(base, { mark: { topic: 'Joins', result: 'partial' } }).topics;
  const { transitions } = applyControl(first, { mark: { topic: 'Joins', result: 'correct' } });
  assert.equal(transitions[0].redemption, true);
});

t('a mark wins over focus for the same topic in one payload', () => {
  const { topics } = applyControl(base, {
    focus: 'Normalization',
    mark: { topic: 'Normalization', result: 'correct' },
  });
  assert.equal(topics[0].status, 'correct');
});

t('matches topic names loosely on case', () => {
  const { topics } = applyControl(base, { mark: { topic: 'indexing', result: 'correct' } });
  assert.equal(topics[1].status, 'correct');
});

t('ignores a hallucinated topic name', () => {
  const { topics, transitions } = applyControl(base, {
    mark: { topic: 'Quantum Chromodynamics', result: 'correct' },
  });
  assert.deepEqual(topics, base);
  assert.equal(transitions.length, 0);
});

t('ignores an invalid result value', () => {
  const { topics } = applyControl(base, {
    mark: { topic: 'Joins', result: 'brilliant' as 'correct' },
  });
  assert.equal(topics[3].status, 'unattempted');
});

console.log(`\n${passed} assertions passed`);
