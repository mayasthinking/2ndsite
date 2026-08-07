"use strict";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const WHITE_NOTES = new Set(["C", "D", "E", "F", "G", "A", "B"]);
const KEYBOARD_MAP = {
    a: 0,
    w: 1,
    s: 2,
    e: 3,
    d: 4,
    f: 5,
    t: 6,
    g: 7,
    y: 8,
    h: 9,
    u: 10,
    j: 11,
    k: 12,
    o: 13,
    l: 14,
    p: 15,
    ";": 16,
    "'": 17
};

const CHORDS = {
    nebula: { root: 0, intervals: [0, 3, 7, 10, 14] },
    nocturne: { root: 2, intervals: [0, 3, 7, 10, 14] },
    horizon: { root: 5, intervals: [0, 4, 7, 11, 14] },
    ember: { root: 7, intervals: [0, 3, 7, 10, 14] },
    calm: { root: 9, intervals: [0, 4, 7, 11, 14] },
    rift: { root: 11, intervals: [0, 3, 7, 10, 13] },
    swell: { root: 4, intervals: [0, 4, 7, 11, 14] },
    bloom: { root: 8, intervals: [0, 3, 7, 10, 14] }
};

const PRESETS = {
    init: {
        osc1Type: "triangle",
        osc2Type: "sawtooth",
        oscMix: 0.45,
        detune: 6,
        subEnabled: false,
        subLevel: 0.3,
        filterCutoff: 4200,
        filterResonance: 6,
        envAttack: 0.08,
        envDecay: 0.3,
        envSustain: 0.7,
        envRelease: 0.6,
        lfoTarget: "filter",
        lfoRate: 3.2,
        lfoDepth: 0.35,
        delayTime: 0.22,
        delayFeedback: 0.35,
        delayMix: 0.25,
        reverbMix: 0.25,
        arpEnabled: false,
        arpRate: 5,
        arpMode: "up",
        masterVolume: 0.7,
        glideTime: 0.04
    },
    glassy: {
        osc1Type: "sine",
        osc2Type: "triangle",
        oscMix: 0.35,
        detune: 3,
        subEnabled: false,
        subLevel: 0.2,
        filterCutoff: 8200,
        filterResonance: 4,
        envAttack: 0.02,
        envDecay: 0.25,
        envSustain: 0.5,
        envRelease: 0.7,
        lfoTarget: "pitch",
        lfoRate: 5.5,
        lfoDepth: 0.25,
        delayTime: 0.3,
        delayFeedback: 0.4,
        delayMix: 0.35,
        reverbMix: 0.5,
        arpEnabled: false,
        arpRate: 5,
        arpMode: "up",
        masterVolume: 0.65,
        glideTime: 0.03
    },
    "warm-pad": {
        osc1Type: "sawtooth",
        osc2Type: "triangle",
        oscMix: 0.5,
        detune: 8,
        subEnabled: true,
        subLevel: 0.35,
        filterCutoff: 2500,
        filterResonance: 6,
        envAttack: 0.7,
        envDecay: 0.8,
        envSustain: 0.75,
        envRelease: 1.6,
        lfoTarget: "filter",
        lfoRate: 0.8,
        lfoDepth: 0.35,
        delayTime: 0.35,
        delayFeedback: 0.5,
        delayMix: 0.25,
        reverbMix: 0.6,
        arpEnabled: false,
        arpRate: 4,
        arpMode: "up",
        masterVolume: 0.7,
        glideTime: 0.12
    },
    "bass-pulse": {
        osc1Type: "square",
        osc2Type: "sawtooth",
        oscMix: 0.35,
        detune: 4,
        subEnabled: true,
        subLevel: 0.5,
        filterCutoff: 900,
        filterResonance: 8,
        envAttack: 0.01,
        envDecay: 0.2,
        envSustain: 0.4,
        envRelease: 0.4,
        lfoTarget: "filter",
        lfoRate: 2.2,
        lfoDepth: 0.2,
        delayTime: 0.18,
        delayFeedback: 0.25,
        delayMix: 0.12,
        reverbMix: 0.08,
        arpEnabled: false,
        arpRate: 5,
        arpMode: "up",
        masterVolume: 0.75,
        glideTime: 0.08
    },
    pluck: {
        osc1Type: "sawtooth",
        osc2Type: "square",
        oscMix: 0.4,
        detune: 5,
        subEnabled: false,
        subLevel: 0.3,
        filterCutoff: 5200,
        filterResonance: 5,
        envAttack: 0.01,
        envDecay: 0.18,
        envSustain: 0.15,
        envRelease: 0.25,
        lfoTarget: "pitch",
        lfoRate: 6.2,
        lfoDepth: 0.12,
        delayTime: 0.16,
        delayFeedback: 0.3,
        delayMix: 0.2,
        reverbMix: 0.2,
        arpEnabled: true,
        arpRate: 7,
        arpMode: "updown",
        masterVolume: 0.68,
        glideTime: 0.02
    }
};

const state = {
    audioContext: null,
    masterGain: null,
    analyser: null,
    delay: null,
    delayFeedback: null,
    delayFilter: null,
    delaySend: null,
    reverb: null,
    reverbGain: null,
    reverbSend: null,
    lfoOsc: null,
    isPowered: false,
    activeVoices: new Map(),
    heldNotes: new Set(),
    keyDown: new Set(),
    keyboardOctave: 4,
    lastFrequency: null,
    arpTimer: null,
    arpIndex: 0,
    arpDirection: 1,
    pointerNotes: new Map(),
    padNotes: new Map(),
    xyActive: false,
    visualizer: {
        canvas: null,
        ctx: null,
        width: 0,
        height: 0
    }
};

const settings = { ...PRESETS.init };

const ui = {};

const MAX_POLYPHONY = 12;
const FILTER_MIN = 80;
const FILTER_MAX = 12000;

document.addEventListener("DOMContentLoaded", () => {
    mapUiElements();
    bindControls();
    buildKeyboard();
    updateAllDisplays();
    updateToggleState("subEnabled");
    updateToggleState("arpEnabled");
    updateOctaveLabel();
    updateArpStatus();
    updateVoiceCount();
    updateXYPadFromSettings();
    setupVisualizer();
});

function mapUiElements() {
    ui.powerButton = document.getElementById("power-button");
    ui.panicButton = document.getElementById("panic-button");
    ui.statusDot = document.getElementById("status-dot");
    ui.statusText = document.getElementById("status-text");
    ui.presetSelect = document.getElementById("preset-select");
    ui.voiceCount = document.getElementById("voice-count");
    ui.arpStatus = document.getElementById("arp-status");
    ui.keyboard = document.getElementById("keyboard");
    ui.octaveLabel = document.getElementById("octave-label");
    ui.octaveDown = document.getElementById("octave-down");
    ui.octaveUp = document.getElementById("octave-up");
    ui.xyPad = document.getElementById("xy-pad");
    ui.xyHandle = document.getElementById("xy-handle");
    ui.xyXValue = document.getElementById("xy-x-value");
    ui.xyYValue = document.getElementById("xy-y-value");
    ui.canvas = document.getElementById("visualizer");
}

function bindControls() {
    ui.powerButton.addEventListener("click", togglePower);
    ui.panicButton.addEventListener("click", panic);
    ui.octaveDown.addEventListener("click", () => shiftOctave(-1));
    ui.octaveUp.addEventListener("click", () => shiftOctave(1));

    document.querySelectorAll("[data-setting]").forEach((control) => {
        const setting = control.dataset.setting;
        if (control.classList.contains("toggle")) {
            control.addEventListener("click", () => toggleSetting(setting));
            return;
        }
        const isSelect = control.tagName === "SELECT";
        const eventName = isSelect ? "change" : "input";
        control.addEventListener(eventName, () => {
            if (setting === "preset") {
                applyPreset(control.value);
                return;
            }
            const value = isSelect ? control.value : parseFloat(control.value);
            applySetting(setting, value, { source: control });
        });
    });

    document.querySelectorAll(".pad").forEach((pad) => {
        pad.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            pad.setPointerCapture(event.pointerId);
            pad.classList.add("is-active");
            triggerChordPad(pad);
        });
        pad.addEventListener("pointerup", (event) => {
            event.preventDefault();
            pad.releasePointerCapture(event.pointerId);
            pad.classList.remove("is-active");
            releaseChordPad(pad);
        });
        pad.addEventListener("pointercancel", () => {
            pad.classList.remove("is-active");
            releaseChordPad(pad);
        });
    });

    window.addEventListener("resize", () => {
        buildKeyboard();
        resizeVisualizer();
        updateXYPadFromSettings();
    });

    setupKeyboardListeners();
    setupXYPad();
}

function setupKeyboardListeners() {
    document.addEventListener("keydown", (event) => {
        const key = event.key.toLowerCase();
        if (event.repeat || state.keyDown.has(key)) return;
        if (isTypingInControl(event.target)) return;
        if (!(key in KEYBOARD_MAP)) return;
        state.keyDown.add(key);
        const midi = keyboardBaseMidi() + KEYBOARD_MAP[key];
        handleNoteOn(midi);
    });

    document.addEventListener("keyup", (event) => {
        const key = event.key.toLowerCase();
        if (!(key in KEYBOARD_MAP)) return;
        state.keyDown.delete(key);
        const midi = keyboardBaseMidi() + KEYBOARD_MAP[key];
        handleNoteOff(midi);
    });
}

function setupXYPad() {
    if (!ui.xyPad) return;
    ui.xyPad.addEventListener("pointerdown", (event) => {
        ui.xyPad.setPointerCapture(event.pointerId);
        state.xyActive = true;
        updateXYFromEvent(event);
    });
    ui.xyPad.addEventListener("pointermove", (event) => {
        if (!state.xyActive) return;
        updateXYFromEvent(event);
    });
    ui.xyPad.addEventListener("pointerup", () => {
        state.xyActive = false;
    });
    ui.xyPad.addEventListener("pointercancel", () => {
        state.xyActive = false;
    });
}

function updateXYFromEvent(event) {
    const rect = ui.xyPad.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const brightness = cutoffFromNormalized(x);
    const space = clamp(1 - y, 0, 1) * 0.8;
    applySetting("filterCutoff", brightness, { skipXY: true });
    applySetting("reverbMix", space, { skipXY: true });
    updateXYPadFromSettings();
}

function updateXYPadFromSettings() {
    if (!ui.xyPad) return;
    const normalized = normalizedFromCutoff(settings.filterCutoff);
    const x = clamp(normalized, 0, 1);
    const y = clamp(1 - settings.reverbMix / 0.8, 0, 1);
    const rect = ui.xyPad.getBoundingClientRect();
    const left = rect.width * x;
    const top = rect.height * y;
    ui.xyHandle.style.left = `${left}px`;
    ui.xyHandle.style.top = `${top}px`;
    ui.xyXValue.textContent = normalized.toFixed(2);
    ui.xyYValue.textContent = (settings.reverbMix / 0.8).toFixed(2);
}

function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    Object.entries(preset).forEach(([key, value]) => {
        applySetting(key, value, { skipPreset: true });
    });
    ui.presetSelect.value = name;
    updateToggleState("subEnabled");
    updateToggleState("arpEnabled");
    updateXYPadFromSettings();
    updateArpStatus();
}

function applySetting(setting, value, options = {}) {
    if (Number.isNaN(value)) return;
    settings[setting] = value;

    if (!options.source) {
        syncControlValue(setting, value);
    } else {
        updateControlDisplay(options.source, setting, value);
    }

    if (!options.skipXY && (setting === "filterCutoff" || setting === "reverbMix")) {
        updateXYPadFromSettings();
    }

    applySettingToEngine(setting);
}

function applySettingToEngine(setting) {
    if (!state.audioContext) return;
    const now = state.audioContext.currentTime;

    switch (setting) {
        case "masterVolume":
            state.masterGain.gain.setTargetAtTime(settings.masterVolume, now, 0.01);
            break;
        case "delayTime":
            state.delay.delayTime.setTargetAtTime(settings.delayTime, now, 0.02);
            break;
        case "delayFeedback":
            state.delayFeedback.gain.setTargetAtTime(settings.delayFeedback, now, 0.02);
            break;
        case "delayMix":
            state.delaySend.gain.setTargetAtTime(settings.delayMix, now, 0.02);
            break;
        case "reverbMix":
            state.reverbGain.gain.setTargetAtTime(settings.reverbMix, now, 0.02);
            break;
        case "lfoRate":
            state.lfoOsc.frequency.setTargetAtTime(settings.lfoRate, now, 0.02);
            break;
        case "arpEnabled":
            state.arpIndex = 0;
            state.arpDirection = 1;
            updateArpStatus();
            if (!settings.arpEnabled) stopArp();
            break;
        case "arpRate":
        case "arpMode":
            restartArp();
            break;
        default:
            break;
    }

    updateActiveVoices();
}

function updateActiveVoices() {
    if (!state.audioContext) return;
    const now = state.audioContext.currentTime;
    state.activeVoices.forEach((voice) => {
        voice.osc1.type = settings.osc1Type;
        voice.osc2.type = settings.osc2Type;
        voice.osc2.detune.setTargetAtTime(settings.detune, now, 0.01);
        voice.osc1Gain.gain.setTargetAtTime(1 - settings.oscMix, now, 0.01);
        voice.osc2Gain.gain.setTargetAtTime(settings.oscMix, now, 0.01);
        voice.subGain.gain.setTargetAtTime(settings.subEnabled ? settings.subLevel : 0, now, 0.01);
        voice.filter.frequency.setTargetAtTime(settings.filterCutoff, now, 0.02);
        voice.filter.Q.setTargetAtTime(settings.filterResonance, now, 0.02);
        updateVoiceLfo(voice);
    });
}

function toggleSetting(setting) {
    settings[setting] = !settings[setting];
    if (setting === "arpEnabled" && !settings[setting]) {
        state.heldNotes.clear();
        state.arpIndex = 0;
        state.arpDirection = 1;
        stopArp();
    }
    updateToggleState(setting);
    applySettingToEngine(setting);
}

function updateToggleState(setting) {
    const button = document.querySelector(`[data-setting="${setting}"].toggle`);
    if (!button) return;
    const isActive = Boolean(settings[setting]);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
}

function syncControlValue(setting, value) {
    document.querySelectorAll(`[data-setting="${setting}"]`).forEach((control) => {
        if (control.classList.contains("toggle")) return;
        control.value = value;
        updateControlDisplay(control, setting, value);
    });
    updateToggleState(setting);
}

function updateControlDisplay(control, setting, value) {
    const displayId = control.dataset.display;
    if (!displayId) return;
    const display = document.getElementById(displayId);
    if (!display) return;
    display.textContent = formatValue(setting, value);
}

function updateAllDisplays() {
    document.querySelectorAll("[data-setting]").forEach((control) => {
        const setting = control.dataset.setting;
        if (control.classList.contains("toggle")) return;
        const value = Number(control.value);
        updateControlDisplay(control, setting, value);
    });
}

function formatValue(setting, value) {
    switch (setting) {
        case "oscMix":
        case "subLevel":
        case "lfoDepth":
        case "delayFeedback":
        case "delayMix":
        case "reverbMix":
        case "masterVolume":
        case "envSustain":
            return `${Math.round(value * 100)}%`;
        case "detune":
            return `${value.toFixed(1)} ct`;
        case "filterCutoff":
            return `${Math.round(value)} Hz`;
        case "filterResonance":
            return value.toFixed(1);
        case "envAttack":
        case "envDecay":
        case "envRelease":
        case "glideTime":
            return `${value.toFixed(2)} s`;
        case "lfoRate":
        case "arpRate":
            return `${value.toFixed(1)} Hz`;
        case "delayTime":
            return `${Math.round(value * 1000)} ms`;
        default:
            return value;
    }
}

function togglePower() {
    if (!state.audioContext) {
        createAudioContext();
        if (state.audioContext) {
            state.audioContext.resume().catch(() => {});
            state.isPowered = true;
            updatePowerStatus();
        }
        return;
    }

    if (state.isPowered) {
        state.audioContext.suspend();
        state.isPowered = false;
        panic();
    } else {
        state.audioContext.resume();
        state.isPowered = true;
    }
    updatePowerStatus();
}

function updatePowerStatus() {
    ui.statusDot.classList.toggle("is-on", state.isPowered);
    ui.statusText.textContent = state.isPowered ? "Audio on" : "Audio off";
}

function createAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const masterGain = context.createGain();
    const analyser = context.createAnalyser();
    const delay = context.createDelay(1.2);
    const delayFeedback = context.createGain();
    const delayFilter = context.createBiquadFilter();
    const delaySend = context.createGain();
    const reverb = context.createConvolver();
    const reverbGain = context.createGain();
    const reverbSend = context.createGain();
    const lfoOsc = context.createOscillator();

    masterGain.gain.value = settings.masterVolume;
    analyser.fftSize = 2048;
    masterGain.connect(analyser);
    analyser.connect(context.destination);

    delay.delayTime.value = settings.delayTime;
    delayFeedback.gain.value = settings.delayFeedback;
    delayFilter.type = "lowpass";
    delayFilter.frequency.value = 2400;
    delaySend.gain.value = settings.delayMix;

    delaySend.connect(delay);
    delay.connect(delayFeedback);
    delayFeedback.connect(delayFilter);
    delayFilter.connect(delay);
    delay.connect(masterGain);

    reverb.buffer = createImpulseResponse(context, 2.4, 2.2);
    reverbGain.gain.value = settings.reverbMix;
    reverbSend.gain.value = 1;
    reverbSend.connect(reverb);
    reverb.connect(reverbGain);
    reverbGain.connect(masterGain);

    lfoOsc.type = "sine";
    lfoOsc.frequency.value = settings.lfoRate;
    lfoOsc.start();

    state.audioContext = context;
    state.masterGain = masterGain;
    state.analyser = analyser;
    state.delay = delay;
    state.delayFeedback = delayFeedback;
    state.delayFilter = delayFilter;
    state.delaySend = delaySend;
    state.reverb = reverb;
    state.reverbGain = reverbGain;
    state.reverbSend = reverbSend;
    state.lfoOsc = lfoOsc;

    resizeVisualizer();
}

function createImpulseResponse(context, duration, decay) {
    const rate = context.sampleRate;
    const length = rate * duration;
    const impulse = context.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel += 1) {
        const buffer = impulse.getChannelData(channel);
        for (let i = 0; i < length; i += 1) {
            buffer[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }
    return impulse;
}

function buildKeyboard() {
    if (!ui.keyboard) return;
    ui.keyboard.innerHTML = "";
    let whiteIndex = 0;
    const startOctave = state.keyboardOctave;
    const octaves = 2;

    for (let octave = 0; octave < octaves; octave += 1) {
        for (let i = 0; i < NOTES.length; i += 1) {
            const noteName = NOTES[i];
            const midi = 12 * (startOctave + 1 + octave) + i;
            if (WHITE_NOTES.has(noteName)) {
                const key = createKeyElement(noteName, midi, "white", whiteIndex);
                ui.keyboard.appendChild(key);
                whiteIndex += 1;
            } else {
                const key = createKeyElement(noteName, midi, "black", whiteIndex - 1);
                ui.keyboard.appendChild(key);
            }
        }
    }
}

function createKeyElement(noteName, midi, color, whiteIndex) {
    const key = document.createElement("div");
    key.className = `key ${color}`;
    key.style.setProperty("--pos", whiteIndex);
    if (color === "white") {
        key.style.left = `calc(var(--white-key-width) * ${whiteIndex})`;
    } else {
        key.style.left = `calc(var(--white-key-width) * ${whiteIndex} + (var(--white-key-width) - var(--black-key-width) / 2))`;
    }
    key.dataset.midi = midi.toString();
    key.textContent = color === "white" ? noteName : "";

    key.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        key.setPointerCapture(event.pointerId);
        state.pointerNotes.set(event.pointerId, midi);
        handleNoteOn(midi);
    });
    key.addEventListener("pointerup", (event) => {
        event.preventDefault();
        key.releasePointerCapture(event.pointerId);
        const note = state.pointerNotes.get(event.pointerId);
        if (note !== undefined) {
            handleNoteOff(note);
            state.pointerNotes.delete(event.pointerId);
        }
    });
    key.addEventListener("pointercancel", (event) => {
        const note = state.pointerNotes.get(event.pointerId);
        if (note !== undefined) {
            handleNoteOff(note);
            state.pointerNotes.delete(event.pointerId);
        }
    });
    return key;
}

function handleNoteOn(midi) {
    if (!state.isPowered) return;
    highlightKey(midi, true);
    if (settings.arpEnabled) {
        state.heldNotes.add(midi);
        restartArp();
        return;
    }
    startVoice(midi);
}

function handleNoteOff(midi) {
    highlightKey(midi, false);
    if (settings.arpEnabled) {
        state.heldNotes.delete(midi);
        if (state.heldNotes.size === 0) {
            stopArp();
        }
        return;
    }
    stopVoice(midi);
}

function startVoice(midi) {
    if (!state.audioContext) return;
    if (state.activeVoices.has(midi)) return;
    if (state.activeVoices.size >= MAX_POLYPHONY) {
        stopOldestVoice();
    }

    const frequency = midiToFrequency(midi);
    const voice = createVoice(midi, frequency);
    state.activeVoices.set(midi, voice);
    updateVoiceCount();
}

function stopVoice(midi) {
    const voice = state.activeVoices.get(midi);
    if (!voice) return;
    voice.release();
    state.activeVoices.delete(midi);
    updateVoiceCount();
}

function stopOldestVoice() {
    let oldest = null;
    state.activeVoices.forEach((voice) => {
        if (!oldest || voice.startedAt < oldest.startedAt) {
            oldest = voice;
        }
    });
    if (oldest) {
        stopVoice(oldest.midi);
    }
}

function createVoice(midi, frequency) {
    const ctx = state.audioContext;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const osc1Gain = ctx.createGain();
    const osc2Gain = ctx.createGain();
    const subGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const lfoPitchGain = ctx.createGain();
    const lfoFilterGain = ctx.createGain();

    osc1.type = settings.osc1Type;
    osc2.type = settings.osc2Type;
    subOsc.type = "sine";

    const now = ctx.currentTime;
    const glide = settings.glideTime;
    const hasGlide = glide > 0 && state.lastFrequency && state.activeVoices.size > 0;
    const initialFrequency = hasGlide ? state.lastFrequency : frequency;

    osc1.frequency.setValueAtTime(initialFrequency, now);
    osc2.frequency.setValueAtTime(initialFrequency, now);
    subOsc.frequency.setValueAtTime(initialFrequency / 2, now);
    if (hasGlide) {
        osc1.frequency.setTargetAtTime(frequency, now, glide);
        osc2.frequency.setTargetAtTime(frequency, now, glide);
        subOsc.frequency.setTargetAtTime(frequency / 2, now, glide);
    }

    osc2.detune.value = settings.detune;
    osc1Gain.gain.value = 1 - settings.oscMix;
    osc2Gain.gain.value = settings.oscMix;
    subGain.gain.value = settings.subEnabled ? settings.subLevel : 0;

    filter.type = "lowpass";
    filter.frequency.value = settings.filterCutoff;
    filter.Q.value = settings.filterResonance;

    amp.gain.value = 0;
    pan.pan.value = (Math.random() - 0.5) * 0.2;

    osc1.connect(osc1Gain);
    osc2.connect(osc2Gain);
    subOsc.connect(subGain);
    osc1Gain.connect(filter);
    osc2Gain.connect(filter);
    subGain.connect(filter);
    filter.connect(amp);
    amp.connect(pan);
    pan.connect(state.masterGain);
    amp.connect(state.delaySend);
    amp.connect(state.reverbSend);

    state.lfoOsc.connect(lfoPitchGain);
    state.lfoOsc.connect(lfoFilterGain);
    lfoPitchGain.connect(osc1.detune);
    lfoPitchGain.connect(osc2.detune);
    lfoFilterGain.connect(filter.frequency);

    updateVoiceLfo({
        lfoPitchGain,
        lfoFilterGain
    });

    const peak = 1;
    const sustainLevel = settings.envSustain;
    amp.gain.cancelScheduledValues(now);
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(peak, now + settings.envAttack);
    amp.gain.linearRampToValueAtTime(sustainLevel, now + settings.envAttack + settings.envDecay);

    osc1.start(now);
    osc2.start(now);
    subOsc.start(now);

    state.lastFrequency = frequency;

    const voice = {
        midi,
        startedAt: now,
        osc1,
        osc2,
        subOsc,
        osc1Gain,
        osc2Gain,
        subGain,
        filter,
        amp,
        pan,
        lfoPitchGain,
        lfoFilterGain,
        release: () => {
            const releaseStart = ctx.currentTime;
            amp.gain.cancelScheduledValues(releaseStart);
            amp.gain.setValueAtTime(amp.gain.value, releaseStart);
            amp.gain.linearRampToValueAtTime(0, releaseStart + settings.envRelease);
            const stopAt = releaseStart + settings.envRelease + 0.05;
            osc1.stop(stopAt);
            osc2.stop(stopAt);
            subOsc.stop(stopAt);
            setTimeout(() => {
                cleanupVoice(voice);
            }, (stopAt - releaseStart) * 1000 + 50);
        }
    };

    return voice;
}

function cleanupVoice(voice) {
    const nodes = [
        voice.osc1,
        voice.osc2,
        voice.subOsc,
        voice.osc1Gain,
        voice.osc2Gain,
        voice.subGain,
        voice.filter,
        voice.amp,
        voice.pan,
        voice.lfoPitchGain,
        voice.lfoFilterGain
    ];
    nodes.forEach((node) => {
        if (!node) return;
        node.disconnect();
    });
    if (state.lfoOsc) {
        state.lfoOsc.disconnect(voice.lfoPitchGain);
        state.lfoOsc.disconnect(voice.lfoFilterGain);
    }
}

function updateVoiceLfo(voice) {
    const depth = settings.lfoDepth;
    const pitchAmount = depth * 40;
    const filterAmount = depth * 800;
    const target = settings.lfoTarget;

    if (target === "pitch" || target === "both") {
        voice.lfoPitchGain.gain.value = pitchAmount;
    } else {
        voice.lfoPitchGain.gain.value = 0;
    }

    if (target === "filter" || target === "both") {
        voice.lfoFilterGain.gain.value = filterAmount;
    } else {
        voice.lfoFilterGain.gain.value = 0;
    }
}

function triggerChordPad(pad) {
    const chordName = pad.dataset.chord;
    const chord = CHORDS[chordName];
    if (!chord) return;
    const base = keyboardBaseMidi();
    const root = base + chord.root;
    const notes = chord.intervals.map((interval) => root + interval);
    state.padNotes.set(pad, notes);
    notes.forEach((note) => handleNoteOn(note));
}

function releaseChordPad(pad) {
    const notes = state.padNotes.get(pad);
    if (!notes) return;
    notes.forEach((note) => handleNoteOff(note));
    state.padNotes.delete(pad);
}

function restartArp() {
    stopArp();
    state.arpIndex = 0;
    state.arpDirection = 1;
    if (!settings.arpEnabled) return;
    if (state.heldNotes.size === 0) return;
    const interval = Math.max(0.08, 1 / settings.arpRate);
    state.arpTimer = setInterval(arpStep, interval * 1000);
}

function stopArp() {
    if (state.arpTimer) {
        clearInterval(state.arpTimer);
        state.arpTimer = null;
    }
}

function arpStep() {
    if (!settings.arpEnabled || state.heldNotes.size === 0) return;
    const notes = Array.from(state.heldNotes).sort((a, b) => a - b);
    let index = state.arpIndex;

    switch (settings.arpMode) {
        case "down":
            index = notes.length - 1 - (state.arpIndex % notes.length);
            break;
        case "random":
            index = Math.floor(Math.random() * notes.length);
            break;
        case "updown":
            if (state.arpIndex >= notes.length - 1) {
                state.arpDirection = -1;
            } else if (state.arpIndex <= 0) {
                state.arpDirection = 1;
            }
            index = state.arpIndex;
            state.arpIndex += state.arpDirection;
            break;
        default:
            index = state.arpIndex % notes.length;
            break;
    }

    const note = notes[index];
    startVoice(note);
    const gate = Math.max(0.05, 0.6 / settings.arpRate);
    setTimeout(() => stopVoice(note), gate * 1000);

    if (settings.arpMode !== "updown") {
        state.arpIndex = (state.arpIndex + 1) % notes.length;
    }
}

function updateArpStatus() {
    ui.arpStatus.textContent = settings.arpEnabled ? "On" : "Off";
    updateToggleState("arpEnabled");
}

function updateVoiceCount() {
    ui.voiceCount.textContent = state.activeVoices.size.toString();
}

function panic() {
    state.activeVoices.forEach((voice) => voice.release());
    state.activeVoices.clear();
    state.heldNotes.clear();
    stopArp();
    updateVoiceCount();
    document.querySelectorAll(".key").forEach((key) => key.classList.remove("is-active"));
}

function highlightKey(midi, isActive) {
    const key = document.querySelector(`.key[data-midi="${midi}"]`);
    if (!key) return;
    key.classList.toggle("is-active", isActive);
}

function shiftOctave(amount) {
    const next = clamp(state.keyboardOctave + amount, 1, 6);
    if (next === state.keyboardOctave) return;
    state.keyboardOctave = next;
    buildKeyboard();
    updateOctaveLabel();
}

function updateOctaveLabel() {
    ui.octaveLabel.textContent = `Octave ${state.keyboardOctave}`;
}

function keyboardBaseMidi() {
    return 12 * (state.keyboardOctave + 1);
}

function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizedFromCutoff(freq) {
    return Math.log(freq / FILTER_MIN) / Math.log(FILTER_MAX / FILTER_MIN);
}

function cutoffFromNormalized(normalized) {
    return FILTER_MIN * Math.pow(FILTER_MAX / FILTER_MIN, normalized);
}

function isTypingInControl(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
}

function setupVisualizer() {
    if (!ui.canvas) return;
    state.visualizer.canvas = ui.canvas;
    state.visualizer.ctx = ui.canvas.getContext("2d");
    resizeVisualizer();
    requestAnimationFrame(drawVisualizer);
}

function resizeVisualizer() {
    if (!state.visualizer.canvas) return;
    const rect = state.visualizer.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    state.visualizer.canvas.width = rect.width * dpr;
    state.visualizer.canvas.height = rect.height * dpr;
    state.visualizer.width = rect.width;
    state.visualizer.height = rect.height;
    state.visualizer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    const { ctx, width, height } = state.visualizer;
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (state.analyser && state.isPowered) {
        const bufferLength = state.analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        state.analyser.getByteTimeDomainData(dataArray);
        const sliceWidth = width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i += 1) {
            const v = dataArray[i] / 128.0;
            const y = (v * height) / 2;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }
    } else {
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
    }
    ctx.stroke();
}
