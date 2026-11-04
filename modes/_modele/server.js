'use strict';
// ---------------------------------------------------------------------------
// MODÈLE DE MODE DE JEU — point de départ pour créer un nouveau jeu.
//
// Pour l'activer : copier le dossier modes/_modele en modes/<id> (sans « _ »),
// mettre le même <id> dans `static id` ci-dessous et dans client.js, puis
// redémarrer le serveur. Le mode apparaît alors dans « Lancer une partie ».
//
// Ce modèle est un jeu minimal et complet : chaque bonne réponse rapporte
// des points, la série de questions recommence toute seule. Tout le reste
// (salle d'attente, questions, minuteur, statistiques, résultats, CSV) est
// fourni par lib/session.js.
// ---------------------------------------------------------------------------
const { Session } = require('../../lib/session');

class ModeleSession extends Session {
  static id = '_modele';                       // = nom du dossier
  static meta = { name: 'Modèle', icon: '🧩', description: 'Chaque bonne réponse rapporte des points.' };
  static accommodationsHint = 'une mauvaise réponse rapporte 1 point';
  static settings = [                          // réglages en plus de durée / réponse / aménagements
    { key: 'points', label: 'Points par bonne réponse', type: 'select', default: 10,
      options: [5, 10, 20].map(v => ({ value: v, label: `${v} points` })) },
  ];
  static help = { text: 'Réponds juste le plus souvent possible !', controls: [['1-6', 'répondre'], ['Entrée', 'valider']] };
  static columns = [{ key: 'points', label: 'Points' }];

  initPlayer(p) { p.points = 0; }
  playerScore(p) { return { points: p.points }; }

  onStart() {
    for (const p of this.players.values()) {
      if (p.connected) this.startQuiz(p, 5, 'burst'); else p.state = 'away';
    }
  }
  onLateJoin(p) { this.startQuiz(p, 5, 'burst'); }
  onRejoin(p) { this.startQuiz(p, 5, 'burst'); }

  onAnswer(p, { correct }) {
    const gain = correct ? this.settings.points : (this.settings.accommodations ? 1 : 0);
    p.points += gain;
    return { reward: gain ? `+${gain} pts` : '', extra: { points: p.points } };
  }

  // série terminée → on en relance une (dans un vrai jeu : retour au plateau, à l'arène…)
  onQuizDone(p) {
    this.startQuiz(p, 5, 'burst');
    return { points: p.points };
  }

  // onAction(p, type, data) { … }   ← actions envoyées par client.js via ctx.action(type, data)
  // update(now, dt) { … }           ← appelé 30 fois par seconde
}

module.exports = ModeleSession;
