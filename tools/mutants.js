/* Break the code on purpose and check that the tests notice.
   node tools/mutants.js  -> copies js/ and tests/ into a temp folder once per mutation, runs the suite there,
   and prints which tests failed. Every mutation must make at least one test fail. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const MUTANTS = [
  ['jumps optional in American', 'js/rules.js', "crownEnd: true, mandatory: true,\n      sides: ['Black', 'White']", "crownEnd: true, mandatory: false,\n      sides: ['Black', 'White']"],
  ['crowning does not end the move', 'js/rules.js', 'if (v.crownEnd) emit(true, wasMan);', 'if (v.crownEnd) dfs(l, true, wasMan);'],
  ['no majority rule', 'js/rules.js', 'if (v.majority && res.length) {', 'if (false && res.length) {'],
  ['repetition needs 4', 'js/rules.js', "if (n >= 3) { st.result = { winner: null, reason: 'repetition' }", "if (n >= 4) { st.result = { winner: null, reason: 'repetition' }"],
  ['40-move rule off by one', 'js/rules.js', "notation: 'num', kingLimit: 80, endgame: 'none',\n      blurb: '8", "notation: 'num', kingLimit: 82, endgame: 'none',\n      blurb: '8"],
  ['FMJD 16-move rule too long', 'js/rules.js', "offer('16', 32, false)", "offer('16', 34, false)"],
  ['CBJD main-diagonal rule missing', 'js/rules.js', "offer('main', 10, false)", "offer('main', 0, false)"],
  ['capture notation wrong', 'js/rules.js', "(v.notation === 'alg' ? ':' : 'x')", "(v.notation === 'alg' ? 'x' : 'x')"],
  ['engine evaluation blind', 'js/engine.js', 'function evaluate(side) {', 'function evaluate(side) { return 0;'],
  ['online seats ignore the swap', 'js/online-game.js', 'const sideOf = (state, seat) => (seat ^ (state.swap ? 1 : 0));', 'const sideOf = (state, seat) => seat;'],
];

let bad = 0;
for (const [name, file, from, to] of MUTANTS) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-mut-'));
  for (const sub of ['js', 'tests']) fs.cpSync(path.join(ROOT, sub), path.join(dir, sub), { recursive: true });
  const f = path.join(dir, file);
  const src = fs.readFileSync(f, 'utf8');
  if (!src.includes(from)) { console.log('SKIP (pattern not found): ' + name); bad++; continue; }
  fs.writeFileSync(f, src.replace(from, to));
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', 'tests/*.test.*'], { cwd: dir, encoding: 'utf8', timeout: 900000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = [...new Set(out.split('\n').filter(l => /^\s*✖/.test(l) && !/failing tests/.test(l)).map(l => l.replace(/^\s*✖\s*/, '').replace(/\s*\(\d.*$/, '')))];
  if (!failed.length) bad++;
  console.log((failed.length ? 'CAUGHT ' : 'MISSED ') + name + (failed.length ? ' -> ' + failed.join(' | ') : ''));
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(bad ? bad + ' mutation(s) not caught' : 'all ' + MUTANTS.length + ' mutations caught');
process.exit(bad ? 1 : 0);
