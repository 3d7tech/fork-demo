// Rule pack review, run by a person (see packages/rules/src/review.ts and ADR 0010 step 5).
//   pnpm rules status [--pack id]                   How many values are checked
//   pnpm rules next [--pack id]                     The next value to check, with its source
//   pnpm rules check <rule> <from> "<value>" --by "<name>"
//   pnpm rules correct <rule> <from> "<value>" --reason "<why>" --by "<name>"
//   pnpm rules publish --by "<name>"
//   pnpm rules sheet [--pack id]                    Rewrite docs/rule-pack-review.md
// Writes go to packages/rules/packs/<pack>.json; review the diff and run `pnpm test` before committing.
import { readFileSync, writeFileSync } from 'node:fs';
import { correct, formatPack, formatRuleValue, listRulePacks, parseRuleValue, publish, ReviewError, reviewSheet, reviewSummary, signOff, type RulePackData } from '../packages/rules/src';

const PACK = 'uk-2026-27';
const packPath = (id: string) => new URL(`../packages/rules/packs/${id}.json`, import.meta.url);
const SHEET = new URL('../docs/rule-pack-review.md', import.meta.url);

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const k = argv.indexOf(`--${name}`);
  if (k < 0) return undefined;
  const v = argv[k + 1];
  argv.splice(k, 2);
  return v;
};
const by = flag('by') ?? '';
const reason = flag('reason') ?? '';
const packId = flag('pack') ?? PACK;
const [command, ...args] = argv;
const today = new Date().toISOString().slice(0, 10);

const load = (): RulePackData => JSON.parse(readFileSync(packPath(packId), 'utf8'));
function save(d: RulePackData) {
  writeFileSync(packPath(packId), formatPack(d));
  writeFileSync(SHEET, reviewSheet(d));
}
function unitOf(d: RulePackData, ruleId: string) {
  const r = d.rules.find((x) => x.id === ruleId);
  if (!r) throw new ReviewError(`No rule ${ruleId} in ${d.id}`);
  return r.unit;
}

try {
  if (!listRulePacks().includes(packId)) throw new ReviewError(`Unknown rule pack ${packId}`);
  const d = load();
  if (command === 'status') {
    const s = reviewSummary(d);
    console.log(`${s.packId} ${s.version} (${s.status}): ${s.checked} of ${s.total} values checked.${s.canPublish ? ' Ready to publish.' : ''}`);
  } else if (command === 'next') {
    const i = reviewSummary(d).items.find((x) => !x.checked);
    if (!i) console.log('Every value is checked.');
    else {
      console.log(`${i.description}\n  In the pack: ${formatRuleValue(i.unit, i.value)} (${i.status}, from ${i.from})\n  Source: ${i.source.title}\n  ${i.source.url}`);
      if (i.note) console.log(`  Note: ${i.note}`);
      console.log(`\n  pnpm rules check ${i.ruleId} ${i.from} "<value you read>" --by "<your name>"`);
    }
  } else if (command === 'check' || command === 'correct') {
    const [ruleId = '', from = '', text = ''] = args;
    if (!ruleId || !from || !text) throw new ReviewError(`Usage: pnpm rules ${command} <rule> <from> "<value>"${command === 'correct' ? ' --reason "<why>"' : ''} --by "<name>"`);
    const value = parseRuleValue(unitOf(d, ruleId), text);
    const next = command === 'check' ? signOff(d, ruleId, from, value, { by, on: today }) : correct(d, ruleId, from, value, reason, { by, on: today });
    save(next);
    const s = reviewSummary(next);
    console.log(`${command === 'check' ? 'Signed off' : 'Corrected'} ${ruleId}: ${formatRuleValue(unitOf(d, ruleId), value)}. ${s.checked} of ${s.total} checked.`);
    if (command === 'correct') console.log(`Pack is now version ${next.version}. Run pnpm test: golden tests may need a person's update too.`);
  } else if (command === 'publish') {
    save(publish(d, { by, on: today }));
    console.log(`Published ${d.id}. Run pnpm test and pnpm fork recheck after it ships.`);
  } else if (command === 'sheet') {
    writeFileSync(SHEET, reviewSheet(d));
    console.log('Wrote docs/rule-pack-review.md');
  } else {
    throw new ReviewError('Usage: pnpm rules status | next | check | correct | publish | sheet  (see scripts/rules.ts)');
  }
} catch (e) {
  if (!(e instanceof ReviewError)) throw e;
  console.error(e.message);
  process.exit(1);
}
