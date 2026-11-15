// The nightly referee: Claude decides whether each Esm Famil answer is a real example of its category.
// Settings, from the environment (put them in /etc/our-little-universe.env on the server):
//   ANTHROPIC_API_KEY  the key; without it the referee uses only the built-in instant checks
//   REFEREE_MODEL      optional, default claude-opus-5-5
// Needs the Anthropic SDK (npm install in server/) and Node 20 or newer. If either is missing, the game still runs
// and the rounds simply wait until the referee can work.
'use strict';
let Anthropic = null, loadError = '';
try { const m = require('@anthropic-ai/sdk'); Anthropic = m.default || m; } catch (e) { loadError = e.message; }

const MODEL = process.env.REFEREE_MODEL || 'claude-opus-5-5';
const KEY = process.env.ANTHROPIC_API_KEY || '';
const NODE_OK = +process.versions.node.split('.')[0] >= 20;
// 'ai' judges with Claude; 'waiting' means a key is set but the SDK or Node is not ready, so nothing is judged;
// 'rules' means no key: only the instant checks apply.
const mode = () => (!KEY ? 'rules' : Anthropic && NODE_OK ? 'ai' : 'waiting');
const why = () => (!NODE_OK ? 'the referee needs Node 20 or newer (this is ' + process.versions.node + ')' : 'the Anthropic SDK is not installed: run npm install in server/ (' + loadError + ')');

const SYSTEM = [
  'You are the referee of Esm Famil, the Persian word game, played here in English.',
  'For each item, decide whether the answer is a genuine, recognisable example of its category, as a fair and knowledgeable referee at the table would.',
  'The answer has already been checked to start with the round letter. Do not judge spelling harshly, and accept common transliterations and names from any culture.',
  'Accept real first names for Name, real family names for Surname, and real cities, countries, animals, foods, everyday objects and colours for the other categories.',
  'Reject made-up words, keyboard mashing, an answer that belongs to a different category, and anything that is not a real example.',
  'Give "why" only for a rejected answer, in at most eight words; otherwise an empty string.'
].join(' ');
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['verdicts'],
  properties: { verdicts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'valid', 'why'], properties: { i: { type: 'integer' }, valid: { type: 'boolean' }, why: { type: 'string' } } } } }
};

let client = null;
async function ask(batch) {
  client = client || new Anthropic({ apiKey: KEY });
  const items = batch.map((x, i) => ({ i, category: x.cat, letter: x.letter, answer: x.answer }));
  const r = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',     // if the model declines, the API retries on a fallback model
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify({ items }) }]
  });
  if (r.stop_reason === 'refusal') throw new Error('the referee model declined this batch' + (r.stop_details && r.stop_details.category ? ' (' + r.stop_details.category + ')' : ''));
  if (r.stop_reason === 'max_tokens') throw new Error('the referee reply was cut off');
  const text = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const out = JSON.parse(text || '{}').verdicts;
  if (!Array.isArray(out)) throw new Error('the referee reply had no verdicts');
  const got = new Map(); out.forEach(v => { if (v && Number.isInteger(v.i) && v.i >= 0 && v.i < batch.length) got.set(v.i, v); });
  if (got.size !== batch.length) throw new Error('the referee answered ' + got.size + ' of ' + batch.length + ' items');   // all or nothing, so no answer is judged by accident
  return batch.map((x, i) => ({ valid: got.get(i).valid !== false, why: String(got.get(i).why || '').slice(0, 80) }));
}

// items: [{ key, cat, letter, answer }]. Resolves Map key -> { valid, why }. Rejects if the referee cannot work,
// so the rounds wait for the next night instead of being scored unchecked.
async function judge(items) {
  const verdicts = new Map(), m = mode();
  if (m === 'waiting') throw new Error(why());
  if (m === 'rules') { items.forEach(x => verdicts.set(x.key, { valid: true, why: '' })); return verdicts; }
  for (let i = 0; i < items.length; i += 40) {
    const batch = items.slice(i, i + 40);
    let res;
    try { res = await ask(batch); }
    catch (e) { if (Anthropic && e instanceof Anthropic.APIError) throw new Error('the Claude API answered ' + (e.status || 'with an error') + ': ' + e.message); throw e; }
    batch.forEach((x, k) => verdicts.set(x.key, res[k]));
  }
  return verdicts;
}
module.exports = { judge, mode, model: MODEL };
