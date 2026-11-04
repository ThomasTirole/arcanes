// Page élève : rejoindre, salle d'attente, questions et fin de partie sont communs ;
// le jeu lui-même est fourni par le mode (/modes/<id>/client.js).
(function () {
  'use strict';
  const { $, el, fmtTime, show, dot, renderPodium, renderBoard, renderHelp, banner, mainScore, loadMode } = window.UI;

  const socket = io();
  let code = null, token = null, myId = null, modeId = null, columns = [];
  let modePlayer = null;          // instance du jeu côté élève
  let screen = 'join';
  let clock = null;               // { tl, nq, at }

  const quiz = window.createQuizOverlay({
    socket,
    getMode: () => modePlayer,
    onShow: () => { if (screen !== 'game' && code) showScreen('game'); },
  });

  // ---------------------------------------------------------------- rejoindre
  const params = new URLSearchParams(location.search);
  if (params.get('code')) $('#codeInput').value = params.get('code');
  try { $('#nameInput').value = localStorage.getItem('arcanes-name') || ''; } catch (e) { /* rien */ }

  $('#joinForm').addEventListener('submit', e => {
    e.preventDefault();
    const c = $('#codeInput').value.trim();
    let saved = null;
    try { saved = localStorage.getItem('arcanes-token-' + c); } catch (err) { /* rien */ }
    join(c, $('#nameInput').value.trim(), saved);
  });

  function join(c, name, savedToken) {
    $('#joinError').textContent = '';
    socket.emit('player:join', { code: c, name, token: savedToken }, async res => {
      if (!res || res.error) {
        if (savedToken && res && res.error === 'Ce pseudo est déjà pris.') return join(c, name, null);
        $('#joinError').textContent = (res && res.error) || 'Erreur de connexion.';
        if (screen !== 'join') { code = null; showScreen('join'); }
        return;
      }
      // un autre mode que celui déjà chargé : on repart d'une page propre
      if (modeId && modeId !== res.lobby.mode.id) { location.href = `/?code=${encodeURIComponent(c)}`; return; }
      code = c;
      token = res.token;
      myId = res.id;
      try {
        localStorage.setItem('arcanes-token-' + c, token);
        localStorage.setItem('arcanes-name', name);
      } catch (err) { /* rien */ }

      try { await setupMode(res); } catch (err) { $('#joinError').textContent = err.message; return; }
      onLobby(res.lobby);
      if (modePlayer.onRejoin) modePlayer.onRejoin(res);
      if (res.lobby.state === 'playing') showScreen('game');
      else if (res.lobby.state === 'ended' && res.results) showEnd(res.results);
      else showScreen('lobby');
    });
  }

  socket.on('connect', () => {
    // reconnexion automatique après une coupure réseau
    if (code && token) join(code, $('#nameInput').value.trim(), token);
  });

  async function setupMode(res) {
    if (modePlayer) return;
    modeId = res.lobby.mode.id;
    columns = res.lobby.mode.columns || [];
    const def = await loadMode(modeId);
    modePlayer = def.createPlayer({
      socket,
      root: $('#modeRoot'),
      info: res.info,
      myId,
      ui: window.UI,
      quizOpen: () => quiz.isOpen(),
      isPlaying: () => screen === 'game',
      banner: (text, color) => banner($('#bannerHost'), text, color),
      action: (type, data) => socket.emit('player:action', { ...data, type }),
    });
    if (screen === 'game' && modePlayer.show) modePlayer.show();
    requestAnimationFrame(loop);
  }

  function showScreen(id) {
    const wasGame = screen === 'game';
    screen = id;
    show(id);
    if (id !== 'game') quiz.hide();
    if (modePlayer) {
      if (id === 'game' && !wasGame && modePlayer.show) modePlayer.show();
      if (id !== 'game' && wasGame && modePlayer.hide) modePlayer.hide();
    }
  }

  function loop() {
    if (screen === 'game') {
      if (clock) {
        const passed = performance.now() - clock.at;
        $('#gameTimer').textContent = fmtTime(clock.tl - passed);
        $('#nextQuizPill').classList.toggle('hidden', clock.nq == null);
        if (clock.nq != null) $('#nextQuiz').textContent = fmtTime(clock.nq - passed);
      }
      if (modePlayer && modePlayer.frame) modePlayer.frame();
    }
    requestAnimationFrame(loop);
  }

  socket.on('clock', c => { clock = { ...c, at: performance.now() }; });

  // ---------------------------------------------------------------- salle d'attente
  socket.on('room:lobby', onLobby);
  function onLobby(lobby) {
    if (modePlayer && modePlayer.setPlayers) modePlayer.setPlayers(lobby.players);
    $('#lobbyQuiz').replaceChildren(window.UI.modeLabel(lobby.mode), ` · ${lobby.quizTitle}`);
    $('#lobbyPlayers').replaceChildren(...lobby.players.map(p =>
      el('span', { class: 'chip' + (p.connected ? '' : ' off') }, dot(p.color), p.name, p.id === myId ? ' (toi)' : '')));
    renderHelp($('#lobbyHelp'), lobby.mode.help);
  }

  socket.on('game:started', () => {
    clock = null;
    if (modePlayer && modePlayer.onStart) modePlayer.onStart();
    showScreen('game');
  });

  socket.on('game:lobby', () => { clock = null; showScreen('lobby'); });

  // ---------------------------------------------------------------- fin
  socket.on('game:ended', showEnd);

  function showEnd(r) {
    showScreen('end');
    const cols = (r.mode && r.mode.columns) || columns;
    renderPodium($('#endPodium'), r.podium, cols);
    const mine = r.rows.find(x => x.id === myId);
    $('#endMine').textContent = mine
      ? `Toi : ${mainScore(mine, cols)} · ${mine.accuracy}% de bonnes réponses (${mine.correct}/${mine.answered})`
      : '';
    renderBoard($('#endTable'), r.rows, { columns: cols, meId: myId, bestId: r.bestAccuracy && r.bestAccuracy.id });
  }

  function message(text) {
    code = null;
    token = null;
    $('#messageText').textContent = text;
    showScreen('message');
  }
  socket.on('kicked', () => message('Tu as été retiré de la partie par l\'enseignant.'));
  socket.on('room:closed', () => message('La partie a été fermée.'));
})();
