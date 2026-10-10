let audioCtx = null;
const activeNotes = {};

// FL Studio QWERTY Layout Mapping
// MIDI interval numbers relative to Root (0)
const keyMap = {
  // Lower Octave / Row (Z X C V B N M ,)
  'z': 0,  // C
  's': 1,  // C#
  'x': 2,  // D
  'd': 3,  // D#
  'c': 4,  // E
  'v': 5,  // F
  'g': 6,  // F#
  'b': 7,  // G
  'h': 8,  // G#
  'n': 9,  // A
  'j': 10, // A#
  'm': 11, // B
  ',': 12, // C (Octave Transition)

  // Upper Octave / Row (Q W E R T Y U I O P)
  'q': 12, // C
  '2': 13, // C#
  'w': 14, // D
  '3': 15, // D#
  'e': 16, // E
  'r': 17, // F
  '5': 18, // F#
  't': 19, // G
  '6': 20, // G#
  'y': 21, // A
  '7': 22, // A#
  'u': 23, // B
  'i': 24, // C
  '9': 25, // C#
  'o': 26, // D
  '0': 27, // D#
  'p': 28  // E
};

// UI Control elements
const waveformSelect = document.getElementById('waveform');
const octaveSelect = document.getElementById('octave');
const volumeSlider = document.getElementById('volume');

// Initialize Web Audio Context on first interaction
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Convert MIDI note number to Frequency
function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// Start playing a note
function playNote(keyChar) {
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const baseMidiOctave = parseInt(octaveSelect.value) * 12 + 12; // C0 is 12, C4 is 60
  const noteOffset = keyMap[keyChar];
  if (noteOffset === undefined) return;

  const midiNote = baseMidiOctave + noteOffset;
  const frequency = midiToFreq(midiNote);

  // If already playing, don't trigger again (prevent repeating keys browser issue)
  if (activeNotes[keyChar]) return;

  // Web Audio Chain
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.type = waveformSelect.value;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);

  // Envelope settings
  const attack = 0.01; 
  const currentVolume = parseFloat(volumeSlider.value);
  
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  gainNode.gain.linearRampToValueAtTime(currentVolume, audioCtx.currentTime + attack);

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start();

  // Save reference
  activeNotes[keyChar] = {
    oscillator: osc,
    gainNode: gainNode
  };

  // Update UI key style
  const keyElements = document.querySelectorAll(`.key[data-key="${keyChar.toUpperCase()}"]`);
  keyElements.forEach(elem => elem.classList.add('active'));
}

// Stop playing a note
function stopNote(keyChar) {
  const note = activeNotes[keyChar];
  if (note) {
    const release = 0.15; // smooth release tail
    const currentGain = note.gainNode.gain.value;

    note.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
    note.gainNode.gain.setValueAtTime(currentGain, audioCtx.currentTime);
    note.gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + release);

    const oscToStop = note.oscillator;
    setTimeout(() => {
      try {
        oscToStop.stop();
        oscToStop.disconnect();
      } catch (e) {}
    }, release * 1000);

    delete activeNotes[keyChar];
  }

  // Update UI key style
  const keyElements = document.querySelectorAll(`.key[data-key="${keyChar.toUpperCase()}"]`);
  keyElements.forEach(elem => elem.classList.remove('active'));
}

// Event Listeners for Physical Keyboard
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  if (keyMap[key] !== undefined) {
    playNote(key);
  }
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (keyMap[key] !== undefined) {
    stopNote(key);
  }
});

// Event Listeners for On-Screen Clicking
document.querySelectorAll('.key').forEach(keyElem => {
  keyElem.addEventListener('mousedown', () => {
    const key = keyElem.getAttribute('data-key').toLowerCase();
    playNote(key);
  });
  keyElem.addEventListener('mouseup', () => {
    const key = keyElem.getAttribute('data-key').toLowerCase();
    stopNote(key);
  });
  keyElem.addEventListener('mouseleave', () => {
    const key = keyElem.getAttribute('data-key').toLowerCase();
    stopNote(key);
  });
});