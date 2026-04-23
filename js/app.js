// Jawari Web — 耳の師匠を、ポケットに
// iOS版 Jawari と等価の音律ロジック & 加算合成をブラウザで実装。

// ========================================
// Model: pitch classes, scales, tunings, chords
// ========================================

const PITCH_CLASSES = [
  { id: 0,  name: "C"  }, { id: 1,  name: "C♯" }, { id: 2,  name: "D"  },
  { id: 3,  name: "E♭" }, { id: 4,  name: "E"  }, { id: 5,  name: "F"  },
  { id: 6,  name: "F♯" }, { id: 7,  name: "G"  }, { id: 8,  name: "A♭" },
  { id: 9,  name: "A"  }, { id: 10, name: "B♭" }, { id: 11, name: "B"  }
];

const SCALE_FORMS = {
  major:         { label: "長調",          pattern: [0, 2, 4, 5, 7, 9, 11], degrees: ["Ⅰ","Ⅱ","Ⅲ","Ⅳ","Ⅴ","Ⅵ","Ⅶ"] },
  naturalMinor:  { label: "短調(自然)",    pattern: [0, 2, 3, 5, 7, 8, 10], degrees: ["ⅰ","ⅱ","♭Ⅲ","ⅳ","ⅴ","♭Ⅵ","♭Ⅶ"] },
  harmonicMinor: { label: "短調(和声)",    pattern: [0, 2, 3, 5, 7, 8, 11], degrees: ["ⅰ","ⅱ","♭Ⅲ","ⅳ","Ⅴ","♭Ⅵ","Ⅶ"] }
};

const TUNINGS = {
  equalTemperament: "平均律",
  pythagorean:      "ピタゴラス",
  justIntonation:   "純正律"
};

const CHORD_PRESETS = {
  root:             { label: "単音",       includesThird: false, intervals: (_q) => [0] },
  rootFifth:        { label: "1 + 5",      includesThird: false, intervals: (_q) => [0, 7] },
  rootOctave:       { label: "1 + 8",      includesThird: false, intervals: (_q) => [0, 12] },
  rootFifthOctave:  { label: "1 + 5 + 8",  includesThird: false, intervals: (_q) => [0, 7, 12] },
  triad:            { label: "1 + 3 + 5",  includesThird: true,  intervals: (q) => [0, q === "major" ? 4 : 3, 7] },
  triadOctave:      { label: "1 + 3 + 5 + 8", includesThird: true, intervals: (q) => [0, q === "major" ? 4 : 3, 7, 12] }
};

const TIMBRES = {
  pureSine:     { label: "Pure Sine",     icon: "wave" },
  warmPad:      { label: "Warm Pad",      icon: "pad"  },
  brightOrgan:  { label: "Bright Organ",  icon: "organ" },
  tambura:      { label: "Tambura",       icon: "tambura" },
  celloEnsemble:{ label: "Cello Ensemble",icon: "cello" }
};

// ========================================
// DroneMath — 音律ロジック（iOS版と完全等価）
// ========================================

const PYTH_RATIOS = [
  1,          256/243,    9/8,        32/27,
  81/64,      4/3,        729/512,    3/2,
  128/81,     27/16,      16/9,       243/128
];

const JI_RATIOS = [
  1,          16/15,      9/8,        6/5,
  5/4,        4/3,        45/32,      3/2,
  8/5,        5/3,        9/5,        15/8
];

function mod12(x) { return ((x % 12) + 12) % 12; }

function ratio(semitones, tuning) {
  const s = mod12(semitones);
  switch (tuning) {
    case "equalTemperament": return Math.pow(2, s / 12);
    case "pythagorean":      return PYTH_RATIOS[s];
    case "justIntonation":   return JI_RATIOS[s];
    default: return 1;
  }
}

// 主音の取り方:
//   pythagoreanFromA: 独奏・無伴奏。基準 A から純 5 度連鎖（ピタゴラス律）。GDAE が開放弦調弦と一致。
//   equalTemperament: ピアノ伴奏。基準 A から平均律 12 等分。
//   temperedFifthChain: 弦楽合奏。基準 A から 5 度を -2¢ 狭めた連鎖。コンマを 12 箇所に分散する折衷調弦。
const ENSEMBLE_FIFTH_NARROW_CENTS = 2.0;

function fifthCircleDistanceFromA(semitoneInOctave) {
  // s = mod12(7n), 12 法での 7 の逆元は 7。 n ≡ 7s mod 12、これを -5..+6 に折り畳む。
  const rawN = (semitoneInOctave * 7) % 12;
  return rawN > 6 ? rawN - 12 : rawN;
}

function normalizeToOctave(ratio) {
  let r = ratio;
  while (r < 1.0) r *= 2.0;
  while (r >= 2.0) r /= 2.0;
  return r;
}

function tonicFrequency(tonicPc, referenceA, tonicTuning) {
  const targetMidi = 48 + tonicPc;
  const semitoneDiff = targetMidi - 69;
  const octaves = Math.floor(semitoneDiff / 12);
  const mod = mod12(semitoneDiff);

  switch (tonicTuning) {
    case "pythagoreanFromA":
      return referenceA * PYTH_RATIOS[mod] * Math.pow(2, octaves);
    case "temperedFifthChain": {
      const fifthSteps = fifthCircleDistanceFromA(mod);
      const narrowedFifth = 1.5 * Math.pow(2, -ENSEMBLE_FIFTH_NARROW_CENTS / 1200);
      const raw = Math.pow(narrowedFifth, fifthSteps);
      return referenceA * normalizeToOctave(raw) * Math.pow(2, octaves);
    }
    case "equalTemperament":
    default:
      return referenceA * Math.pow(2, semitoneDiff / 12);
  }
}

function droneSemitoneFromTonic(scaleForm, degree) {
  const pattern = SCALE_FORMS[scaleForm].pattern;
  const i = Math.max(0, Math.min(degree, pattern.length - 1));
  return pattern[i];
}

function droneRootFrequency(cfg) {
  const t = tonicFrequency(cfg.tonicPitchClass, cfg.referenceA, cfg.tonicTuning);
  const s = droneSemitoneFromTonic(cfg.scaleForm, cfg.droneScaleDegree);
  return t * ratio(s, cfg.tuningSystem);
}

function dronePitchClass(cfg) {
  const s = droneSemitoneFromTonic(cfg.scaleForm, cfg.droneScaleDegree);
  return mod12(cfg.tonicPitchClass + s);
}

function droneCentsFromET(cfg) {
  const s = droneSemitoneFromTonic(cfg.scaleForm, cfg.droneScaleDegree);
  const et = Math.pow(2, s / 12);
  const actual = ratio(s, cfg.tuningSystem);
  return 1200 * Math.log2(actual / et);
}

function renderVoices(cfg) {
  const root = droneRootFrequency(cfg);
  const preset = CHORD_PRESETS[cfg.chordPreset];
  const intervals = preset.intervals(cfg.quality);
  return intervals.map((interval, index) => {
    const octaves = Math.floor(interval / 12);
    const s = mod12(interval);
    const freq = root * ratio(s, cfg.tuningSystem) * Math.pow(2, octaves);
    let amplitude;
    if (interval === 0) amplitude = 0.92;
    else if (interval === 3 || interval === 4) amplitude = 0.58;
    else if (interval === 7) amplitude = 0.76;
    else if (interval === 12) amplitude = 0.52;
    else amplitude = 0.5;
    let pan;
    if (intervals.length === 1) pan = 0;
    else pan = (index / (intervals.length - 1)) * 1.2 - 0.6;
    return { frequency: freq, amplitude, pan, index };
  });
}

function defaultQualityForDegree(scaleForm, degree) {
  const pattern = SCALE_FORMS[scaleForm].pattern;
  if (degree >= pattern.length) return "major";
  const root = pattern[degree];
  const thirdPc = pattern[(degree + 2) % pattern.length];
  let diff = thirdPc - root;
  if (diff < 0) diff += 12;
  return diff === 4 ? "major" : "minor";
}

// ========================================
// Harmonic profiles — iOS版と同じ倍音比率
// ========================================

const HARMONIC_PROFILES = {
  pureSine:    { weights: [[1, 1.00]],                                                            gain: 0.46 },
  warmPad:     { weights: [[1, 1.00], [2, 0.40], [3, 0.30], [4, 0.20], [5, 0.15], [6, 0.10], [7, 0.05], [8, 0.03]], gain: 0.42 },
  brightOrgan: { weights: [[1, 1.00], [3, 0.50], [5, 0.40], [7, 0.30], [9, 0.20], [11, 0.15], [13, 0.10], [15, 0.10]], gain: 0.36 },
  // Tambura / Cello は加算合成で近似（iOS版も同様）
  tambura:     { weights: [[1, 0.50], [2, 0.26], [3, 0.22], [4, 0.16], [5, 0.11], [6, 0.14], [7, 0.09], [9, 0.07]], gain: 0.40 },
  celloEnsemble:{ weights: [[1, 1.00], [2, 0.35], [3, 0.24], [4, 0.18], [5, 0.10]],               gain: 0.45 }
};

function buildPeriodicWave(ctx, profile) {
  const maxH = Math.max(...profile.weights.map(w => w[0])) + 1;
  const real = new Float32Array(maxH);
  const imag = new Float32Array(maxH);
  for (const [h, w] of profile.weights) {
    // Sin phase: imag (negative = sin), positive imag = negative sin
    imag[h] = w * profile.gain;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

function buildClickBuffer(ctx, frequency, durationMs, peak) {
  const sr = ctx.sampleRate;
  const frameCount = Math.floor((durationMs / 1000) * sr);
  const buffer = ctx.createBuffer(1, frameCount, sr);
  const data = buffer.getChannelData(0);
  const tau = 0.012;
  const attackFrames = Math.floor(0.002 * sr);
  for (let i = 0; i < frameCount; i++) {
    const t = i / sr;
    const env = Math.exp(-t / tau);
    const attack = i < attackFrames ? i / attackFrames : 1;
    data[i] = peak * Math.sin(2 * Math.PI * frequency * t) * env * attack;
  }
  return buffer;
}

// ========================================
// Audio Engine
// ========================================

class DroneEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = [];
    this.periodicWaves = null;
    this.strongClick = null;
    this.weakClick = null;
    this.isPlaying = false;
    this.configuration = null;
  }

  _ensureContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.periodicWaves = {};
    for (const [key, profile] of Object.entries(HARMONIC_PROFILES)) {
      this.periodicWaves[key] = buildPeriodicWave(this.ctx, profile);
    }
    this.strongClick = buildClickBuffer(this.ctx, 1600, 60, 0.55);
    this.weakClick   = buildClickBuffer(this.ctx, 900,  50, 0.30);
  }

  _makeVoice(cfg, voiceData) {
    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.periodicWaves[cfg.timbre]);
    osc.frequency.value = voiceData.frequency;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = voiceData.pan;

    osc.connect(panner).connect(gain).connect(this.master);
    osc.start();
    return { osc, gain, panner };
  }

  updateConfiguration(cfg) {
    this._ensureContext();
    this.configuration = cfg;

    const voiceData = renderVoices(cfg);
    const normalizer = 1 / Math.sqrt(Math.max(voiceData.length, 1));

    // Reconcile voice count (keep phase by keeping oscillators)
    while (this.voices.length > voiceData.length) {
      const v = this.voices.pop();
      v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      v.osc.stop(this.ctx.currentTime + 0.1);
    }
    while (this.voices.length < voiceData.length) {
      const vd = voiceData[this.voices.length];
      this.voices.push(this._makeVoice(cfg, vd));
    }

    // Update params with smooth transitions
    const now = this.ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const vd = voiceData[i];
      v.osc.setPeriodicWave(this.periodicWaves[cfg.timbre]);
      v.osc.frequency.setTargetAtTime(vd.frequency, now, 0.01);
      v.panner.pan.setTargetAtTime(vd.pan, now, 0.02);
      const targetGain = this.isPlaying ? vd.amplitude * normalizer : 0;
      v.gain.gain.setTargetAtTime(targetGain, now, 0.03);
    }

    // Master volume
    const masterTarget = this.isPlaying ? cfg.volume : 0;
    this.master.gain.setTargetAtTime(masterTarget, now, 0.03);
  }

  setPlaying(playing) {
    this._ensureContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.isPlaying = playing;
    if (this.configuration) {
      this.updateConfiguration(this.configuration);
    }
  }

  setVolume(vol) {
    if (!this.ctx || !this.configuration) return;
    this.configuration.volume = vol;
    if (this.isPlaying) {
      this.master.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.03);
    }
  }

  playClick(accent) {
    this._ensureContext();
    if (this.ctx.state === "suspended") this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = accent ? this.strongClick : this.weakClick;
    src.connect(this.ctx.destination);
    src.start();
  }
}

// ========================================
// Progression controller (metronome + chord switching)
// ========================================

class Progression {
  constructor(engine, onStatusChange, onBarChange) {
    this.engine = engine;
    this.onStatusChange = onStatusChange;
    this.onBarChange = onBarChange;
    this.running = false;
    this.timer = null;
  }

  start(plan, onRequireConfig) {
    if (this.running) return;
    this.running = true;
    const beatMs = 60000 / plan.bpm;
    const countInBeats = Math.max(0, plan.countInBars) * plan.beatsPerBar;
    let phase = countInBeats > 0 ? "countin" : "main";
    let beatIdx = 0;
    let barIdx = 0;
    let ticksDone = 0;
    const plan_ = plan;

    // Set first bar's chord immediately (used during count-in too)
    this.onBarChange({ barIdx: 0, beatIdx: 0, phase, remaining: countInBeats });

    const tick = () => {
      if (!this.running) return;

      if (phase === "countin") {
        const localBeat = ticksDone;
        const isFirstBeat = (localBeat % plan_.beatsPerBar) === 0;
        const accent = plan_.accentFirstBeat && isFirstBeat;
        this.engine.playClick(accent);
        const remaining = countInBeats - localBeat;
        this.onStatusChange({ phase, remaining, barIdx: 0, beatIdx: localBeat % plan_.beatsPerBar });
        ticksDone++;
        if (ticksDone >= countInBeats) {
          phase = "main";
          beatIdx = 0;
          barIdx = 0;
          ticksDone = 0;
          // Immediately at downbeat of bar 0:
          this.engine.playClick(plan_.accentFirstBeat);
          this.onBarChange({ barIdx: 0, beatIdx: 0, phase, remaining: 0 });
          this.onStatusChange({ phase, remaining: 0, barIdx: 0, beatIdx: 0 });
          beatIdx = 1;
          if (beatIdx >= plan_.beatsPerBar) {
            beatIdx = 0;
            barIdx = (barIdx + 1) % plan_.bars.length;
            if (barIdx === 0) {
              // stay at bar 0 (wrap already done)
            }
            this.onBarChange({ barIdx, beatIdx: 0, phase, remaining: 0 });
          }
        }
      } else {
        // main phase
        const isFirstBeat = beatIdx === 0;
        const accent = plan_.accentFirstBeat && isFirstBeat;
        this.engine.playClick(accent);
        if (isFirstBeat) {
          this.onBarChange({ barIdx, beatIdx, phase, remaining: 0 });
        }
        this.onStatusChange({ phase, remaining: 0, barIdx, beatIdx });
        beatIdx++;
        if (beatIdx >= plan_.beatsPerBar) {
          beatIdx = 0;
          barIdx = (barIdx + 1) % plan_.bars.length;
        }
      }

      if (this.running) {
        this.timer = setTimeout(tick, beatMs);
      }
    };

    // First tick runs immediately for count-in; for main phase we fire immediately too
    tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.onStatusChange({ phase: "idle" });
  }
}

// ========================================
// State
// ========================================

const STORAGE_KEY = "jawari.state";

function defaultState() {
  return {
    tonicPitchClass: 9,        // A
    scaleForm: "major",
    droneScaleDegree: 0,
    tonicTuning: "pythagoreanFromA",
    tuningSystem: "justIntonation",
    referenceA: 442,
    chordPreset: "triad",
    quality: "major",
    timbre: "warmPad",
    volume: 0.72,
    syncQualityWithScale: true,
    progression: {
      bpm: 80,
      beatsPerBar: 4,
      countInBars: 1,
      accentFirstBeat: true,
      bars: [
        { degree: 0, quality: "major" },
        { degree: 3, quality: "major" },
        { degree: 4, quality: "major" },
        { degree: 0, quality: "major" }
      ]
    }
  };
}

function loadState() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return defaultState();
    return { ...defaultState(), ...JSON.parse(s) };
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

// ========================================
// Main app
// ========================================

const state = loadState();
const engine = new DroneEngine();
const progression = new Progression(engine, onProgressionStatus, onProgressionBar);

function configuration() {
  return {
    tonicPitchClass: state.tonicPitchClass,
    scaleForm: state.scaleForm,
    droneScaleDegree: state.droneScaleDegree,
    tonicTuning: state.tonicTuning,
    tuningSystem: state.tuningSystem,
    referenceA: state.referenceA,
    chordPreset: state.chordPreset,
    quality: state.quality,
    timbre: state.timbre,
    volume: state.volume
  };
}

function pushConfigToEngine() {
  engine.updateConfiguration(configuration());
}

// ========================================
// UI rendering
// ========================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function renderRingButtons() {
  const wrap = $("#ring-buttons");
  wrap.innerHTML = "";
  const rect = wrap.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const radius = Math.min(rect.width, rect.height) * 0.38;
  PITCH_CLASSES.forEach((pc) => {
    const angle = (pc.id / 12) * 2 * Math.PI - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const btn = document.createElement("button");
    btn.className = "ring-orb" + (pc.id === state.tonicPitchClass ? " active" : "");
    btn.style.left = x + "px";
    btn.style.top = y + "px";
    btn.textContent = pc.name;
    btn.setAttribute("aria-label", `主音 ${pc.name}`);
    btn.onclick = () => {
      state.tonicPitchClass = pc.id;
      onConfigChanged();
    };
    wrap.appendChild(btn);
  });
}

function renderRingCenter() {
  const cfg = configuration();
  const degreeLabels = SCALE_FORMS[state.scaleForm].degrees;
  const dpc = dronePitchClass(cfg);
  const droneName = PITCH_CLASSES[dpc].name;
  const hz = droneRootFrequency(cfg).toFixed(1);
  const cents = droneCentsFromET(cfg);
  $("#ring-degree").textContent = degreeLabels[state.droneScaleDegree];
  $("#ring-pitch").textContent = droneName;
  $("#ring-hz").textContent = hz + " Hz";
  $("#ref-label").textContent = "A=" + Math.round(state.referenceA);
  $("#cents-label").textContent = Math.abs(cents) < 0.05
    ? "ET ±0¢"
    : `ET ${cents > 0 ? "+" : ""}${cents.toFixed(1)}¢`;
  $("#key-display").textContent =
    PITCH_CLASSES[state.tonicPitchClass].name + " " + SCALE_FORMS[state.scaleForm].label;
}

function renderDegreePills() {
  const row = $("#degree-row");
  row.innerHTML = "";
  const labels = SCALE_FORMS[state.scaleForm].degrees;
  labels.forEach((lab, i) => {
    const btn = document.createElement("button");
    btn.className = "pill" + (i === state.droneScaleDegree ? " active" : "");
    btn.textContent = lab;
    btn.onclick = () => {
      state.droneScaleDegree = i;
      if (state.syncQualityWithScale) {
        state.quality = defaultQualityForDegree(state.scaleForm, i);
      }
      onConfigChanged();
    };
    row.appendChild(btn);
  });
}

function renderTuningRow() {
  $$("#tuning-row .pill").forEach((el) => {
    el.classList.toggle("active", el.dataset.tuning === state.tuningSystem);
    el.onclick = () => {
      state.tuningSystem = el.dataset.tuning;
      onConfigChanged();
    };
  });
}

function renderChordRow() {
  const row = $("#chord-row");
  row.innerHTML = "";
  Object.entries(CHORD_PRESETS).forEach(([key, preset]) => {
    const btn = document.createElement("button");
    btn.className = "pill" + (key === state.chordPreset ? " active" : "");
    btn.textContent = preset.label;
    btn.onclick = () => {
      state.chordPreset = key;
      onConfigChanged();
    };
    row.appendChild(btn);
  });
}

function renderQualityRow() {
  const preset = CHORD_PRESETS[state.chordPreset];
  const row = $("#quality-row");
  row.hidden = !preset.includesThird;
  $$("#quality-row .pill").forEach((el) => {
    el.classList.toggle("active", el.dataset.quality === state.quality);
    el.onclick = () => {
      state.syncQualityWithScale = false;
      state.quality = el.dataset.quality;
      onConfigChanged();
    };
  });
}

function timbreIconSvg(name) {
  const icons = {
    wave:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12 Q6 4 10 12 T18 12 T26 12" stroke-linecap="round"/></svg>',
    pad:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 15.5a4.5 4.5 0 010-9 5.5 5.5 0 0110.84-.7A4 4 0 0117 15.5H7z"/></svg>',
    organ:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="1.5"/><line x1="8" y1="5" x2="8" y2="19"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>',
    tambura: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18 M12 3v18"/></svg>',
    cello:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2v10.5a3.5 3.5 0 11-2-3.16V2h2zm9 5v10.5a3.5 3.5 0 11-2-3.16V7h2z"/></svg>'
  };
  return icons[name] || icons.wave;
}

function renderTimbreRow() {
  const row = $("#timbre-row");
  row.innerHTML = "";
  Object.entries(TIMBRES).forEach(([key, t]) => {
    const btn = document.createElement("button");
    btn.className = "timbre-card" + (key === state.timbre ? " active" : "");
    btn.innerHTML = timbreIconSvg(t.icon) + `<span>${t.label}</span>`;
    btn.onclick = () => {
      state.timbre = key;
      onConfigChanged();
    };
    row.appendChild(btn);
  });
}

function renderPlayButton() {
  const playing = engine.isPlaying;
  $(".play-icon").hidden = playing;
  $(".stop-icon").hidden = !playing;
}

function renderAll() {
  renderRingButtons();
  renderRingCenter();
  renderDegreePills();
  renderTuningRow();
  renderChordRow();
  renderQualityRow();
  renderTimbreRow();
  renderPlayButton();
}

function onConfigChanged() {
  renderAll();
  pushConfigToEngine();
  saveState();
  renderBarsEditor();   // degree表示がtonicに連動
}

// ========================================
// Scale menu (key display click)
// ========================================

$("#scale-menu").addEventListener("click", () => {
  const options = Object.entries(SCALE_FORMS);
  const currentIdx = options.findIndex(([k]) => k === state.scaleForm);
  const nextIdx = (currentIdx + 1) % options.length;
  state.scaleForm = options[nextIdx][0];
  if (state.droneScaleDegree >= SCALE_FORMS[state.scaleForm].pattern.length) {
    state.droneScaleDegree = 0;
  }
  if (state.syncQualityWithScale) {
    state.quality = defaultQualityForDegree(state.scaleForm, state.droneScaleDegree);
  }
  onConfigChanged();
});

// ========================================
// Play / Volume
// ========================================

$("#play-btn").addEventListener("click", () => {
  engine.setPlaying(!engine.isPlaying);
  renderPlayButton();
});

$("#volume").addEventListener("input", (e) => {
  state.volume = e.target.value / 100;
  engine.setVolume(state.volume);
  saveState();
});
$("#volume").value = Math.round(state.volume * 100);

// ========================================
// View navigation (menu / drone / progression / reading / article)
// ========================================

const VIEWS = ["view-menu", "view-drone", "view-progression", "view-reading", "view-article"];

function navigate(target) {
  const id = "view-" + target;
  VIEWS.forEach((v) => ($("#" + v).hidden = v !== id));
  if (target === "progression") renderBarsEditor();
  if (target === "drone") {
    // Ensure ring is laid out correctly after a view change
    requestAnimationFrame(() => renderRingButtons());
  }
  window.scrollTo(0, 0);
}

$$("[data-nav]").forEach((el) => {
  el.addEventListener("click", () => navigate(el.dataset.nav));
});

// ========================================
// Sheets (settings / tuning info only)
// ========================================

const sheets = ["sheet-settings", "sheet-tuning"];

function openSheet(id) {
  sheets.forEach((s) => ($("#" + s).hidden = s !== id));
  $("#backdrop").hidden = false;
}
function closeAllSheets() {
  sheets.forEach((s) => ($("#" + s).hidden = true));
  $("#backdrop").hidden = true;
}

$("#backdrop").addEventListener("click", closeAllSheets);
$$(".close-btn").forEach(btn => btn.addEventListener("click", closeAllSheets));

$("#btn-settings").addEventListener("click", () => openSheet("sheet-settings"));
$("#btn-tuning-info").addEventListener("click", () => openSheet("sheet-tuning"));

// ========================================
// Reading articles
// ========================================

const READING_ARTICLES = {
  tonicTuning: {
    title: "主音の取り方",
    html: `
<p class="intro">Jawari は「主音の絶対周波数」を 3 つの場面から選べるように設計しました。弦楽器の長い伝統、20 世紀半ばから現代までの学術研究、現役ソリストの証言を踏まえた 3 つの立場です。</p>

<h3>1. 独奏・無伴奏（デフォルト）</h3>
<p>基準 A から純 5 度連鎖（ピタゴラス律）で全主音を取ります。G-D-A-E が開放弦の調弦と完全一致。Greene 1949、Nickerson 1949、Loosen 1995 の実測研究で確認された、弦楽器奏者が無伴奏で旋律を弾くときの実態です。長 3 度は平均律より約 8 セント広く、導音は解決音に近く、「Leading tones should lead」というカザルス以来の原則そのもの。無伴奏バッハ、スケール練習、重音の基準音作りに向きます。</p>

<h3>2. ピアノ伴奏</h3>
<p>基準 A から平均律 12 等分で主音を取ります。ピアノ・鍵盤・電子楽器・管楽器と合わせるときの標準。開放弦 D や G と平均律の主音との間には 5〜8 セントの差が残りますが、ピアノの主音と一致する方を優先します。ベートーヴェンやブラームスのバイオリンソナタ、ピアノ伴奏付き協奏曲の練習に向きます。</p>

<h3>3. 弦楽合奏</h3>
<p>基準 A から 5 度を -2 セント狭めた連鎖で全主音を取る折衷調弦。純 5 度をそのまま 12 回重ねるとピタゴラス・コンマ（23.5¢）が 1 箇所に集中して、主調から離れた調で和音が破綻します。この問題を避けるため、ほんの少しだけ 5 度を狭めてコンマを 12 箇所に分散させます。弦楽四重奏でバイオリンの E を下げて純正長 3 度を優先する実践と同じ発想です。弦楽四重奏やオーケストラの中で合奏練習するときに向きます。</p>

<h3>同じ C でも調によって違う</h3>
<p>Jawari はさらに「その主音から何度の音をドローンにするか」を指定する 2 段階構造です。C メジャーのⅠ度の C と、G メジャーのⅣ度の C は、純正律では約 2 セント違う絶対周波数で鳴ります。これは弦楽器奏者が無意識にやっている動的音程 (dynamic intonation) の本質で、ピアノという固定音程楽器では表現できない弦楽器の本質的な表現の幅です。</p>

<h3>使い分けの目安</h3>
<p>ソロ・無伴奏・重音作り → 独奏モード。ピアノと合わせるとき → ピアノ伴奏モード。弦楽カルテットや合奏練習 → 弦楽合奏モード。迷ったら独奏モードから始めてください。どのモードでも、和音（ドローン音を根とした 3 度・5 度・オクターブ）は選んだ音律で鳴ります。つまりⅠ度 + 純正律のトライアドなら、どのモードでも内部はピッタリ純正にハモります。</p>
`
  },
  tunings: {
    title: "音律について",
    html: `
<p class="intro">Jawari は「曲の調（主音）」と「ドローンの度数」を分けて扱います。音律は主音からドローンまでの音程、およびドローン和音の内部音程に適用されます。同じ C でも C 長調のⅠ度と G 長調のⅣ度では、純正律では絶対周波数が違います。</p>

<h3>平均律</h3>
<p>1 オクターブを 12 等分した現代の標準。どの調に移っても響きが同じで、すべての協和音がわずかに濁るのが特徴です。</p>

<h3>ピタゴラス</h3>
<p>主音から純 5 度（3:2）の連鎖で構築した古典音律。5 度と 4 度は綺麗に澄むが、長 3 度 (81:64) は平均律より +7.8 セント広く、旋律として歌いやすい。バイオリンの旋律で好まれる並び。</p>

<h3>純正律</h3>
<p>主音に対して 3 度 5:4、5 度 3:2、6 度 5:3 の整数比。長 3 度は平均律より -13.7 セント低く、和音のハモリ密度が段違いに上がる。合奏とコード練習の相棒。</p>
`
  },
  harmonics: {
    title: "倍音プロファイル",
    html: `
<p>Pure Sine は基音のみ。Warm Pad は第 2〜8 倍音を 0.40/0.30/0.20/0.15/0.10/0.05/0.03 の比率で加算。Bright Organ は奇数倍音 3/5/7/9/11/13/15 を 0.50/0.40/0.30/0.20/0.15/0.10/0.10 の比率で加算しています。Tambura と Cello は加算合成による近似です（将来サンプル音源に差し替え予定）。</p>
<p>iOS 版では Goertzel DFT による倍音強度の実測テストを自動実行しており、仕様書設計値と±0.07 以内で一致していることを数値で保証しています。</p>
`
  },
  about: {
    title: "このアプリについて",
    html: `
<h3>コンセプト</h3>
<p>タンブーラの駒「ジャワリ」が倍音を爆発的に引き出すように、楽器の音程を引き締めるドローン。川越バイオリン教室での日々のレッスンから生まれた、教師と生徒のためのドローンです。</p>

<h3>プライバシー</h3>
<p>ネットワーク通信、解析、広告 SDK、トラッキングは一切使用しません。設定情報は端末内（localStorage）にのみ保存されます。</p>

<p class="meta-line">開発元: ngmt4amtk / サポート: ngmt4a.mtk@gmail.com</p>
<p class="meta-line">ネイティブ iOS 版: 開発中（App Store リリース予定）</p>
`
  }
};

$$("[data-reading]").forEach((el) => {
  el.addEventListener("click", () => {
    const art = READING_ARTICLES[el.dataset.reading];
    if (!art) return;
    $("#article-title").textContent = art.title;
    $("#article-body").innerHTML = art.html;
    navigate("article");
  });
});

// ========================================
// Settings pickers
// ========================================

function fillSelect(el, entries, currentValue) {
  el.innerHTML = "";
  entries.forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (value == currentValue) opt.selected = true;
    el.appendChild(opt);
  });
}

fillSelect(
  $("#default-tonic"),
  PITCH_CLASSES.map((pc) => [pc.id, pc.name]),
  state.tonicPitchClass
);
fillSelect(
  $("#default-scale"),
  Object.entries(SCALE_FORMS).map(([k, v]) => [k, v.label]),
  state.scaleForm
);

$("#default-tonic").addEventListener("change", (e) => {
  state.tonicPitchClass = Number(e.target.value);
  onConfigChanged();
});
$("#default-scale").addEventListener("change", (e) => {
  state.scaleForm = e.target.value;
  if (state.droneScaleDegree >= SCALE_FORMS[state.scaleForm].pattern.length) {
    state.droneScaleDegree = 0;
  }
  if (state.syncQualityWithScale) {
    state.quality = defaultQualityForDegree(state.scaleForm, state.droneScaleDegree);
  }
  onConfigChanged();
});
$("#reference-a").value = state.referenceA;
$("#reference-a").addEventListener("change", (e) => {
  state.referenceA = Number(e.target.value);
  onConfigChanged();
});
const TONIC_TUNING_DETAIL = {
  pythagoreanFromA: "基準 A から純 5 度連鎖（ピタゴラス律）。G-D-A-E が開放弦調弦と完全一致。無伴奏・独奏・スケール練習の標準。Greene 1949 / Nickerson 1949 / Loosen 1995 で実測された弦楽奏者の自然な実態。",
  equalTemperament: "基準 A から平均律 12 等分。ピアノ・鍵盤・管楽器と合わせるときの標準。開放弦との間に 5〜8¢ の差が残るが、ピアノの主音と一致する方を優先します。",
  temperedFifthChain: "基準 A から 5 度を -2¢ 狭めた連鎖。ピタゴラス・コンマを 12 箇所に分散し、どの調に移っても破綻しない折衷調弦。弦楽四重奏で純正長 3 度を優先する実践と整合します。"
};

function updateTonicTuningDetail() {
  const el = document.getElementById("tonic-tuning-detail");
  if (el) el.textContent = TONIC_TUNING_DETAIL[state.tonicTuning] || "";
}

$("#tonic-tuning").value = state.tonicTuning;
updateTonicTuningDetail();
$("#tonic-tuning").addEventListener("change", (e) => {
  state.tonicTuning = e.target.value;
  updateTonicTuningDetail();
  onConfigChanged();
});
$("#sync-quality").checked = state.syncQualityWithScale;
$("#sync-quality").addEventListener("change", (e) => {
  state.syncQualityWithScale = e.target.checked;
  if (state.syncQualityWithScale) {
    state.quality = defaultQualityForDegree(state.scaleForm, state.droneScaleDegree);
  }
  onConfigChanged();
});

// ========================================
// Progression editor
// ========================================

$("#bpm").value = state.progression.bpm;
$("#bpm-val").textContent = state.progression.bpm;
$("#bpm").addEventListener("input", (e) => {
  state.progression.bpm = Number(e.target.value);
  $("#bpm-val").textContent = state.progression.bpm;
  saveState();
});

$("#beats-per-bar").value = state.progression.beatsPerBar;
$("#beats-per-bar").addEventListener("change", (e) => {
  state.progression.beatsPerBar = Number(e.target.value);
  saveState();
});

$("#count-in").value = state.progression.countInBars;
$("#count-in").addEventListener("change", (e) => {
  state.progression.countInBars = Number(e.target.value);
  saveState();
});

$("#add-bar").addEventListener("click", () => {
  if (state.progression.bars.length >= 16) return;
  const last = state.progression.bars[state.progression.bars.length - 1] || { degree: 0, quality: "major" };
  state.progression.bars.push({ degree: last.degree, quality: last.quality });
  renderBarsEditor();
  saveState();
});

function renderBarsEditor() {
  const wrap = $("#bars-editor");
  wrap.innerHTML = "";
  const degLabels = SCALE_FORMS[state.scaleForm].degrees;
  state.progression.bars.forEach((bar, idx) => {
    const row = document.createElement("div");
    row.className = "bar-row" + (
      progression.running && idx === currentProgressionBarIdx ? " active" : ""
    );

    const idxCell = document.createElement("span");
    idxCell.className = "idx";
    idxCell.textContent = (idx + 1);
    row.appendChild(idxCell);

    const degWrap = document.createElement("div");
    degWrap.className = "degree-pick";
    const degSel = document.createElement("select");
    degLabels.forEach((dl, di) => {
      const opt = document.createElement("option");
      opt.value = di;
      const pc = mod12(state.tonicPitchClass + SCALE_FORMS[state.scaleForm].pattern[di]);
      opt.textContent = `${dl}  (${PITCH_CLASSES[pc].name})`;
      if (di === bar.degree) opt.selected = true;
      degSel.appendChild(opt);
    });
    degSel.onchange = (e) => {
      bar.degree = Number(e.target.value);
      saveState();
    };
    degWrap.appendChild(degSel);
    row.appendChild(degWrap);

    const qSel = document.createElement("select");
    [["major", "メジャー"], ["minor", "マイナー"]].forEach(([v, l]) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = l;
      if (v === bar.quality) opt.selected = true;
      qSel.appendChild(opt);
    });
    qSel.onchange = (e) => {
      bar.quality = e.target.value;
      saveState();
    };
    row.appendChild(qSel);

    const rm = document.createElement("button");
    rm.className = "remove";
    rm.textContent = "×";
    rm.disabled = state.progression.bars.length <= 1;
    rm.onclick = () => {
      if (state.progression.bars.length <= 1) return;
      state.progression.bars.splice(idx, 1);
      renderBarsEditor();
      saveState();
    };
    row.appendChild(rm);

    wrap.appendChild(row);
  });
}

let currentProgressionBarIdx = 0;

$("#progression-toggle").addEventListener("click", () => {
  if (progression.running) {
    progression.stop();
  } else {
    if (!engine.isPlaying) {
      engine.setPlaying(true);
      renderPlayButton();
    }
    progression.start(state.progression);
  }
  updateProgressionButton();
});

function updateProgressionButton() {
  const btn = $("#progression-toggle");
  if (progression.running) {
    btn.textContent = "進行ストップ";
    btn.classList.add("stop");
  } else {
    btn.textContent = "進行スタート";
    btn.classList.remove("stop");
    $("#progression-status").textContent = "待機中";
  }
  $("#btn-progression").classList.toggle("active", progression.running);
}

function onProgressionBar(ev) {
  currentProgressionBarIdx = ev.barIdx;
  const bar = state.progression.bars[ev.barIdx];
  if (!bar) return;
  state.syncQualityWithScale = false;
  state.droneScaleDegree = bar.degree;
  state.quality = bar.quality;
  onConfigChanged();
  renderBarsEditor();
}

function onProgressionStatus(ev) {
  if (ev.phase === "idle") {
    $("#progression-status").textContent = "待機中";
    return;
  }
  if (ev.phase === "countin") {
    $("#progression-status").textContent = `カウントイン 残り ${ev.remaining}`;
  } else {
    $("#progression-status").textContent =
      `Bar ${ev.barIdx + 1} / ${state.progression.bars.length} · Beat ${ev.beatIdx + 1}`;
  }
}

// ========================================
// Initial render
// ========================================

// Render once DOM painted (so ring-buttons container has non-zero size)
requestAnimationFrame(() => {
  renderAll();
});

window.addEventListener("resize", () => {
  renderRingButtons();
});

// Don't push config to engine until user interacts (iOS AudioContext rule).
// But keep state saved / UI rendered. First play click will init audio.
