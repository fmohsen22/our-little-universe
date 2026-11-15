// The nightly referee: decides whether each Esm Famil answer is a real example of its category.
// It asks an OpenAI-compatible chat model (OpenAI, the company behind Codex, by default). Settings, from the environment:
//   OPENAI_API_KEY    the key; without it the referee uses only the built-in rules
//   REFEREE_MODEL     the model to ask, for example one listed in your OpenAI account (required with a key)
//   REFEREE_BASE_URL  default https://api.openai.com/v1 (any OpenAI-compatible service works)
'use strict';
const BASE = (process.env.REFEREE_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const KEY = process.env.OPENAI_API_KEY || '', MODEL = process.env.REFEREE_MODEL || '';
const mode = () => (KEY && MODEL ? 'ai' : 'rules');

const SYSTEM = [
  'You are the referee of Esm Famil (اسم فامیل), the Persian word game. For each item, decide whether the answer is a genuine,',
  'recognisable example of the category, as a fair and knowledgeable human referee at the table would.',
  'Rules: the answer has already been checked to start with the round letter; do not judge spelling harshly; accept common',
  'transliterations, other languages and Persian script; accept real people\'s first names for Name and real family names for',
  'Surname; accept real cities, countries, animals, foods, everyday objects and colours. Reject made-up words, keyboard mashing,',
  'a single letter, an answer that belongs to a different category, and anything that is not a real example.',
  'Reply with JSON only: {"verdicts":[{"i":<item number>,"valid":true|false,"why":"<at most 8 words, only when false>"}]}'
].join(' ');

async function ask(batch) {
  const items = batch.map((x, i) => ({ i, category: x.cat, letter: x.letter, answer: x.answer }));
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify({ items }) }] }),
    signal: AbortSignal.timeout(120000)
  });
  if (!r.ok) throw new Error('referee service answered ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const j = await r.json(), text = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  const out = JSON.parse(text || '{}').verdicts;
  if (!Array.isArray(out)) throw new Error('referee reply had no verdicts');
  const got = new Map(); out.forEach(v => { if (v && Number.isInteger(v.i) && v.i >= 0 && v.i < batch.length) got.set(v.i, v); });
  if (got.size !== batch.length) throw new Error('referee answered ' + got.size + ' of ' + batch.length + ' items');   // all or nothing, so no answer is judged by accident
  return batch.map((x, i) => ({ valid: got.get(i).valid !== false, why: String(got.get(i).why || '').slice(0, 80) }));
}

// items: [{ key, cat, letter, answer }]. Resolves Map key -> { valid, why }. Rejects if the service fails, so the rounds wait for the next night.
async function judge(items) {
  const verdicts = new Map();
  if (mode() !== 'ai') { items.forEach(x => verdicts.set(x.key, { valid: true, why: '' })); return verdicts; }
  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40), res = await ask(batch);
    batch.forEach((x, k) => verdicts.set(x.key, res[k]));
  }
  return verdicts;
}
module.exports = { judge, mode };
