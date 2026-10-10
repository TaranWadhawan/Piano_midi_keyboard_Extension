let audioCtx = null;

// Global FX Network Nodes
let masterGain = null;
let delayNode = null;
let delayFeedback = null;
let reverbNode = null;
let reverbLevel = null;
let filterNode = null;

const activeVoices = {};
const keyMap = {
  // Octave 4 & Row 1 (Z X C V B N M ,)
  'KeyZ': 0, 'KeyS': 1, 'KeyX': 2, 'KeyD': 3, 'KeyC': 4, 'KeyV': 5,
  'KeyG': 6, 'KeyB': 7, 'KeyH': 8, 'KeyN': 9, 'KeyJ': 10, 'KeyM': 11, 'Comma': 12,
  // Octave 5 & Row 2 (Q W E R T Y U I O P)
  'KeyQ': 12, 'Digit2': 13, 'KeyW': 14, 'Digit3': 15, 'KeyE': 16, 'KeyR': 17,
  'Digit5': 18, 'KeyT': 19, 'Digit6': 20, 'KeyY': 21, 'Digit7': 22, 'KeyU': 23,
  'KeyI': 24, 'Digit9': 25, 'KeyO': 26, 'Digit0': 27, 'KeyP': 28
};

// State Variables
let activeNotesArray = new Array(29).fill(false);
let noteHistory = [];
let isSustainEnabled = false;

// DOM Elements initialized on DOMContentLoaded
let presetSelect, modeSelect, waveShapeSelect, octaveSelect, pitchSlider;
let cutoffSlider, resonanceSlider, delayMixSlider, reverbMixSlider, volumeSlider;
let tempoSlider, playBeatBtn, focusHeader, statusLight, canvas, ctx, sustainCheckbox;

document.addEventListener('DOMContentLoaded', () => {
  // Bind UI selectors safely
  presetSelect = document.getElementById('model-preset');
  modeSelect = document.getElementById('track-mode');
  waveShapeSelect = document.getElementById('wave-shape');
  octaveSelect = document.getElementById('octave');
  pitchSlider = document.getElementById('pitch-bend');
  cutoffSlider = document.getElementById('cutoff');
  resonanceSlider = document.getElementById('resonance');
  delayMixSlider = document.getElementById('delay-mix');
  reverbMixSlider = document.getElementById('reverb-mix');
  volumeSlider = document.getElementById('volume');
  tempoSlider = document.getElementById('tempo');
  playBeatBtn = document.getElementById('play-beat');
  focusHeader = document.getElementById('status-bar');
  statusLight = document.getElementById('status-light');
  canvas = document.getElementById('piano-roll-canvas');
  ctx = canvas.getContext('2d');
  sustainCheckbox = document.getElementById('sustain');

  // Trigger initial focus setup
  if (document.hasFocus()) {
    handleFocus();
  }

  // Parameter Binders
  volumeSlider.addEventListener('input', () => {
    if (masterGain) {
      masterGain.gain.setValueAtTime(parseFloat(volumeSlider.value), audioCtx.currentTime);
    }
  });

  cutoffSlider.addEventListener('input', () => {
    document.getElementById('cutoff-txt').innerText = `${cutoffSlider.value} Hz`;
    if (filterNode) {
      filterNode.frequency.setValueAtTime(parseFloat(cutoffSlider.value), audioCtx.currentTime);
    }
  });

  resonanceSlider.addEventListener('input', () => {
    document.getElementById('res-txt').innerText = resonanceSlider.value;
    if (filterNode) {
      filterNode.Q.setValueAtTime(parseFloat(resonanceSlider.value), audioCtx.currentTime);
    }
  });

  delayMixSlider.addEventListener('input', () => {
    const pct = Math.round(delayMixSlider.value * 100);
    document.getElementById('delay-txt').innerText = `${pct}%`;
    if (delayFeedback) {
      delayFeedback.gain.setValueAtTime(parseFloat(delayMixSlider.value), audioCtx.currentTime);
    }
  });

  reverbMixSlider.addEventListener('input', () => {
    const pct = Math.round(reverbMixSlider.value * 100);
    document.getElementById('reverb-txt').innerText = `${pct}%`;
    if (reverbLevel) {
      reverbLevel.gain.setValueAtTime(parseFloat(reverbMixSlider.value), audioCtx.currentTime);
    }
  });

  pitchSlider.addEventListener('input', () => {
    document.getElementById('pitch-bend-val').innerText = pitchSlider.value;
  });

  sustainCheckbox.addEventListener('change', (e) => {
    isSustainEnabled = e.target.checked;
    if (!isSustainEnabled) {
      // Release all voices currently held out of standard map
      Object.keys(activeVoices).forEach(code => {
        if (!activeNotesArray[keyMap[code]]) {
          releaseNote(code);
        }
      });
    }
  });

  playBeatBtn.addEventListener('click', () => {
    if (isPlayingBeat) { stopSequencer(); }
    else { startSequencer(); }
  });

  tempoSlider.addEventListener('input', () => {
    document.getElementById('tempo-txt').innerText = `${tempoSlider.value} BPM`;
    if (isPlayingBeat) {
      stopSequencer();
      startSequencer();
    }
  });

  // Dynamic Window Scaling
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Run Graphics Render Engine
  requestAnimationFrame(updatePianoRoll);
});

// Focus Handlers
window.addEventListener('focus', handleFocus);
window.addEventListener('blur', handleBlur);

function handleFocus() {
  if (focusHeader && statusLight) {
    focusHeader.className = 'panel-focus';
    statusLight.innerText = '● STUDIO ACTIVE';
  }
}

function handleBlur() {
  if (focusHeader && statusLight) {
    focusHeader.className = 'panel-blur';
    statusLight.innerText = '⚠️ CLICK TO FOCUS STUDIO';
  }
}

// Setup Master Output & Effects Matrix
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(parseFloat(volumeSlider.value), audioCtx.currentTime);

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.setValueAtTime(parseFloat(cutoffSlider.value), audioCtx.currentTime);
  filterNode.Q.setValueAtTime(parseFloat(resonanceSlider.value), audioCtx.currentTime);

  delayNode = audioCtx.createDelay(1.0);
  delayNode.delayTime.setValueAtTime(0.3, audioCtx.currentTime);
  delayFeedback = audioCtx.createGain();
  delayFeedback.gain.setValueAtTime(parseFloat(delayMixSlider.value), audioCtx.currentTime);

  reverbNode = audioCtx.createConvolver();
  reverbNode.buffer = createReverbBuffer(audioCtx, 2.5, 1.8);
  reverbLevel = audioCtx.createGain();
  reverbLevel.gain.setValueAtTime(parseFloat(reverbMixSlider.value), audioCtx.currentTime);

  filterNode.connect(masterGain);

  filterNode.connect(delayNode);
  delayNode.connect(delayFeedback);
  delayFeedback.connect(masterGain);
  delayFeedback.connect(delayNode);

  filterNode.connect(reverbNode);
  reverbNode.connect(reverbLevel);
  reverbLevel.connect(masterGain);

  masterGain.connect(audioCtx.destination);
}

function createReverbBuffer(context, duration, decay) {
  const rate = context.sampleRate;
  const len = rate * duration;
  const buffer = context.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const p = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - p, decay);
    }
  }
  return buffer;
}

function getFrequency(noteIndex) {
  const baseOctave = parseInt(octaveSelect.value) * 12 + 12;
  const midiNote = baseOctave + noteIndex;
  const fineTune = parseFloat(pitchSlider.value) / 100;
  return 440 * Math.pow(2, (midiNote + fineTune - 69) / 12);
}

// Sound presets mapping
function generateSoundVoice(freq, preset, waveShape) {
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0, audioCtx.currentTime);

  // Default wave configuration mapped dynamically based on selected option
  let primaryType = 'triangle';
  let secondaryType = 'sine';

  if (waveShape === 'soft') {
    primaryType = 'sine';
    secondaryType = 'sine';
  } else if (waveShape === 'bright') {
    primaryType = 'sawtooth';
    secondaryType = 'triangle';
  } else if (waveShape === 'retro') {
    primaryType = 'square';
    secondaryType = 'square';
  }

  osc1.type = primaryType;
  osc2.type = secondaryType;

  let attack = 0.01;
  let decay = 0.3;
  let sustain = 0.3;
  let release = 0.2;
  let peakVolume = 0.5;

  const now = audioCtx.currentTime;

  switch (preset) {
    case 'acoustic':
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 2, now);
      attack = 0.005;
      decay = 1.2;
      sustain = 0.15;
      release = 0.3;
      
      const hammer = audioCtx.createOscillator();
      const hammerGain = audioCtx.createGain();
      hammer.type = 'sine';
      hammer.frequency.setValueAtTime(freq * 6, now);
      hammerGain.gain.setValueAtTime(0.4, now);
      hammerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      hammer.connect(hammerGain);
      hammerGain.connect(env);
      hammer.start();
      hammer.stop(now + 0.06);
      break;

    case 'vintage':
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq - 0.5, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq + 0.5, now);
      attack = 0.01;
      decay = 0.8;
      sustain = 0.1;
      release = 0.4;
      break;

    case 'electric':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq * 3.01, now);
      attack = 0.002;
      decay = 1.0;
      sustain = 0.2;
      release = 0.35;
      peakVolume = 0.4;
      break;

    case 'rhodes':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 4.99, now);
      attack = 0.005;
      decay = 0.5;
      sustain = 0.3;
      release = 0.3;
      break;

    case 'analog':
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq - 2, now);
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq + 2, now);
      attack = 0.2;
      decay = 1.5;
      sustain = 0.8;
      release = 0.9;
      peakVolume = 0.3;
      break;

    case 'fm':
      const carrier = audioCtx.createOscillator();
      const modulator = audioCtx.createOscillator();
      const depth = audioCtx.createGain();
      carrier.frequency.setValueAtTime(freq, now);
      modulator.frequency.setValueAtTime(freq * 3.5, now);
      depth.gain.setValueAtTime(freq * 1.5, now);
      modulator.connect(depth);
      depth.connect(carrier.frequency);
      carrier.connect(env);
      modulator.start();
      carrier.start();
      
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.5, now + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      return { 
        stop: () => {
          try {
            carrier.stop(); modulator.stop();
            carrier.disconnect(); modulator.disconnect();
            depth.disconnect();
          } catch(e){}
        }, 
        env 
      };

    case 'classic':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 3, now);
      attack = 0.005;
      decay = 1.8;
      sustain = 0.1;
      release = 0.25;
      break;

    case 'romantic':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2, now);
      attack = 0.04;
      decay = 2.0;
      sustain = 0.2;
      release = 0.6;
      break;

    case 'jazz':
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq * 2, now);
      attack = 0.002;
      decay = 0.5;
      sustain = 0.05;
      release = 0.15;
      break;

    case 'pop':
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 4, now);
      attack = 0.002;
      decay = 0.6;
      sustain = 0.4;
      release = 0.2;
      break;

    case 'ballad':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 1.5, now);
      attack = 0.02;
      decay = 1.0;
      sustain = 0.3;
      release = 0.4;
      break;

    case 'rnb':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 3, now);
      attack = 0.015;
      decay = 0.8;
      sustain = 0.4;
      release = 0.4;
      break;

    case 'ambient':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 1.01, now);
      attack = 0.3;
      decay = 2.0;
      sustain = 0.6;
      release = 1.5;
      break;

    case 'cinematic':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 0.5, now);
      attack = 0.03;
      decay = 1.5;
      sustain = 0.2;
      release = 0.8;
      break;

    case 'bass':
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq / 2, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq / 4, now);
      attack = 0.01;
      decay = 0.4;
      sustain = 0.7;
      release = 0.3;
      break;

    case 'country':
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 5, now);
      attack = 0.005;
      decay = 0.4;
      sustain = 0.1;
      release = 0.2;
      break;

    case 'guitar-classic':
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 3, now);
      attack = 0.008;
      decay = 0.5;
      sustain = 0.05;
      release = 0.3;
      break;

    case 'guitar-acoustic':
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 5.99, now);
      attack = 0.003;
      decay = 0.6;
      sustain = 0.05;
      release = 0.4;
      break;

    case 'guitar-electric':
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, now);
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq * 2, now);
      attack = 0.005;
      decay = 1.2;
      sustain = 0.4;
      release = 0.5;
      peakVolume = 0.35;
      break;

    case 'guitar-bass':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq / 2, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq, now);
      attack = 0.01;
      decay = 0.6;
      sustain = 0.5;
      release = 0.35;
      break;

    case 'guitar-blue':
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq - 5, now);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, now);
      attack = 0.004;
      decay = 0.7;
      sustain = 0.1;
      release = 0.4;
      break;
  }

  // Envelope routing
  osc1.connect(env);
  osc2.connect(env);
  osc1.start();
  osc2.start();

  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peakVolume, now + attack);
  env.gain.exponentialRampToValueAtTime(peakVolume * sustain + 0.0001, now + attack + decay);

  return {
    stop: () => {
      const stopNow = audioCtx.currentTime;
      env.gain.cancelScheduledValues(stopNow);
      env.gain.setValueAtTime(env.gain.value, stopNow);
      env.gain.exponentialRampToValueAtTime(0.0001, stopNow + release);
      setTimeout(() => {
        try {
          osc1.stop(); osc2.stop();
          osc1.disconnect(); osc2.disconnect();
        } catch (e) {}
      }, release * 1000);
    },
    env
  };
}

// Global Note Allocator Trigger
function playNote(keyCode) {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const noteIndex = keyMap[keyCode];
  if (noteIndex === undefined) return;

  activeNotesArray[noteIndex] = true;

  const mode = modeSelect.value;
  const preset = presetSelect.value;
  const waveShape = waveShapeSelect.value;

  if (activeVoices[keyCode]) return;

  const voices = [];

  if (mode === 'single') {
    const freq = getFrequency(noteIndex);
    const v = generateSoundVoice(freq, preset, waveShape);
    v.env.connect(filterNode);
    voices.push(v);
  } else if (mode === 'multi') {
    const freqs = [
      getFrequency(noteIndex - 12),
      getFrequency(noteIndex),
      getFrequency(noteIndex + 7)
    ];
    freqs.forEach(freq => {
      const v = generateSoundVoice(freq, preset, waveShape);
      v.env.connect(filterNode);
      voices.push(v);
    });
  } else if (mode === 'seq') {
    triggerArpeggiatorSequence(noteIndex, preset, waveShape);
  }

  activeVoices[keyCode] = voices;

  const keyElements = document.querySelectorAll(`.key[data-key="${keyCode}"]`);
  keyElements.forEach(elem => elem.classList.add('active'));
}

// Release Note Trigger
function releaseNote(keyCode) {
  if (isSustainEnabled) return; // Keep sound held while sustain is enabled

  const noteIndex = keyMap[keyCode];
  if (noteIndex !== undefined) {
    activeNotesArray[noteIndex] = false;
  }

  const voices = activeVoices[keyCode];
  if (voices) {
    voices.forEach(v => v.stop());
    delete activeVoices[keyCode];
  }

  const keyElements = document.querySelectorAll(`.key[data-key="${keyCode}"]`);
  keyElements.forEach(elem => elem.classList.remove('active'));
}

function triggerArpeggiatorSequence(rootIndex, preset, waveShape) {
  const tempo = parseInt(tempoSlider.value);
  const stepTime = (60 / tempo) / 2;
  const now = audioCtx.currentTime;

  const intervals = [0, 4, 7, 12];
  intervals.forEach((interval, step) => {
    const freq = getFrequency(rootIndex + interval);
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + step * stepTime);
    
    env.gain.setValueAtTime(0, now + step * stepTime);
    env.gain.linearRampToValueAtTime(0.4, now + step * stepTime + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, now + step * stepTime + stepTime - 0.01);
    
    osc.connect(env);
    env.connect(filterNode);
    
    osc.start(now + step * stepTime);
    osc.stop(now + step * stepTime + stepTime);
  });
}

// ==========================================
// PIANO ROLL CANVAS GRAPHICS ENGINE
// ==========================================

function resizeCanvas() {
  if (canvas) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 100;
  }
}

function updatePianoRoll() {
  if (!ctx || !canvas) return;

  ctx.fillStyle = '#07080a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const columnWidth = canvas.width / 29;

  noteHistory.unshift([...activeNotesArray]);
  if (noteHistory.length > canvas.height) {
    noteHistory.pop();
  }

  ctx.strokeStyle = '#181b22';
  ctx.lineWidth = 1;
  for (let c = 0; c < 29; c++) {
    ctx.beginPath();
    ctx.moveTo(c * columnWidth, 0);
    ctx.lineTo(c * columnWidth, canvas.height);
    ctx.stroke();
  }

  for (let row = 0; row < noteHistory.length; row++) {
    const keysState = noteHistory[row];
    for (let col = 0; col < keysState.length; col++) {
      if (keysState[col]) {
        ctx.fillStyle = `hsla(${200 + row}, 100%, 50%, ${1 - row / canvas.height})`;
        ctx.fillRect(col * columnWidth + 1, row, columnWidth - 2, 2);
      }
    }
  }

  requestAnimationFrame(updatePianoRoll);
}

// ==========================================
// ARRANGED BEATS DRUM MACHINE
// ==========================================

function runKickVoice() {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.1);
  gain.gain.setValueAtTime(0.8, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.start(now);
  osc.stop(now + 0.12);
}

function runSnareVoice() {
  initAudio();
  const size = audioCtx.sampleRate * 0.15;
  const buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) { d[i] = Math.random() * 2 - 1; }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const band = audioCtx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(1000, audioCtx.currentTime);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  source.connect(band);
  band.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

function runHatVoice() {
  initAudio();
  const size = audioCtx.sampleRate * 0.04;
  const buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) { d[i] = Math.random() * 2 - 1; }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(7000, audioCtx.currentTime);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

function runClapVoice() {
  initAudio();
  const size = audioCtx.sampleRate * 0.2;
  const buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) { d[i] = Math.random() * 2 - 1; }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const band = audioCtx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.setValueAtTime(1100, audioCtx.currentTime);
  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  source.connect(band);
  band.connect(gain);
  gain.connect(audioCtx.destination);
  source.start();
}

let beatInterval = null;
let currentBeatStep = 0;
let isPlayingBeat = false;

function stepSequencerLoop() {
  const kick =  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
  const snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];
  const hat =   [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0];

  if (kick[currentBeatStep]) runKickVoice();
  if (snare[currentBeatStep]) runSnareVoice();
  if (hat[currentBeatStep]) runHatVoice();

  currentBeatStep = (currentBeatStep + 1) % 16;
}

function startSequencer() {
  initAudio();
  isPlayingBeat = true;
  if (playBeatBtn) {
    playBeatBtn.classList.add('active');
    playBeatBtn.innerText = 'Stop Beat';
  }
  const bpm = parseInt(tempoSlider.value);
  const stepDuration = (60 / bpm) / 4 * 1000;
  beatInterval = setInterval(stepSequencerLoop, stepDuration);
}

function stopSequencer() {
  isPlayingBeat = false;
  if (playBeatBtn) {
    playBeatBtn.classList.remove('active');
    playBeatBtn.innerText = 'Play Beat Loop';
  }
  clearInterval(beatInterval);
}

// ==========================================
// HARDWARE TRIGGERS
// ==========================================

window.addEventListener('keydown', (e) => {
  if (e.code === 'Digit1') { runKickVoice(); animatePad('kick'); }
  if (e.code === 'Digit2' && keyMap[e.code] === undefined) { runSnareVoice(); animatePad('snare'); }
  if (e.code === 'Digit3' && keyMap[e.code] === undefined) { runHatVoice(); animatePad('hat'); }
  if (e.code === 'Digit4') { runClapVoice(); animatePad('clap'); }

  if (e.repeat) return;
  if (keyMap[e.code] !== undefined) {
    playNote(e.code);
  }
});

window.addEventListener('keyup', (e) => {
  if (keyMap[e.code] !== undefined) {
    releaseNote(e.code);
  }
});

function animatePad(name) {
  const pad = document.querySelector(`.pad[data-pad="${name}"]`);
  if (pad) {
    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), 80);
  }
}

document.querySelectorAll('.pad').forEach(pad => {
  pad.addEventListener('click', () => {
    const type = pad.getAttribute('data-pad');
    if (type === 'kick') runKickVoice();
    if (type === 'snare') runSnareVoice();
    if (type === 'hat') runHatVoice();
    if (type === 'clap') runClapVoice();
  });
});

document.querySelectorAll('.key').forEach(keyElem => {
  keyElem.addEventListener('mousedown', () => {
    const code = keyElem.getAttribute('data-key');
    playNote(code);
  });
  keyElem.addEventListener('mouseup', () => {
    const code = keyElem.getAttribute('data-key');
    releaseNote(code);
  });
  keyElem.addEventListener('mouseleave', () => {
    const code = keyElem.getAttribute('data-key');
    releaseNote(code);
  });
});