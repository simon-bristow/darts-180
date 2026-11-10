'use strict';
// Darts-caller speech using the device's built-in voices (works offline).
const Speech = (() => {
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  // British male voices, best first. Arthur/Daniel ship with iPadOS; the rest cover Mac, Chrome and Windows.
  const PREFERRED = ['Arthur', 'Daniel', 'Oliver', 'George', 'Malcolm', 'Google UK English Male', 'Microsoft Ryan', 'Microsoft George', 'Microsoft Thomas'];
  let voices = [];
  let chosen = ''; // voice name saved in settings; '' = automatic

  const load = () => { if (synth) voices = synth.getVoices(); };
  if (synth) { load(); synth.addEventListener?.('voiceschanged', load); }

  const english = () => voices
    .filter(v => /^en[-_]/i.test(v.lang))
    .sort((a, b) => (b.lang.replace('_', '-') === 'en-GB') - (a.lang.replace('_', '-') === 'en-GB') || a.name.localeCompare(b.name));

  function pickVoice() {
    if (!voices.length) load();
    if (chosen) { const v = voices.find(x => x.name === chosen); if (v) return v; }
    const gb = voices.filter(v => /^en[-_]GB/i.test(v.lang));
    for (const name of PREFERRED) {
      const v = gb.find(x => x.name.includes(name)) || voices.find(x => x.name.includes(name) && /^en/i.test(x.lang));
      if (v) return v;
    }
    return gb[0] || voices.find(v => /^en/i.test(v.lang)) || null;
  }

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function words(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    const r = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${r ? ' and ' + words(r) : ''}`;
  }
  const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh'];
  const ordinal = n => ORD[n - 1] || `number ${n}`;

  // ---------- Audio engine ----------
  let ctx = null;
  // Play through the iPad's silent switch, like the speech does (Safari 16.4+).
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
  function audio() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    return ctx;
  }
  // iOS only lets audio start from a tap, so wake the audio engine on every touch.
  const unlock = () => { const c = audio(); if (c && c.state !== 'running') c.resume().catch(() => {}); };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

  // ---------- Hit sounds (all synthesised, no audio files) ----------
  function noise(c, secs) {
    const len = Math.max(1, Math.floor(c.sampleRate * secs));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    return src;
  }
  // Filtered noise burst: type 'lowpass' | 'bandpass', freq Hz, length s, level.
  function burst(c, out, t, type, freq, len, level, q = 0.8) {
    const n = noise(c, len);
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = level;
    n.connect(f).connect(g).connect(out);
    n.start(t);
  }
  // Sine "body" with a falling pitch: the low thump of something hitting a solid board.
  function body(c, out, t, f0, f1, dur, level) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // A dart landing in a bristle board: dull low thump plus a muffled fibre "thk".
  function dartThud(c, out, t, heavy = 1) {
    body(c, out, t, 150 / heavy, 52 / heavy, 0.09 * heavy, 0.95);
    burst(c, out, t, 'lowpass', 900 / heavy, 0.03 * heavy, 0.7);
  }

  const SOUNDS = {
    thud: {
      label: 'Dart thud', ms: 110,
      play: (c, out, t) => dartThud(c, out, t),
    },
    thwack: {
      label: 'Dart thud + bristle', ms: 120,
      play: (c, out, t) => { dartThud(c, out, t); burst(c, out, t + 0.002, 'bandpass', 1800, 0.018, 0.35); },
    },
    heavy: {
      label: 'Heavy thunk', ms: 170,
      play: (c, out, t) => dartThud(c, out, t, 1.6),
    },
    triple: {
      label: 'Three darts', ms: 330,
      play: (c, out, t) => { dartThud(c, out, t); dartThud(c, out, t + 0.11); dartThud(c, out, t + 0.22); },
    },
    wood: {
      label: 'Wood block', ms: 120,
      play: (c, out, t) => {
        // Two damped resonances give the hollow "tock", plus a stick click.
        [[880, 0.07, 0.8], [1760, 0.035, 0.25]].forEach(([freq, decay, level]) => {
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq * 1.04, t);
          o.frequency.exponentialRampToValueAtTime(freq, t + 0.02);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(level, t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0001, t + decay * 1.6);
          o.connect(g).connect(out);
          o.start(t);
          o.stop(t + 0.12);
        });
        burst(c, out, t, 'bandpass', 2500, 0.012, 0.35, 1.2);
      },
    },
    none: { label: 'No sound', ms: 0, play: () => {} },
  };

  function playSound(name) {
    const snd = SOUNDS[name] || SOUNDS.thud;
    const c = audio();
    if (!c || snd.ms === 0) return;
    const go = () => {
      const out = c.createGain();
      out.gain.value = 0.9;
      out.connect(c.destination);
      snd.play(c, out, c.currentTime + 0.005);
    };
    if (c.state === 'running') go();
    else c.resume().then(go).catch(() => {});
  }

  // ---------- Sequenced playback ----------
  // Items run strictly one after another: strings / {text, rate, pitch} are spoken,
  // {sound: name} plays a hit sound, {pause: ms} waits.
  let run = 0;             // bumping this abandons any sequence still playing
  const live = new Set();  // keep utterances referenced so Safari fires their end events

  function speakOne(p, voice, token, done) {
    const u = new SpeechSynthesisUtterance(p.text);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-GB';
    u.rate = p.rate ?? 0.95;
    u.pitch = p.pitch ?? 1;
    live.add(u);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true; live.delete(u); clearTimeout(guard);
      if (token === run) done();
    };
    u.onend = finish;
    u.onerror = finish;
    // Backups in case the browser never reports the end of speech:
    // watch the speaking flag, and give up after a generous time limit.
    let started = false;
    const poll = setInterval(() => {
      if (finished || token !== run) { clearInterval(poll); return; }
      if (synth.speaking) started = true;
      else if (started && !synth.pending) { clearInterval(poll); finish(); }
    }, 50);
    const guard = setTimeout(() => { clearInterval(poll); finish(); }, 1500 + p.text.length * 120);
    synth.speak(u);
  }

  /** Play a sequence (see above). Cuts off anything still playing. */
  function say(parts) {
    if (!synth) return;
    const token = ++run;
    synth.cancel();
    const voice = pickVoice();
    const queue = [].concat(parts).map(x => (typeof x === 'string' ? { text: x } : x)).filter(x => x && (x.text || x.sound || x.pause));
    const next = () => {
      if (token !== run || !queue.length) return;
      const p = queue.shift();
      if (p.sound) { playSound(p.sound); setTimeout(next, (SOUNDS[p.sound] || SOUNDS.thud).ms); }
      else if (p.pause) setTimeout(next, p.pause);
      else speakOne(p, voice, token, next);
    };
    next();
  }

  return {
    supported: !!synth,
    say,
    playSound,
    sounds: () => Object.entries(SOUNDS).map(([id, x]) => ({ id, label: x.label })),
    words,
    ordinal,
    setVoice(name) { chosen = name || ''; },
    voiceName() { const v = pickVoice(); return v ? v.name : null; },
    /** English voices for the settings list, British first. */
    list: () => english().map(v => ({ name: v.name, lang: v.lang })),
  };
})();
