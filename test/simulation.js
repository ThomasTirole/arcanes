// Simulation d'une partie : 1 prof + 4 élèves-robots. Lance : npm test
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const PW = 'test-pw';
const GAME_SECONDS = Number(process.env.SIM_SECONDS || 25);

const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT, ADMIN_PASSWORD: PW, ARCANES_DATA_DIR: require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'arcanes-')) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverErr = '';
server.stderr.on('data', d => { serverErr += d; });

const fail = msg => { console.error('ÉCHEC :', msg); server.kill(); process.exit(1); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const emit = (s, ev, data) => new Promise(r => s.emit(ev, data, r));

async function main() {
  await new Promise((res, rej) => {
    server.stdout.on('data', d => { if (String(d).includes('en ligne')) res(); });
    setTimeout(() => rej(new Error('serveur pas démarré')), 5000);
  });

  // API
  const h = { 'Content-Type': 'application/json', 'x-admin-password': PW };
  const bad = await fetch(URL + '/api/quizzes', { headers: { 'x-admin-password': 'nope' } });
  if (bad.status !== 401) fail('API accessible sans mot de passe');
  const created = await (await fetch(URL + '/api/quizzes', {
    method: 'POST', headers: h,
    body: JSON.stringify({ title: 'Test', questions: [
      { text: '1+1 ?', choices: ['2', '3'], correct: [0] },
      { text: 'Pairs ?', choices: ['2', '3', '4'], correct: [0, 2] },
    ] }),
  })).json();
  if (!created.id) fail('création quiz : ' + JSON.stringify(created));
  const invalid = await fetch(URL + '/api/quizzes', { method: 'POST', headers: h, body: JSON.stringify({ title: 'x', questions: [{ text: 'a', choices: ['b'], correct: [0] }] }) });
  if (invalid.status !== 400) fail('quiz invalide accepté');

  const modesList = await (await fetch(URL + '/api/modes', { headers: h })).json();
  if (!Array.isArray(modesList) || !modesList.find(m => m.id === 'arena')) fail('/api/modes ne liste pas l\'arène');
  const badMode = await emit(io(URL), 'host:create', { password: PW, quizId: created.id, mode: 'inexistant' });
  if (!badMode.error) fail('mode inconnu accepté');

  // prof
  const host = io(URL);
  const hostRes = await emit(host, 'host:create', { password: PW, quizId: created.id, mode: 'arena', settings: { duration: 3, frequency: 'high', showAnswer: 'on' } });
  if (!hostRes.ok) fail('host:create ' + JSON.stringify(hostRes));
  const code = hostRes.code;
  let report = null, hostStats = 0, states = 0;
  host.on('game:report', r => { report = r; });
  host.on('host:stats', () => hostStats++);
  host.on('state', () => states++);
  let clocks = 0;
  host.on('clock', c => { if (typeof c.tl === 'number' && typeof c.nq === 'number') clocks++; });

  // robots
  let projEvents = 0, dmgEvents = 0;
  const bots = [];
  for (let n = 0; n < 4; n++) {
    const s = io(URL);
    const bot = { s, name: 'Bot' + n, questions: 0, results: 0, correct: 0, done: 0, me: null, ended: null, scored: 0 };
    const res = await emit(s, 'player:join', { code, name: bot.name });
    if (!res.ok) fail('join ' + JSON.stringify(res));
    bot.id = res.id;
    bot.token = res.token;
    s.on('quiz:question', q => {
      bot.questions++;
      // le robot 0 répond toujours juste (grâce à showAnswer: on, il apprend), les autres au hasard
      setTimeout(() => {
        const pick = bot.learned && bot.learned[q.text] ? bot.learned[q.text].map(c => q.choices.indexOf(c)) : [Math.floor(Math.random() * q.choices.length)];
        bot.lastQ = q;
        bot.lastPick = pick;
        s.emit('player:answer', { choices: pick });
      }, 100 + Math.random() * 300);
    });
    bot.learned = {};
    s.on('quiz:result', r => {
      bot.results++;
      if (r.correct) bot.correct++;
      if (!r.correctChoices) fail('showAnswer=on mais pas de correctChoices');
      if (n === 0) bot.learned[bot.lastQ.text] = r.correctChoices.map(i => bot.lastQ.choices[i]);
    });
    s.on('quiz:done', () => bot.done++);
    s.on('you:scored', () => bot.scored++);
    s.on('state', st => { bot.state = st; bot.me = st.ps.find(p => p.i === bot.id); });
    bot.ammo = [0, 0, 0];
    s.on('ammo', a => { bot.ammo = a; });
    s.on('proj', () => { projEvents++; });
    s.on('dmg', () => { dmgEvents++; });
    s.on('game:ended', r => { bot.ended = r; });
    bots.push(bot);
  }

  const dup = await emit(io(URL), 'player:join', { code, name: 'bot0' });
  if (!dup.error) fail('pseudo en double accepté');

  const start = await emit(host, 'host:start', {});
  if (!start.ok) fail('host:start');

  // IA : foncer sur l'adversaire le plus proche et tirer
  const ai = setInterval(() => {
    for (const b of bots) {
      if (!b.me || b.me.s !== 'a' || !b.state) continue;
      let target = null, best = Infinity;
      for (const p of b.state.ps) {
        if (p.i === b.id || p.s !== 'a') continue;
        const d = Math.hypot(p.x - b.me.x, p.y - b.me.y);
        if (d < best) { best = d; target = p; }
      }
      if (!target) continue;
      const dx = target.x - b.me.x, dy = target.y - b.me.y;
      b.s.emit('player:action', { type: 'input', keys: { u: dy < -20, d: dy > 20, l: dx < -20, r: dx > 20 } });
      const slot = best < 150 && b.ammo[1] > 0 ? 1 : b.ammo[2] > 0 && Math.random() < 0.2 ? 2 : 0;
      b.s.emit('player:action', { type: 'cast', slot, aim: { x: target.x, y: target.y } });
    }
  }, 150);

  // déconnexion / reconnexion d'un robot en cours de partie
  await wait(GAME_SECONDS * 500);
  const b3 = bots[3];
  b3.s.disconnect();
  await wait(1000);
  b3.s = io(URL);
  const qBefore = b3.questions;
  b3.s.on('quiz:question', q => { b3.questions++; b3.s.emit('player:answer', { choices: [0] }); });
  b3.s.on('state', st => { b3.state = st; b3.me = st.ps.find(p => p.i === b3.id); });
  b3.s.on('game:ended', r => { b3.ended = r; });
  const rj = await emit(b3.s, 'player:join', { code, name: 'ignored', token: b3.token });
  if (!rj.ok || rj.id !== b3.id) fail('reconnexion ' + JSON.stringify(rj));
  await wait(800);
  if (b3.questions <= qBefore) fail('pas de question après reconnexion');

  host.emit('host:addMinute');
  await wait(GAME_SECONDS * 500);
  clearInterval(ai);
  host.emit('host:end');
  await wait(800);

  // vérifications
  if (!report) fail('pas de rapport prof');
  for (const b of bots) {
    if (!b.ended) fail(`${b.name} n'a pas reçu la fin`);
    if (b.ended.questions) fail('le rapport par question a fuité chez un élève');
  }
  if (!states || !hostStats || !clocks) fail('pas de diffusion d\'état / horloge');
  if (!report.mode || report.mode.id !== 'arena' || !report.mode.columns.length) fail('rapport sans infos de mode');
  if (!projEvents) fail('aucun évènement de projectile');
  for (const q of report.questions) {
    if (!Array.isArray(q.picks) || q.picks.length !== q.choices.length) fail('statistiques par réponse manquantes');
    if (q.asked - q.correct !== q.wrong.reduce((n, w) => n + w.count, 0)) fail('liste des élèves en erreur incohérente');
  }
  console.log('Projectiles :', projEvents, '— dégâts :', dmgEvents);
  const totalStuns = report.rows.reduce((s, r) => s + r.stuns, 0);
  const totalGot = report.rows.reduce((s, r) => s + r.gotStunned, 0);
  const asked = report.questions.reduce((s, q) => s + q.asked, 0);
  const answered = report.rows.reduce((s, r) => s + r.answered, 0);
  if (asked !== answered) fail(`incohérence questions ${asked} vs ${answered}`);
  if (totalStuns > totalGot) fail('plus de stuns donnés que subis');

  console.log('Robots :');
  for (const b of bots) console.log(`  ${b.name}: ${b.questions} questions, ${b.correct}/${b.results} justes, ${b.done} retours arène, ${b.scored} stuns`);
  console.log('Rapport :', report.rows.map(r => `${r.name} ${r.stuns} stuns ${r.accuracy}%`).join(' | '));
  console.log('Précision classe :', report.classAccuracy + '%', '— podium :', report.podium.map(p => p.name).join(', '));
  console.log('Total stuns :', totalStuns, '— états reçus par le prof :', states);

  // rejouer
  const relobby = new Promise(r => bots[0].s.once('game:lobby', r));
  host.emit('host:replay');
  await Promise.race([relobby, wait(1000).then(() => fail('replay'))]);

  host.emit('host:close');
  await wait(200);
  if (serverErr.replace(/.*ADMIN_PASSWORD.*\n?/g, '').trim()) fail('erreurs serveur :\n' + serverErr);
  console.log('OK — simulation réussie');
  server.kill();
  process.exit(0);
}

main().catch(e => fail(e.stack || e.message));
