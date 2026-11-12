// Fenêtre de questions commune à tous les modes de jeu.
(function () {
  'use strict';
  const { $, el } = window.UI;

  const DEFAULT_REASONS = {
    burst: ['Quiz !', '#fde68a'],
    revive: ['Réponds pour revenir dans le jeu', '#fca5a5'],
    reload: ['Recharge', '#93c5fd'],
  };

  /**
   * opts.socket : connexion socket.io
   * opts.getMode() : objet joueur du mode (facultatif : quizHeader, onQuizOpen, onQuizResult, onQuizDone, reasons)
   * opts.onShow() : appelé quand une question arrive (pour afficher l'écran de jeu)
   */
  function createQuizOverlay(opts) {
    const { socket } = opts;
    let open = false, q = null, selected = new Set(), locked = false, timerRaf = 0, canSkip = false;

    function skip() {
      if (!canSkip) return;
      canSkip = false;
      socket.emit('player:continue');
    }
    const OPEN_GUARD_MS = 900;
    let guardUntil = 0;
    const mode = () => (opts.getMode && opts.getMode()) || {};

    socket.on('quiz:question', data => {
      if (opts.onShow) opts.onShow();
      q = data;
      selected = new Set();
      locked = false;
      canSkip = false;
      // la fenêtre surgit en plein jeu : on ignore les clics réflexes pendant un court instant
      if (!open) guardUntil = performance.now() + OPEN_GUARD_MS;
      if (!open && mode().onQuizOpen) mode().onQuizOpen();
      open = true;
      $('#quiz').classList.remove('hidden');
      const reasons = { ...DEFAULT_REASONS, ...(mode().reasons || {}) };
      const [title] = reasons[data.reason] || reasons.burst;
      $('#quizTitle').textContent = title;
      $('#quizTitle').dataset.reason = data.reason;   // couleur choisie par la feuille de style (encre du feuillet)
      $('#quizProgress').textContent = `${data.progress.index}/${data.progress.total}`;
      // lettrine enluminée sur la première lettre (si la question commence par une lettre)
      const first = /^\p{L}/u.test(data.text) ? data.text[0] : '';
      $('#qText').replaceChildren(...(first ? [el('span', { class: 'initial' }, first), data.text.slice(1)] : [data.text]));
      $('#qHint').classList.toggle('hidden', !data.multi);
      $('#qFoot').replaceChildren();
      if (data.multi) {
        $('#qFoot').append(el('button', { class: 'btn primary big', id: 'qValidate', onclick: submit, disabled: true }, 'Valider'));
      }
      const box = $('#qChoices');
      box.classList.remove('locked');
      if (performance.now() < guardUntil) {
        box.classList.add('waiting');
        setTimeout(() => box.classList.remove('waiting'), guardUntil - performance.now());
      }
      box.replaceChildren(...data.choices.map((c, i) =>
        el('button', { class: 'choice', onclick: () => pick(i) }, el('span', { class: 'n' }, String(i + 1)), c)));
      refreshHeader();
      const end = performance.now() + data.timeLeft;
      cancelAnimationFrame(timerRaf);
      const tick = () => {
        const left = Math.max(0, end - performance.now());
        $('#qtimerBar').style.width = `${(left / data.timeMs) * 100}%`;
        if (left > 0 && !locked) timerRaf = requestAnimationFrame(tick);
      };
      tick();
    });

    function refreshHeader() {
      const h = mode().quizHeader ? mode().quizHeader() : null;
      $('#quizHeader').replaceChildren(...(h ? [h] : []));
    }

    function pick(i) {
      if (locked || !q || performance.now() < guardUntil) return;
      if (q.multi) {
        if (selected.has(i)) selected.delete(i); else selected.add(i);
        [...$('#qChoices').children].forEach((b, k) => b.classList.toggle('selected', selected.has(k)));
        const v = document.getElementById('qValidate');
        if (v) v.disabled = selected.size === 0;
      } else {
        selected = new Set([i]);
        $('#qChoices').children[i].classList.add('selected');
        submit();
      }
    }

    function submit() {
      if (locked || !q || selected.size === 0) return;
      locked = true;
      $('#qChoices').classList.add('locked');
      socket.emit('player:answer', { choices: [...selected] });
    }

    window.addEventListener('keydown', e => {
      if (!open) return;
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        const i = Number(digit[2]) - 1;
        if (q && i < q.choices.length) { e.preventDefault(); pick(i); }
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (performance.now() < guardUntil || e.repeat) return;   // Entrée sert aussi à tirer
        if (locked) skip(); else submit();
      }
    });

    socket.on('quiz:result', res => {
      locked = true;
      if (mode().onQuizResult) mode().onQuizResult(res);
      $('#qChoices').classList.add('locked');
      const buttons = [...$('#qChoices').children];
      if (res.correctChoices) {
        const good = new Set(res.correctChoices);
        buttons.forEach((b, i) => {
          if (good.has(i)) b.classList.add('right');
          else if (selected.has(i)) b.classList.add('wrong');
        });
      } else {
        buttons.forEach((b, i) => { if (selected.has(i)) b.classList.add(res.correct ? 'right' : 'wrong'); });
      }
      const msg = res.timeout ? 'Temps écoulé !' : res.correct ? 'Bonne réponse !' : 'Mauvaise réponse';
      $('#qFoot').replaceChildren(el('div', { class: 'qresult ' + (res.correct ? 'good' : 'bad') },
        msg, mode().renderReward ? mode().renderReward(res) : (res.reward ? `   ${res.reward}` : '')));
      if (res.explanation) {
        canSkip = !!res.canSkip;
        $('#qFoot').append(
          el('div', { class: 'qexplain' }, window.Icons.icon('bulb', { size: 20, color: '#e3b04b' }), el('span', null, res.explanation)),
          canSkip ? el('button', { class: 'btn primary', onclick: skip }, 'Continuer (Entrée)') : '');
      }
      refreshHeader();
    });

    socket.on('quiz:done', res => {
      hide();
      if (mode().onQuizDone) mode().onQuizDone(res);
    });

    function hide() {
      open = false;
      q = null;
      cancelAnimationFrame(timerRaf);
      $('#quiz').classList.add('hidden');
    }

    return { isOpen: () => open, hide };
  }

  window.createQuizOverlay = createQuizOverlay;
})();
