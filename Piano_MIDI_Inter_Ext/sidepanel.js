let audioCtx = null;

// Global FX Nodes
let masterVolumeNode = null;
let delayNode = null;
let delayGain = null;
let reverbNode = null;
let reverbGain = null;
let filterNode = null;

const activeNotes = {};
let isSustainEnabled = false;
const sustainedNotes = {};

// Hard-mapped layout codes (removes physical keyboard language mismatch)
const keyMap = {
  // Lower row (Z to M, plus comma)
  'KeyZ': 0,  // C4
  'KeyS': 1,  // C#4
  'KeyX': 2,  // D4
  'KeyD': 3,  // D#4
  'KeyC': 4,  // E4
  'KeyV': 5,  // F4
  'KeyG': 6,  // F#4
  'KeyB': 7,  // G4
  'KeyH': 8,  // G#4
  'KeyN': 9,  // A4
  'KeyJ': 10, // A#4
  'KeyM': 11, // B4
  'Comma': 12, // C5

  // Upper row (Q to P)
  'KeyQ': 12, // C5
  'Digit2': 13, // C#5
  'KeyW': 14, // D5
  'Digit3': 15, // D#5
  'KeyE': 16, // E5
  'KeyR': 17, // F5
  'Digit5': 18, // F#5
  'KeyT': 19, // G5
  'Digit6': 20, // G#5
  'KeyY': 21, // A5
  'Digit7': 22, // A#5
  'KeyU': 23, // B5
  'KeyI': 24, // C6
  'Digit9': 25, // C#6
  'KeyO': 26, // D6
  'Digit0': 27, // D#6
  'KeyP': 28  // E6
};

// UI Elements
const instrumentSelect = document.getElementById('instrument');
const octaveSelect = document.getElementById('octave');
const volumeSlider = document.getElementById('volume');
const filterCutoffSlider = document.getElementById('filter-cutoff');
const filterQSlider = document.getElementById('filter-q');
const delayMixSlider = document.getElementById('delay-mix');
const reverbMixSlider = document.getElementById('reverb-mix');
const sustainCheckbox = document.getElementById('sustain');

const header = document.getElementById('focus-header');
const statusText = document.getElementById('focus-status');

// Handle panel Focus visual feedback
window.addEventListener('focus', () => {
  header.classList.remove('blur');
  header.classList.add('focus');
  statusText.innerText = '● Connected & Listening to keyboard';
});

window.addEventListener('blur', () => {
  header.classList.remove('focus');
  header.classList.add('blur');
  statusText.innerText = '⚠️ Click here to enable keyboard play';
});

// Audio routing initialization
function initAudio() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // Create FX Nodes
  masterVolumeNode = audioCtx.createGain();
  masterVolumeNode.gain.setValueAtTime(parseFloat(volumeSlider.value), audioCtx.currentTime);

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.setValueAtTime(parseFloat(filterCutoffSlider.value), audioCtx.currentTime);
  filterNode.Q.setValueAtTime(parseFloat(filterQSlider.value), audioCtx.currentTime);

  // Echo / Delay Chain
  delayNode = audioCtx.createDelay(1.0);
  delayGain = audioCtx.createGain();
  delayNode.delayTime.setValueAtTime(0.35, audioCtx.currentTime);
  delayGain.gain.setValueAtTime(parseFloat(delayMixSlider.value), audioCtx.currentTime);

  // Reverb Chain (safely using active audioCtx node)
  reverbNode = audioCtx.createConvolver();
  reverbNode.buffer = createReverbImpulseResponse(audioCtx, 2.5, 2.0);
  reverbGain = audioCtx.createGain();
  reverbGain.gain.setValueAtTime(parseFloat(reverbMixSlider.value), audioCtx.currentTime);

  filterNode.connect(masterVolumeNode);
  
  // Connect Delay Send
  filterNode.connect(delayNode);
  delayNode.connect(delayGain);
  delayGain.connect(masterVolumeNode);
  delayGain.connect(delayNode); 

  // Connect Reverb Send
  filterNode.connect(reverbNode);
  reverbNode.connect(reverbGain);
  reverbGain.connect(masterVolumeNode);

  masterVolumeNode.connect(audioCtx.destination);
}

// Generate an algorithmic synthetic room reverb decay impulse safely on the master context
function createReverbImpulseResponse(context, duration, decay) {
  const sampleRate = context.sampleRate;
  const length = sampleRate * duration;
  const impulse = context.createBuffer(2, length, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const percent = i / length;
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    }
  }
  return impulse;
}

function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// Sound Models
function createSynthVoice(freq, instrument) {
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const voiceGain = audioCtx.createGain();
  
  voiceGain.gain.setValueAtTime(0, audioCtx.currentTime);

  switch (instrument) {
    case 'acoustic':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, audioCtx.currentTime);
      
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, audioCtx.currentTime);
      
      const hammerGain = audioCtx.createGain();
      hammerGain.gain.setValueAtTime(0.5, audioCtx.currentTime);
      hammerGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      
      osc2.connect(hammerGain);
      hammerGain.connect(voiceGain);

      osc1.connect(voiceGain);
      osc1.start();
      osc2.start();
      break;

    case 'rhodes':
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, audioCtx.currentTime);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 4, audioCtx.currentTime);

      const tineGain = audioCtx.createGain();
      tineGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      tineGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);

      osc2.connect(tineGain);
      tineGain.connect(voiceGain);

      osc1.connect(voiceGain);
      osc1.start();
      osc2.start();
      break;

    case 'analog':
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq - 2, audioCtx.currentTime);

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(freq + 2, audioCtx.currentTime);

      osc1.connect(voiceGain);
      osc2.connect(voiceGain);
      osc1.start();
      osc2.start();
      break;

    case 'fm':
      const carrier = audioCtx.createOscillator();
      const modulator = audioCtx.createOscillator();
      const modGain = audioCtx.createGain();

      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(freq, audioCtx.currentTime);

      modulator.type = 'sine';
      modulator.frequency.setValueAtTime(freq * 3.5, audioCtx.currentTime);
      modGain.gain.setValueAtTime(freq * 2, audioCtx.currentTime);

      modulator.connect(modGain);
      modGain.connect(carrier.frequency);
      
      carrier.connect(voiceGain);
      
      modulator.start();
      carrier.start();

      voiceGain.extraOscNode = modulator;
      voiceGain.primaryOscNode = carrier;
      break;
  }

  return { osc1, osc2, voiceGain };
}

// Play synth note
function playNote(keyCode) {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  const baseMidiOctave = parseInt(octaveSelect.value) * 12 + 24; 
  const noteOffset = keyMap[keyCode];
  if (noteOffset === undefined) return;

  const midiNote = baseMidiOctave + noteOffset;
  const frequency = midiToFreq(midiNote);

  if (activeNotes[keyCode]) return;

  if (sustainedNotes[keyCode]) {
    stopSustainedVoice(keyCode);
  }

  const instrument = instrumentSelect.value;
  const { osc1, osc2, voiceGain } = createSynthVoice(frequency, instrument);

  voiceGain.connect(filterNode);

  const now = audioCtx.currentTime;
  let attack = 0.01;
  let peak = 0.6;

  if (instrument === 'analog') {
    attack = 0.15;
    peak = 0.45;
  }

  voiceGain.gain.setValueAtTime(0, now);
  voiceGain.gain.linearRampToValueAtTime(peak, now + attack);

  activeNotes[keyCode] = { osc1, osc2, voiceGain, instrument };

  // UI lighting updates
  const keyElements = document.querySelectorAll(`.key[data-key="${keyCode}"]`);
  keyElements.forEach(elem => elem.classList.add('active'));
}

// Release synth note
function releaseNote(keyCode) {
  if (isSustainEnabled) {
    if (activeNotes[keyCode]) {
      sustainedNotes[keyCode] = activeNotes[keyCode];
      delete activeNotes[keyCode];
    }
  } else {
    const voice = activeNotes[keyCode];
    if (voice) {
      stopVoice(voice);
      delete activeNotes[keyCode];
    }
  }

  if (!sustainedNotes[keyCode]) {
    const keyElements = document.querySelectorAll(`.key[data-key="${keyCode}"]`);
    keyElements.forEach(elem => elem.classList.remove('active'));
  }
}

function stopVoice(voice) {
  const now = audioCtx.currentTime;
  let release = 0.25;

  if (voice.instrument === 'analog') release = 0.8;
  if (voice.instrument === 'fm') release = 0.5;

  const currentVal = voice.voiceGain.gain.value;
  voice.voiceGain.gain.cancelScheduledValues(now);
  voice.voiceGain.gain.setValueAtTime(currentVal, now);
  voice.voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + release);

  setTimeout(() => {
    try {
      voice.osc1.stop();
      voice.osc1.disconnect();
      if (voice.osc2) {
        voice.osc2.stop();
        voice.osc2.disconnect();
      }
      if (voice.voiceGain.extraOscNode) {
        voice.voiceGain.extraOscNode.stop();
        voice.voiceGain.extraOscNode.disconnect();
        voice.voiceGain.primaryOscNode.stop();
        voice.voiceGain.primaryOscNode.disconnect();
      }
      voice.voiceGain.disconnect();
    } catch (e) {}
  }, release * 1000);
}

function stopSustainedVoice(keyCode) {
  const voice = sustainedNotes[keyCode];
  if (voice) {
    stopVoice(voice);
    delete sustainedNotes[keyCode];
  }
  const keyElements = document.querySelectorAll(`.key[data-key="${keyCode}"]`);
  keyElements.forEach(elem => elem.classList.remove('active'));
}

function releaseSustainedNotes() {
  Object.keys(sustainedNotes).forEach(keyCode => {
    stopSustainedVoice(keyCode);
  });
}

sustainCheckbox.addEventListener('change', (e) => {
  isSustainEnabled = e.target.checked;
  if (!isSustainEnabled) {
    releaseSustainedNotes();
  }
});


// ==========================================
// DRUMS ENGINE
// ==========================================

function triggerKick() {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.12);

  gain.gain.setValueAtTime(0.8, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.start(now);
  osc.stop(now + 0.13);
}

function triggerSnare() {
  initAudio();
  const bufferSize = audioCtx.sampleRate * 0.18;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1200, audioCtx.currentTime);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.16);

  noiseNode.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  noiseNode.start();
}

function triggerHiHat() {
  initAudio();
  const bufferSize = audioCtx.sampleRate * 0.05;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(8000, audioCtx.currentTime);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  noise.start();
}

function triggerClap() {
  initAudio();
  const bufferSize = audioCtx.sampleRate * 0.25;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1000, audioCtx.currentTime);

  const gain = audioCtx.createGain();
  const now = audioCtx.currentTime;
  
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.04);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.045);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  noise.start();
}

// Sequencer
let sequencerInterval = null;
let isPlayingBeat = false;
let currentStep = 0;
const tempoSlider = document.getElementById('tempo');
const tempoVal = document.getElementById('tempo-val');

function runSequencerStep() {
  const kickPattern =  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
  const hatPattern =   [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0];
  const snarePattern = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];

  if (kickPattern[currentStep]) triggerKick();
  if (hatPattern[currentStep]) triggerHiHat();
  if (snarePattern[currentStep]) triggerSnare();

  currentStep = (currentStep + 1) % 16;
}

function startBeat() {
  initAudio();
  isPlayingBeat = true;
  document.getElementById('toggle-beat').classList.add('active');
  document.getElementById('toggle-beat').innerText = 'Stop Auto Loop';
  
  const bpm = parseInt(tempoSlider.value);
  const stepDurationMs = (60 / bpm) / 4 * 1000;

  sequencerInterval = setInterval(runSequencerStep, stepDurationMs);
}

function stopBeat() {
  isPlayingBeat = false;
  document.getElementById('toggle-beat').classList.remove('active');
  document.getElementById('toggle-beat').innerText = 'Play Auto Loop';
  clearInterval(sequencerInterval);
}

tempoSlider.addEventListener('input', () => {
  tempoVal.innerText = `${tempoSlider.value} BPM`;
  if (isPlayingBeat) {
    stopBeat();
    startBeat();
  }
});

document.getElementById('toggle-beat').addEventListener('click', () => {
  if (isPlayingBeat) {
    stopBeat();
  } else {
    startBeat();
  }
});


// ==========================================
// SYSTEM PARAMETERS & TRIGGERS
// ==========================================

volumeSlider.addEventListener('input', () => {
  if (masterVolumeNode) {
    masterVolumeNode.gain.setValueAtTime(parseFloat(volumeSlider.value), audioCtx.currentTime);
  }
});

filterCutoffSlider.addEventListener('input', () => {
  const hz = filterCutoffSlider.value;
  document.getElementById('cutoff-val').innerText = `${hz}Hz`;
  if (filterNode) {
    filterNode.frequency.setValueAtTime(hz, audioCtx.currentTime);
  }
});

filterQSlider.addEventListener('input', () => {
  const q = filterQSlider.value;
  document.getElementById('resonance-val').innerText = q;
  if (filterNode) {
    filterNode.Q.setValueAtTime(q, audioCtx.currentTime);
  }
});

delayMixSlider.addEventListener('input', () => {
  const percent = Math.round(delayMixSlider.value * 100);
  document.getElementById('delay-val').innerText = `${percent}%`;
  if (delayGain) {
    delayGain.gain.setValueAtTime(parseFloat(delayMixSlider.value), audioCtx.currentTime);
  }
});

reverbMixSlider.addEventListener('input', () => {
  const percent = Math.round(reverbMixSlider.value * 100);
  document.getElementById('reverb-val').innerText = `${percent}%`;
  if (reverbGain) {
    reverbGain.gain.setValueAtTime(parseFloat(reverbMixSlider.value), audioCtx.currentTime);
  }
});


// ==========================================
// EVENT LISTENERS
// ==========================================

// Global Event Listeners looking for physical key locations (e.code)
window.addEventListener('keydown', (e) => {
  const code = e.code;

  // Drum Quick Keys
  if (code === 'Digit1') { triggerKick(); animateDrumPad('kick'); }
  if (code === 'Digit2' && keyMap[code] === undefined) { triggerSnare(); animateDrumPad('snare'); } // bypass if mapped to synth note
  if (code === 'Digit3' && keyMap[code] === undefined) { triggerHiHat(); animateDrumPad('hat'); } 
  if (code === 'Digit4') { triggerClap(); animateDrumPad('clap'); }

  // Synthesizer Note Trigger
  if (e.repeat) return;
  if (keyMap[code] !== undefined) {
    playNote(code);
  }
});

window.addEventListener('keyup', (e) => {
  const code = e.code;
  if (keyMap[code] !== undefined) {
    releaseNote(code);
  }
});

function animateDrumPad(type) {
  const btn = document.querySelector(`.drum-pad[data-drum="${type}"]`);
  if (btn) {
    btn.classList.add('active');
    setTimeout(() => btn.classList.remove('active'), 80);
  }
}

document.querySelectorAll('.drum-pad').forEach(pad => {
  pad.addEventListener('click', () => {
    const drum = pad.getAttribute('data-drum');
    if (drum === 'kick') triggerKick();
    if (drum === 'snare') triggerSnare();
    if (drum === 'hat') triggerHiHat();
    if (drum === 'clap') triggerClap();
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