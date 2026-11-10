'use strict';
// Darts rules helpers: valid 3-dart totals, double-out checkout routes.
const Checkout = (() => {
  // Lower penalty = preferred dart.
  const TREBLE_PEN = { 20: 0, 19: 1, 18: 2, 17: 3 };
  const DOUBLE_PEN = { 20: 0, 16: 1, 8: 2, 18: 3, 12: 4, 10: 5, 4: 6, 14: 6, 6: 6 };

  const setups = [];
  const finishes = [];
  for (let n = 20; n >= 1; n--) {
    setups.push({ l: 'T' + n, v: 3 * n, p: TREBLE_PEN[n] ?? (n >= 10 ? 5 : 6) });
    setups.push({ l: String(n), v: n, p: 2 });
    setups.push({ l: 'D' + n, v: 2 * n, p: 6 });
    finishes.push({ l: 'D' + n, v: 2 * n, p: DOUBLE_PEN[n] ?? 7, fin: true });
  }
  setups.push({ l: '25', v: 25, p: 6 }, { l: 'Bull', v: 50, p: 7 });
  finishes.push({ l: 'Bull', v: 50, p: 8, fin: true });
  setups.sort((a, b) => a.p - b.p || b.v - a.v);

  const finishBy = new Map(finishes.map(f => [f.v, f]));

  // Best route for every checkable score 2..170.
  const routes = new Map();
  for (let score = 2; score <= 170; score++) {
    let best = null;
    const consider = arr => {
      const k = arr.length * 100 + arr.reduce((a, x) => a + x.p, 0);
      if (!best || k < best.k) best = { k, arr };
    };
    const one = finishBy.get(score);
    if (one) consider([one]);
    for (const a of setups) {
      const f = finishBy.get(score - a.v);
      if (f) consider([a, f]);
    }
    if (!best) {
      for (const a of setups) for (const b of setups) {
        const f = finishBy.get(score - a.v - b.v);
        if (f) consider([a, b, f]);
      }
    }
    if (best) routes.set(score, best.arr.map(x => x.l));
  }

  // Every total achievable with three darts (misses count as 0).
  const dartVals = [0, 25, 50];
  for (let n = 1; n <= 20; n++) dartVals.push(n, 2 * n, 3 * n);
  const valid = new Set();
  for (const a of dartVals) for (const b of dartVals) for (const c of dartVals) valid.add(a + b + c);

  return {
    /** Recommended route, e.g. ['T20','T20','D20'], or null if no double-out exists. */
    suggest: score => routes.get(score) || null,
    /** Fewest darts needed to check out, or null if impossible. */
    minDarts: score => (routes.has(score) ? routes.get(score).length : null),
    /** True if a 3-dart visit can total this score. */
    isValidTurn: s => Number.isInteger(s) && valid.has(s),
  };
})();
