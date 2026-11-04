(function () {
  'use strict';
  const { $, el, fmtTime, show, dot, pctColor, renderPodium, renderBoard, loadMode } = window.UI;

  let password = sessionStorage.getItem('arcanes-pw') || '';
  let editing = null;          // { id|null, title, questions }
  let launchQuiz = null;
  let modes = [], launchMode = null;
  let room = null;             // { code, info, mode }
  let spectator = null, clock = null, lastReport = null, screen = 'login';
  const socket = io();

  function go(id) { screen = id; show(id); }

  // ---------------------------------------------------------------- API
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { logout(); throw new Error('Session expirée.'); }
    if (!res.ok) throw new Error(data.error || 'Erreur serveur.');
    return data;
  }

  function logout() {
    password = '';
    sessionStorage.removeItem('arcanes-pw');
    go('login');
  }

  // ---------------------------------------------------------------- connexion
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = $('#pwInput').value;
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) { $('#loginError').textContent = 'Mot de passe incorrect.'; return; }
    password = pw;
    sessionStorage.setItem('arcanes-pw', pw);
    afterLogin();
  });

  function afterLogin() {
    const saved = sessionStorage.getItem('arcanes-room');
    if (saved) rejoinRoom(saved); else loadDash();
  }

  // ---------------------------------------------------------------- liste
  async function loadDash() {
    go('dash');
    $('#dashError').textContent = '';
    try {
      const list = await api('GET', '/api/quizzes');
      const box = $('#quizList');
      if (!list.length) {
        box.replaceChildren(el('div', { class: 'card muted' }, 'Aucun quiz pour l\'instant. Crée le premier !'));
        return;
      }
      box.replaceChildren(...list.map(q => el('div', { class: 'quizitem' },
        el('div', { class: 'grow' },
          el('div', { class: 't' }, q.title),
          el('div', { class: 'muted', style: 'font-size:14px' }, `${q.count} question${q.count > 1 ? 's' : ''}`)),
        el('button', { class: 'btn primary', onclick: () => openLaunch(q) }, '▶ Lancer'),
        el('button', { class: 'btn', onclick: () => openEditor(q.id) }, 'Modifier'),
        el('button', { class: 'btn', onclick: () => duplicate(q.id) }, 'Dupliquer'),
        el('button', { class: 'btn danger', onclick: () => remove(q) }, 'Supprimer'))));
    } catch (e) { $('#dashError').textContent = e.message; }
  }

  async function duplicate(id) {
    try {
      const q = await api('GET', '/api/quizzes/' + id);
      await api('POST', '/api/quizzes', { title: (q.title + ' (copie)').slice(0, 100), questions: q.questions });
      loadDash();
    } catch (e) { $('#dashError').textContent = e.message; }
  }

  async function remove(q) {
    if (!confirm(`Supprimer « ${q.title} » ?`)) return;
    try { await api('DELETE', '/api/quizzes/' + q.id); loadDash(); } catch (e) { $('#dashError').textContent = e.message; }
  }

  $('#newQuiz').addEventListener('click', () => openEditor(null));

  $('#importNew').addEventListener('change', async e => {
    const data = await readJsonFile(e.target);
    if (!data) return;
    const qs = normalizeImport(data);
    if (!qs) { $('#dashError').textContent = 'Fichier JSON non reconnu (voir le README pour le format).'; return; }
    editing = { id: null, title: (data.title || 'Quiz importé').slice(0, 100), questions: qs };
    renderEditor();
  });

  async function readJsonFile(input) {
    const f = input.files[0];
    input.value = '';
    if (!f) return null;
    try { return JSON.parse(await f.text()); } catch (e) { alert('Fichier JSON invalide.'); return null; }
  }

  // accepte { title, questions:[...] } ou directement [...]
  function normalizeImport(data) {
    const arr = Array.isArray(data) ? data : data && data.questions;
    if (!Array.isArray(arr)) return null;
    return arr.filter(q => q && q.text && Array.isArray(q.choices)).map(q => ({
      text: String(q.text),
      choices: q.choices.map(String).slice(0, 6),
      correct: Array.isArray(q.correct) ? q.correct.map(Number) : [Number(q.correct) || 0],
    }));
  }

  // ---------------------------------------------------------------- éditeur
  async function openEditor(id) {
    if (id) {
      try {
        const q = await api('GET', '/api/quizzes/' + id);
        editing = { id: q.id, title: q.title, questions: q.questions };
      } catch (e) { $('#dashError').textContent = e.message; return; }
    } else {
      editing = { id: null, title: '', questions: [blankQuestion()] };
    }
    renderEditor();
  }

  function blankQuestion() { return { text: '', choices: ['', '', '', ''], correct: [] }; }

  function renderEditor() {
    go('editor');
    $('#editorHeading').textContent = editing.id ? 'Modifier le quiz' : 'Nouveau quiz';
    $('#quizTitleInput').value = editing.title;
    $('#editorError').textContent = '';
    renderQuestions();
  }

  $('#quizTitleInput').addEventListener('input', e => { if (editing) editing.title = e.target.value; });

  function renderQuestions() {
    const list = $('#questionList');
    list.replaceChildren(...editing.questions.map((q, qi) => {
      const choices = q.choices.map((c, ci) => el('div', { class: 'chrow' },
        el('label', null,
          el('input', {
            type: 'checkbox', checked: q.correct.includes(ci),
            onchange: e => {
              q.correct = e.target.checked ? [...new Set([...q.correct, ci])] : q.correct.filter(x => x !== ci);
            },
          }), 'correcte'),
        el('input', {
          type: 'text', value: c, maxlength: 200, placeholder: `Réponse ${ci + 1}`,
          oninput: e => { q.choices[ci] = e.target.value; },
        }),
        el('button', {
          class: 'btn small ghost', title: 'Retirer cette réponse', disabled: q.choices.length <= 2,
          onclick: () => {
            q.choices.splice(ci, 1);
            q.correct = q.correct.filter(x => x !== ci).map(x => (x > ci ? x - 1 : x));
            renderQuestions();
          },
        }, '✕')));

      const textarea = el('textarea', { maxlength: 500, placeholder: 'Énoncé de la question', rows: 2,
        oninput: e => { q.text = e.target.value; } });
      textarea.value = q.text;

      return el('div', { class: 'qcard' },
        el('div', { class: 'row' },
          el('span', { class: 'qn grow' }, `Question ${qi + 1}`),
          el('button', { class: 'btn small ghost', disabled: qi === 0, title: 'Monter', onclick: () => move(qi, -1) }, '↑'),
          el('button', { class: 'btn small ghost', disabled: qi === editing.questions.length - 1, title: 'Descendre', onclick: () => move(qi, 1) }, '↓'),
          el('button', {
            class: 'btn small ghost', title: 'Dupliquer',
            onclick: () => { editing.questions.splice(qi + 1, 0, JSON.parse(JSON.stringify(q))); renderQuestions(); },
          }, '⧉'),
          el('button', {
            class: 'btn small danger', title: 'Supprimer',
            onclick: () => { editing.questions.splice(qi, 1); if (!editing.questions.length) editing.questions.push(blankQuestion()); renderQuestions(); },
          }, 'Supprimer')),
        textarea,
        choices,
        el('div', { class: 'row' },
          el('button', {
            class: 'btn small', disabled: q.choices.length >= 6,
            onclick: () => { q.choices.push(''); renderQuestions(); },
          }, '+ Réponse'),
          el('span', { class: 'muted', style: 'font-size:13px' }, 'Coche plusieurs réponses pour une question à choix multiples.')));
    }));
  }

  function move(i, d) {
    const qs = editing.questions;
    [qs[i], qs[i + d]] = [qs[i + d], qs[i]];
    renderQuestions();
  }

  $('#addQuestion').addEventListener('click', () => {
    editing.questions.push(blankQuestion());
    renderQuestions();
    const cards = $('#questionList').children;
    const last = cards[cards.length - 1];
    last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    last.querySelector('textarea').focus();
  });

  $('#cancelEdit').addEventListener('click', () => {
    if (confirm('Quitter sans enregistrer les dernières modifications ?')) loadDash();
  });

  $('#saveQuiz').addEventListener('click', async () => {
    const body = {
      title: editing.title.trim(),
      questions: editing.questions.map(q => {
        // on retire les réponses vides en recalant les bonnes réponses
        const keep = q.choices.map((c, i) => ({ c: c.trim(), i })).filter(x => x.c);
        return {
          text: q.text.trim(),
          choices: keep.map(x => x.c),
          correct: keep.map((x, n) => (q.correct.includes(x.i) ? n : -1)).filter(n => n >= 0),
        };
      }),
    };
    try {
      const saved = editing.id
        ? await api('PUT', '/api/quizzes/' + editing.id, body)
        : await api('POST', '/api/quizzes', body);
      editing.id = saved.id;
      loadDash();
    } catch (e) { $('#editorError').textContent = e.message; }
  });

  $('#exportQuiz').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ title: editing.title, questions: editing.questions }, null, 2)], { type: 'application/json' });
    download(blob, (editing.title || 'quiz').replace(/[^\w\-]+/g, '_') + '.json');
  });

  $('#importInto').addEventListener('change', async e => {
    const data = await readJsonFile(e.target);
    if (!data) return;
    const qs = normalizeImport(data);
    if (!qs) { $('#editorError').textContent = 'Fichier JSON non reconnu.'; return; }
    editing.questions = editing.questions.filter(q => q.text.trim()).concat(qs);
    if (!editing.title && data.title) editing.title = data.title;
    renderEditor();
  });

  function download(blob, name) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------- lancement
  async function openLaunch(q) {
    launchQuiz = q;
    $('#launchQuizTitle').textContent = `${q.title} (${q.count} questions)`;
    $('#launchError').textContent = '';
    try { modes = await api('GET', '/api/modes'); } catch (e) { $('#dashError').textContent = e.message; return; }
    if (!modes.length) { $('#dashError').textContent = 'Aucun mode de jeu installé.'; return; }
    let last = null;
    try { last = localStorage.getItem('arcanes-mode'); } catch (e) { /* rien */ }
    selectMode(modes.find(m => m.id === last) || modes[0]);
    go('launch');
  }

  function selectMode(m) {
    launchMode = m;
    $('#modeList').replaceChildren(...modes.map(x => el('button', {
      class: 'modecard' + (x.id === m.id ? ' selected' : ''), type: 'button', onclick: () => selectMode(x),
    }, el('span', { class: 'mt' }, `${x.icon} ${x.name}`), el('span', { class: 'md' }, x.description))));
    renderSettings(m);
  }

  // formulaire de réglages construit à partir de ce que déclare le mode
  function renderSettings(m) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('arcanes-settings-' + m.id) || '{}'); } catch (e) { /* rien */ }
    $('#settingsBox').replaceChildren(...m.settings.map(s => {
      const value = saved[s.key] !== undefined ? saved[s.key] : s.default;
      if (s.type === 'checkbox') {
        return el('label', { class: 'switch', style: 'align-self:end;padding-bottom:12px' },
          el('input', { type: 'checkbox', 'data-key': s.key, checked: !!value }), el('span', null, s.label));
      }
      const select = el('select', { 'data-key': s.key }, s.options.map(o =>
        el('option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)));
      return el('label', { class: 'field' }, s.label, select);
    }));
  }

  function readSettings() {
    const out = {};
    for (const s of launchMode.settings) {
      const input = $('#settingsBox').querySelector(`[data-key="${s.key}"]`);
      if (!input) continue;
      if (s.type === 'checkbox') out[s.key] = input.checked;
      else {
        const o = s.options.find(x => String(x.value) === input.value);
        out[s.key] = o ? o.value : s.default;
      }
    }
    return out;
  }

  $('#launchCancel').addEventListener('click', loadDash);

  $('#launchGo').addEventListener('click', () => {
    const settings = readSettings();
    try {
      localStorage.setItem('arcanes-settings-' + launchMode.id, JSON.stringify(settings));
      localStorage.setItem('arcanes-mode', launchMode.id);
    } catch (e) { /* rien */ }
    socket.emit('host:create', { password, quizId: launchQuiz.id, mode: launchMode.id, settings }, res => {
      if (!res || res.error) { $('#launchError').textContent = (res && res.error) || 'Erreur.'; return; }
      enterRoom(res);
    });
  });

  function rejoinRoom(code) {
    socket.emit('host:rejoin', { password, code }, res => {
      if (!res || res.error) { sessionStorage.removeItem('arcanes-room'); room = null; loadDash(); return; }
      enterRoom(res);
    });
  }

  let loopStarted = false;
  async function enterRoom(res) {
    // nouvelle partie dans un autre mode : on repart d'une vue spectateur neuve
    if (spectator && room && room.mode !== res.lobby.mode.id) { location.reload(); return; }
    room = { code: res.code, info: res.info, mode: res.lobby.mode.id, columns: res.lobby.mode.columns };
    sessionStorage.setItem('arcanes-room', res.code);
    if (!spectator) {
      try {
        const def = await loadMode(room.mode);
        spectator = def.createSpectator
          ? def.createSpectator({ socket, root: $('#spectatorRoot'), info: res.info, ui: window.UI })
          : {};
      } catch (e) { alert(e.message); spectator = {}; }
    }
    if (!loopStarted) { loopStarted = true; requestAnimationFrame(loop); }
    onLobby(res.lobby);
    if (res.lobby.state === 'ended' && res.results) showResults(res.results);
    else if (res.lobby.state === 'playing') go('live');
    else go('hlobby');
  }

  socket.on('connect', () => {
    if (password && room) rejoinRoom(room.code);
  });

  socket.on('room:lobby', onLobby);
  function onLobby(lobby) {
    if (!room) return;
    if (spectator && spectator.setPlayers) spectator.setPlayers(lobby.players);
    const host = location.host;
    $('#joinUrl').textContent = host;
    $('#bigCode').textContent = lobby.code;
    $('#liveCode').textContent = lobby.code;
    $('#hlobbyQuiz').textContent = `${lobby.mode.icon} ${lobby.mode.name} · ${lobby.quizTitle} · ${lobby.questionCount} questions · ${lobby.settings.duration} min`;
    $('#playerCount').textContent = lobby.players.length;
    $('#startGame').disabled = lobby.players.length === 0;
    $('#hlobbyPlayers').replaceChildren(...lobby.players.map(p =>
      el('span', {
        class: 'chip kickable' + (p.connected ? '' : ' off'), title: 'Retirer',
        onclick: () => { if (confirm(`Retirer ${p.name} de la partie ?`)) socket.emit('host:kick', { id: p.id }); },
      }, dot(p.color), p.name)));
    if (lobby.players.length === 0) {
      $('#hlobbyPlayers').append(el('span', { class: 'muted' }, 'En attente des élèves…'));
    }
  }

  $('#startGame').addEventListener('click', () => {
    socket.emit('host:start', {}, res => {
      if (!res || res.error) $('#hlobbyError').textContent = (res && res.error) || 'Erreur.';
    });
  });

  $('#lobbyClose').addEventListener('click', () => {
    if (!confirm('Annuler cette partie ?')) return;
    closeRoom();
  });

  function closeRoom() {
    socket.emit('host:close');
    sessionStorage.removeItem('arcanes-room');
    room = null;
    clock = null;
    if (spectator) { location.reload(); return; }
    loadDash();
  }

  // ---------------------------------------------------------------- en jeu
  socket.on('game:started', () => { clock = null; go('live'); });
  socket.on('clock', c => { clock = { ...c, at: performance.now() }; if (screen === 'hlobby') go('live'); });

  socket.on('host:stats', rows => {
    const key = room && room.columns && room.columns[0] ? room.columns[0].key : 'correct';
    const label = room && room.columns && room.columns[0] ? room.columns[0].label : '';
    rows.sort((a, b) => b[key] - a[key] || b.correct - a.correct);
    $('#liveBoard').replaceChildren(...rows.map((r, i) => el('div', { class: 'liverow' },
      el('span', { class: 'muted', style: 'width:20px' }, String(i + 1)),
      dot(r.color, 12),
      el('span', { class: 'nm' }, r.name),
      el('span', { class: 'st' }, r.state || ''),
      el('b', null, String(r[key])), el('span', { class: 'muted', style: 'font-size:13px' }, ` ${label.toLowerCase()}`),
      el('span', { class: 'muted', title: 'Bonnes réponses' }, ` ${r.correct}/${r.answered}`))));
  });

  function loop() {
    if (screen === 'live') {
      if (spectator && spectator.frame) spectator.frame();
      if (clock) {
        const passed = performance.now() - clock.at;
        $('#liveTimer').textContent = fmtTime(clock.tl - passed);
        $('#liveNextPill').classList.toggle('hidden', clock.nq == null);
        if (clock.nq != null) $('#liveNext').textContent = fmtTime(clock.nq - passed);
      }
    }
    requestAnimationFrame(loop);
  }

  $('#addMinute').addEventListener('click', () => socket.emit('host:addMinute'));
  $('#endGame').addEventListener('click', () => { if (confirm('Terminer la partie maintenant ?')) socket.emit('host:end'); });

  // ---------------------------------------------------------------- résultats
  socket.on('game:report', showResults);

  function showResults(r) {
    lastReport = r;
    go('results');
    const cols = (r.mode && r.mode.columns) || [];
    $('#resQuiz').textContent = `${r.mode ? `${r.mode.icon} ${r.mode.name} · ` : ''}${r.quizTitle}`;
    renderPodium($('#resPodium'), r.podium, cols);
    $('#resAcc').textContent = `${r.classAccuracy}%`;
    $('#resAccBar').style.width = `${r.classAccuracy}%`;
    $('#resAccBar').style.background = pctColor(r.classAccuracy);
    $('#resAccMsg').textContent = r.classAccuracy >= 80 ? 'Excellent, la matière est acquise !'
      : r.classAccuracy >= 60 ? 'Bien, quelques points à consolider.'
        : r.classAccuracy >= 40 ? 'Mitigé — un rappel serait utile.' : 'À reprendre en classe.';
    $('#resBest').textContent = r.bestAccuracy ? `${r.bestAccuracy.name} · ${r.bestAccuracy.accuracy}%` : '—';
    renderBoard($('#resTable'), r.rows, { columns: cols, bestId: r.bestAccuracy && r.bestAccuracy.id });

    const qs = r.questions.filter(q => q.asked > 0)
      .map(q => ({ ...q, pct: Math.round((q.correct / q.asked) * 100) }))
      .sort((a, b) => a.pct - b.pct);
    const unasked = r.questions.length - qs.length;
    $('#resQuestions').replaceChildren(
      ...qs.map(q => el('div', { class: 'qrep' },
        el('div', null, el('b', null, `Q${q.index + 1}. `), q.text,
          el('div', { class: 'muted', style: 'font-size:13px' }, `${q.correct}/${q.asked} bonnes réponses`)),
        el('div', { class: 'accbar' }, el('i', { style: `width:${q.pct}%;background:${pctColor(q.pct)}` })),
        el('div', { class: 'pc', style: `color:${pctColor(q.pct)}` }, `${q.pct}%`))),
      unasked ? el('div', { class: 'muted', style: 'font-size:14px' }, `${unasked} question(s) n'ont pas été posées pendant cette partie.`) : '');
  }

  $('#replay').addEventListener('click', () => socket.emit('host:replay'));
  socket.on('game:lobby', () => go('hlobby'));
  $('#resClose').addEventListener('click', closeRoom);

  $('#exportCsv').addEventListener('click', () => {
    if (!lastReport) return;
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const cols = (lastReport.mode && lastReport.mode.columns) || [];
    const lines = [['Nom', ...cols.map(c => c.label), 'Bonnes réponses', 'Réponses', 'Précision %'].map(esc).join(';')];
    for (const r of lastReport.rows) {
      lines.push([r.name, ...cols.map(c => r[c.key]), r.correct, r.answered, r.accuracy].map(esc).join(';'));
    }
    lines.push('');
    lines.push(['Question', 'Posée', 'Juste', '% réussite'].map(esc).join(';'));
    for (const q of lastReport.questions) {
      lines.push([q.text, q.asked, q.correct, q.asked ? Math.round((q.correct / q.asked) * 100) : ''].map(esc).join(';'));
    }
    const date = new Date().toISOString().slice(0, 10);
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `arcanes_${date}.csv`);
  });

  // ---------------------------------------------------------------- démarrage
  if (password) {
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      .then(r => (r.ok ? afterLogin() : logout()))
      .catch(() => go('login'));
  } else go('login');
})();
