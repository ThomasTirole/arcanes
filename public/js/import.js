// Import / export des quiz : Excel (.xlsx/.xls), CSV et JSON.
// L'import Excel/CSV reconnaît notre modèle ET les fichiers façon Wayground/Quizizz
// (colonnes « Question Text », « Option 1… », « Correct Answer », « Answer explanation »).
(function () {
  'use strict';

  const MAX_CHOICES = 6;
  const SKIP_TYPES = /open|ouvert|poll|sondage|fill|blank|trou|draw|dessin|libre/i;

  const norm = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

  // Repère les colonnes à partir de la ligne d'en-tête
  function detectColumns(header) {
    const cols = { question: -1, options: [], correct: -1, explanation: -1, type: -1 };
    header.forEach((h, i) => {
      const t = norm(h).toLowerCase();
      if (!t) return;
      if (/type/.test(t)) { if (cols.type < 0) cols.type = i; return; }
      if (/expl/.test(t)) { if (cols.explanation < 0) cols.explanation = i; return; }
      if (/correct|bonne|juste|solution/.test(t)) { if (cols.correct < 0) cols.correct = i; return; }
      const opt = /(option|r[ée]ponse|answer|choix|choice)\s*(\d+)/.exec(t);
      if (opt) { cols.options.push({ i, n: Number(opt[2]) }); return; }
      if (/question|[ée]nonc[ée]|intitul/.test(t) && cols.question < 0) cols.question = i;
    });
    cols.options.sort((a, b) => a.n - b.n);
    cols.options = cols.options.map(o => o.i);
    return cols;
  }

  // « 1,3 », « A;C », « 2 », ou le texte des bonnes réponses → indices (base 0)
  function parseCorrect(raw, choices) {
    const val = norm(raw);
    if (!val) return [];
    const out = new Set();
    const lower = choices.map(c => c.toLowerCase());
    const whole = lower.indexOf(val.toLowerCase());
    if (whole >= 0) return [whole];
    for (const tokRaw of val.split(/[,;|/]+|\s+et\s+/i)) {
      const tok = norm(tokRaw);
      if (!tok) continue;
      const num = /^(?:option|r[ée]ponse|answer|choix)?\s*(\d+)$/i.exec(tok);
      if (num) { out.add(Number(num[1]) - 1); continue; }
      if (/^[a-f]$/i.test(tok)) { out.add(tok.toUpperCase().charCodeAt(0) - 65); continue; }
      const byText = lower.indexOf(tok.toLowerCase());
      if (byText >= 0) out.add(byText);
    }
    return [...out].filter(i => i >= 0 && i < choices.length).sort((a, b) => a - b);
  }

  /** rows = tableau de lignes (tableaux de cellules). Retourne { questions, skipped, errors }. */
  function rowsToQuestions(rows) {
    const headerIdx = rows.findIndex(r => r && r.some(c => norm(c)));
    if (headerIdx < 0) throw new Error('Le fichier est vide.');
    const cols = detectColumns(rows[headerIdx]);
    if (cols.question < 0 || cols.options.length < 2) {
      throw new Error('Colonnes introuvables : il faut au moins « Question », « Réponse 1 », « Réponse 2 » et « Bonnes réponses » (télécharge le modèle).');
    }
    const questions = [], errors = [];
    let skipped = 0;
    rows.slice(headerIdx + 1).forEach((r, k) => {
      if (!r) return;
      const line = headerIdx + k + 2;
      const text = norm(r[cols.question]);
      if (!text) return;
      if (cols.type >= 0 && SKIP_TYPES.test(norm(r[cols.type]))) { skipped++; return; }
      // on garde les positions pour que « 3 » désigne bien la 3e colonne de réponse
      const raw = cols.options.map(i => norm(r[i]));
      const keep = raw.map((c, i) => ({ c, i })).filter(x => x.c);
      const choices = keep.map(x => x.c).slice(0, MAX_CHOICES);
      if (choices.length < 2) { errors.push(`Ligne ${line} : moins de 2 réponses.`); return; }
      let correct = parseCorrect(cols.correct >= 0 ? r[cols.correct] : '', raw)
        .map(i => keep.findIndex(x => x.i === i)).filter(i => i >= 0 && i < choices.length);
      if (!correct.length) { errors.push(`Ligne ${line} : bonne réponse manquante ou non reconnue.`); return; }
      const q = { text: text.slice(0, 500), choices, correct };
      const expl = cols.explanation >= 0 ? norm(r[cols.explanation]) : '';
      if (expl) q.explanation = expl.slice(0, 1000);
      questions.push(q);
    });
    return { questions, skipped, errors };
  }

  function fromJson(data) {
    const arr = Array.isArray(data) ? data : data && data.questions;
    if (!Array.isArray(arr)) throw new Error('Fichier JSON non reconnu.');
    const questions = arr.filter(q => q && q.text && Array.isArray(q.choices)).map(q => {
      const out = {
        text: String(q.text),
        choices: q.choices.map(String).slice(0, MAX_CHOICES),
        correct: (Array.isArray(q.correct) ? q.correct : [q.correct]).map(Number).filter(Number.isInteger),
      };
      if (q.explanation) out.explanation = String(q.explanation);
      return out;
    });
    return { title: data.title || '', questions, skipped: 0, errors: [] };
  }

  /** Lit un fichier choisi par l'utilisateur. Retourne { title, questions, skipped, errors }. */
  async function readQuizFile(file) {
    const name = file.name.toLowerCase();
    const baseTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (name.endsWith('.json')) {
      let data;
      try { data = JSON.parse(await file.text()); } catch (e) { throw new Error('Fichier JSON invalide.'); }
      const res = fromJson(data);
      return { ...res, title: res.title || baseTitle };
    }
    if (!window.XLSX) throw new Error('Lecteur Excel non chargé.');
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
    // on prend la 1re feuille qui contient des questions
    let lastErr = null;
    for (const sheetName of wb.SheetNames) {
      const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: '' });
      try {
        const res = rowsToQuestions(rows);
        if (res.questions.length) return { ...res, title: baseTitle };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Aucune question trouvée dans le fichier.');
  }

  const HEADER = ['Question', 'Réponse 1', 'Réponse 2', 'Réponse 3', 'Réponse 4', 'Réponse 5', 'Réponse 6', 'Bonnes réponses', 'Explication'];

  function quizToRows(questions) {
    return [HEADER, ...questions.map(q => {
      const opts = [...q.choices];
      while (opts.length < MAX_CHOICES) opts.push('');
      return [q.text, ...opts, q.correct.map(i => i + 1).join(','), q.explanation || ''];
    })];
  }

  function downloadWorkbook(rows, fileName, withHelp) {
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 50 }, ...Array(MAX_CHOICES).fill({ wch: 22 }), { wch: 16 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Questions');
    if (withHelp) {
      const help = XLSX.utils.aoa_to_sheet([
        ['Comment remplir ce modèle'],
        [''],
        ['Une ligne = une question.'],
        ['Question : l\'énoncé (obligatoire).'],
        ['Réponse 1 à 6 : au moins 2 réponses, les colonnes vides sont ignorées.'],
        ['Bonnes réponses : le numéro de la colonne. Plusieurs bonnes réponses : séparer par des virgules, ex. 1,3'],
        ['  → l\'élève n\'a juste que s\'il coche TOUTES les bonnes réponses et aucune autre.'],
        ['Explication : facultative, montrée à l\'élève quand il se trompe (si « montrer la bonne réponse » est activé) et dans le rapport.'],
        [''],
        ['Les fichiers exportés de Wayground / Quizizz (Option 1…, Correct Answer, Answer explanation) peuvent aussi être importés tels quels.'],
      ]);
      help['!cols'] = [{ wch: 110 }];
      XLSX.utils.book_append_sheet(wb, help, 'Mode d\'emploi');
    }
    XLSX.writeFile(wb, fileName);
  }

  function downloadTemplate() {
    downloadWorkbook([
      HEADER,
      ['Combien de bits dans un octet ?', '4', '8', '16', '32', '', '', '2', 'Un octet = 8 bits, soit 256 valeurs possibles.'],
      ['Lesquels sont des navigateurs web ?', 'Firefox', 'Excel', 'Chrome', 'Word', '', '', '1,3', 'Excel et Word sont des logiciels bureautiques.'],
    ], 'modele_quiz_arcanes.xlsx', true);
  }

  function exportExcel(quiz) {
    const name = (quiz.title || 'quiz').replace(/[^\w\-]+/g, '_');
    downloadWorkbook(quizToRows(quiz.questions), `${name}.xlsx`, false);
  }

  window.QuizIO = { readQuizFile, downloadTemplate, exportExcel, rowsToQuestions, parseCorrect };
})();
