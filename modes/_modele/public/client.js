// MODÈLE — côté navigateur. Voir modes/_modele/server.js pour l'activation.
(function () {
  'use strict';

  window.ArcanesModes.register('_modele', {
    css: [],        // fichiers CSS du dossier public/ à charger
    scripts: [],    // scripts supplémentaires (moteur de rendu, etc.)

    // Écran de l'élève. ctx : { socket, root, info, myId, ui, quizOpen(), isPlaying(), banner(), action(type, data) }
    createPlayer(ctx) {
      const { el } = ctx.ui;
      let points = 0;
      const big = el('div', { style: 'font-size:96px;font-weight:700;color:#fde68a' }, '0');
      ctx.root.replaceChildren(el('div', { class: 'screen' }, big, el('div', { class: 'muted' }, 'points')));
      return {
        // toutes ces fonctions sont facultatives
        frame() { big.textContent = points; },             // à chaque image
        quizHeader: () => el('span', { class: 'pill' }, `⭐ ${points}`),
        onQuizResult(res) { if (res.points != null) points = res.points; },
        onQuizDone(res) { if (res.points != null) points = res.points; },
        onStart() { points = 0; },
        onRejoin(res) { if (res.score) points = res.score.points || 0; },
        // setPlayers(list), show(), hide(), onQuizOpen(), reasons: { burst: ['Titre', '#couleur'] }
      };
    },

    // Vue projetée par le prof (facultatif). ctx : { socket, root, info, ui }
    createSpectator(ctx) {
      ctx.root.replaceChildren(ctx.ui.el('div', { class: 'screen muted' }, 'Le classement est à droite →'));
      return {};
    },
  });
})();
