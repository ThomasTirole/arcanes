// Tests rapides sans réseau : correction des questions à plusieurs réponses, import Excel.
'use strict';
const assert = require('assert');
const { Session } = require('../lib/session');

// faux socket.io : on capture ce qui est envoyé
const sent = [];
const io = { to: () => ({ emit: (ev, data) => sent.push({ ev, data }) }), sockets: { sockets: new Map() } };
const quiz = { title: 'T', questions: [{ text: 'Pairs ?', choices: ['1', '2', '3', '4'], correct: [1, 3], explanation: 'deux et quatre' }] };
const s = new Session(io, '123456', quiz, { showAnswer: 'on' });
s.state = 'playing';
const fakeSocket = { id: 'a', join() {} };
const { token } = s.addPlayer(fakeSocket, 'Léa');
const p = s.players.get(token);

function ask(pick) {
  s.startQuiz(p, 1, 'burst');
  const order = p.quiz.current.order;          // ordre mélangé vu par l'élève
  const shown = pick.map(orig => order.indexOf(orig));
  sent.length = 0;
  s.answer(p, shown);
  return sent.find(m => m.ev === 'quiz:result').data;
}

assert.strictEqual(ask([1, 3]).correct, true, 'toutes les bonnes réponses → juste');
assert.strictEqual(ask([1]).correct, false, 'une seule des deux → faux');
assert.strictEqual(ask([1, 2, 3]).correct, false, 'bonnes réponses + une fausse → faux');
assert.strictEqual(ask([0, 2]).correct, false, 'que des fausses → faux');
const r = ask([3]);
assert.strictEqual(r.explanation, 'deux et quatre', 'explication envoyée quand l’élève se trompe');
assert.strictEqual(ask([1, 3]).explanation, undefined, 'pas d’explication quand c’est juste');

const st = s.computeResults().questions[0];
assert.strictEqual(st.asked, 6);
assert.strictEqual(st.correct, 2);
assert.deepStrictEqual(st.picks, [1, 4, 2, 4]);
assert.strictEqual(st.wrong[0].name, 'Léa');
assert.strictEqual(st.wrong[0].count, 4);

// import Excel/CSV (même code que dans le navigateur)
global.window = {};
require('../public/js/import.js');
const { rowsToQuestions } = window.QuizIO;
const res = rowsToQuestions([
  ['Question Text', 'Question Type', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Correct Answer', 'Time in seconds', 'Image Link', 'Answer explanation'],
  ['Capitale ?', 'Multiple Choice', 'Zurich', 'Berne', 'Genève', '', '', '2', '30', '', 'Berne est la ville fédérale.'],
  ['Pairs ?', 'Checkbox', '1', '2', '3', '4', '', '2,4', '30', '', ''],
  ['Avis ?', 'Open-Ended', '', '', '', '', '', '', '30', '', ''],
]);
assert.strictEqual(res.questions.length, 2);
assert.deepStrictEqual(res.questions[1].correct, [1, 3]);
assert.strictEqual(res.questions[0].explanation, 'Berne est la ville fédérale.');
assert.strictEqual(res.skipped, 1);

console.log('OK — tests unitaires réussis');
