'use strict';
// Stockage des quiz dans un fichier JSON. Les quiz sont indépendants des modes de jeu :
// n'importe quel mode peut utiliser n'importe quel quiz.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sampleQuiz() {
  return {
    id: crypto.randomUUID(),
    title: 'Démo — Informatique de base',
    updatedAt: Date.now(),
    questions: [
      { text: 'Dans Excel, quelle formule additionne les cellules A1 à A10 ?', choices: ['=SOMME(A1:A10)', '=ADD(A1;A10)', '=TOTAL(A1-A10)', '=SOMME(A1;A10)'], correct: [0], explanation: 'Le deux-points « : » désigne une plage (A1 jusqu\'à A10) ; le point-virgule « ; » sépare deux cellules isolées.' },
      { text: 'Quel symbole rend une référence de cellule absolue dans Excel ?', choices: ['#', '$', '&', '@'], correct: [1], explanation: 'Le $ fige la colonne et/ou la ligne : $A$1 ne bouge plus quand on recopie la formule (raccourci F4).' },
      { text: 'Combien de bits dans un octet ?', choices: ['4', '8', '16', '32'], correct: [1], explanation: 'Un octet = 8 bits, ce qui permet 256 valeurs différentes (2⁸).' },
      { text: 'Lesquels sont des navigateurs web ?', choices: ['Firefox', 'Chrome', 'Excel', 'Edge'], correct: [0, 1, 3], explanation: 'Excel est un tableur ; les trois autres sont des navigateurs. Il fallait cocher les trois navigateurs.' },
      { text: 'Que signifie « URL » ?', choices: ['Uniform Resource Locator', 'Universal Router Link', 'User Remote Login', 'Unique Resource Label'], correct: [0] },
      { text: 'Dans un MCD, une entité représente…', choices: ['un objet ou concept du domaine', 'une requête SQL', 'un fichier Excel', 'un serveur web'], correct: [0] },
      { text: 'Quel raccourci annule la dernière action (Windows) ?', choices: ['Ctrl+Y', 'Ctrl+Z', 'Ctrl+X', 'Ctrl+A'], correct: [1] },
      { text: 'Quelles extensions correspondent à des images ?', choices: ['.png', '.docx', '.jpg', '.csv'], correct: [0, 2], explanation: '.png et .jpg sont des images ; .docx est un document Word et .csv un tableau en texte.' },
    ],
  };
}

function clean(body) {
  if (!body || typeof body !== 'object') throw new Error('Données invalides.');
  const title = String(body.title || '').trim().slice(0, 100);
  if (!title) throw new Error('Le quiz doit avoir un titre.');
  if (!Array.isArray(body.questions) || body.questions.length === 0) throw new Error('Ajoute au moins une question.');
  if (body.questions.length > 300) throw new Error('300 questions maximum.');
  const questions = body.questions.map((q, n) => {
    const label = `Question ${n + 1}`;
    const text = String((q && q.text) || '').trim().slice(0, 500);
    if (!text) throw new Error(`${label} : l'énoncé est vide.`);
    if (!Array.isArray(q.choices)) throw new Error(`${label} : réponses manquantes.`);
    const choices = q.choices.map(c => String(c || '').trim().slice(0, 200));
    if (choices.length < 2 || choices.length > 6) throw new Error(`${label} : entre 2 et 6 réponses.`);
    if (choices.some(c => !c)) throw new Error(`${label} : une réponse est vide.`);
    const correct = [...new Set((q.correct || []).map(Number))]
      .filter(i => Number.isInteger(i) && i >= 0 && i < choices.length).sort();
    if (correct.length === 0) throw new Error(`${label} : coche au moins une bonne réponse.`);
    const explanation = String((q && q.explanation) || '').trim().slice(0, 1000);
    const out = { text, choices, correct };
    if (explanation) out.explanation = explanation;
    if (q.fixedOrder) out.fixedOrder = true;   // ne pas mélanger les réponses
    return out;
  });
  return { title, questions };
}

class QuizStore {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'quizzes.json');
    this.items = this.load();
    if (!this.items) { this.items = [sampleQuiz()]; this.save(); }
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(data)) return data;
    } catch (e) { /* fichier absent ou illisible */ }
    return null;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.items, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list() {
    return this.items
      .map(q => ({ id: q.id, title: q.title, count: q.questions.length, updatedAt: q.updatedAt }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  get(id) { return this.items.find(q => q.id === id) || null; }

  create(body) {
    const q = { id: crypto.randomUUID(), ...clean(body), updatedAt: Date.now() };
    this.items.push(q);
    this.save();
    return q;
  }

  update(id, body) {
    const i = this.items.findIndex(q => q.id === id);
    if (i < 0) return null;
    this.items[i] = { id, ...clean(body), updatedAt: Date.now() };
    this.save();
    return this.items[i];
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter(q => q.id !== id);
    if (this.items.length === before) return false;
    this.save();
    return true;
  }

  // copie figée utilisée par une partie (modifier le quiz ne casse pas une partie en cours)
  snapshot(id) {
    const q = this.get(id);
    return q ? JSON.parse(JSON.stringify(q)) : null;
  }
}

module.exports = { QuizStore };
