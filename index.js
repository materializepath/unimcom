// Set to > 0 if the DSP is polyphonic
const FAUST_DSP_VOICES = 0;
const CREATE_NODE_MODULE_SPEC = "./create-node.js?v=20260521seq4";
const THREE_MODULE_SPEC = "./vendor/three.module.min.js";
const IS_LOCAL_PREVIEW = ["localhost", "127.0.0.1"].includes(window.location.hostname);

/**
 * @typedef {import("./faustwasm").FaustAudioWorkletNode} FaustAudioWorkletNode
 * @typedef {import("./faustwasm").FaustDspMeta} FaustDspMeta
 * @typedef {import("./faustwasm").FaustUIDescriptor} FaustUIDescriptor
 * @typedef {import("./faustwasm").FaustUIGroup} FaustUIGroup
 * @typedef {import("./faustwasm").FaustUIItem} FaustUIItem
 */

/**
 * Registers the service worker.
 */
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        if (IS_LOCAL_PREVIEW) {
            navigator.serviceWorker.getRegistrations()
                .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
                .then(async () => {
                    if ("caches" in window) {
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
                    }
                    console.log("Service Worker disabled for local preview");
                })
                .catch((err) => console.log("Local preview service worker cleanup failed", err));
            return;
        }
        navigator.serviceWorker.register("./service-worker.js")
            .then(reg => console.log("Service Worker registered", reg))
            .catch(err => console.log("Service Worker registration failed", err));
    });
}

/** @type {HTMLDivElement} */
const $divFaustUI = document.getElementById("div-faust-ui");

/** @type {typeof AudioContext} */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioContext = new AudioCtx({ latencyHint: 0.00001 });
audioContext.destination.channelInterpretation = "discrete";
audioContext.suspend();

// Declare faustNode as a global variable
let faustNode;
let faustUIBridge = null;
let dspControls = [];
let dspControlIndex = new Map();
let currentParamValueMap = new Map();
let paramValueObserverCleanup = null;
let faustReadyResolve;
let faustReadyReject;
let refreshStartControlUI = () => {};
let refreshMotionControlUI = () => {};
let refreshMotionGlyphUI = () => {};
let refreshMIDIControlUI = () => {};
let refreshLiveInputControlUI = () => {};
let refreshAudioInputDeviceListUI = () => {};
let refreshSeqPanelUI = () => {};
let refreshPresetShadeUI = () => {};
let refreshUserPresetButtonsUIExternal = () => {};
let refreshFooterPresetTransferConsoleUI = () => {};
let runQuickPresetMorphExternal = () => false;
let clearPresetMorphIndicatorsExternal = () => {};
let destroyMotionCubeGlyph = () => {};
let motionCubeModulePromise = null;
let zoomResizeHandler = null;
let fullscreenChangeHandler = null;
let saveModeKeydownHandler = null;
let activeModePresetId = "";
let modeMorphFrame = 0;
let modeMorphToken = 0;
const STARTUP_MODE_PRESET_ID = "childhood_memory";
let startupModePresetApplied = false;
const PRESET_HAPTIC_TICK_DURATION_MS = 120;
const PRESET_HAPTIC_TICK_MIN_INTERVAL_MS = 60;
const PRESET_HAPTIC_TICK_BUCKET_COUNT = 48;
const HAPTIC_FALLBACK_TOGGLE_MIN_MS = 10;
const HAPTIC_FALLBACK_TOGGLE_RANGE_MS = 60;
const HAPTIC_TEST_DEFAULT_INTENSITY = 1;
const HAPTIC_FALLBACK_TICK_BURST_COUNT = 3;
const IOS_HAPTIC_FALLBACK_SWITCH_ID = "hud-ios-haptic-preset";
let iosHapticFallbackSwitch = null;
let fallbackPatternFrame = 0;
let fallbackPatternToken = 0;
const MOTION_MODE_SIGNAL_KEYS = Object.freeze(["tiltX", "tiltY", "gyroPitch", "gyroRoll", "gyroSpin"]);
const MOTION_MODE_RANDOM_ASSIGNMENT_RATIO = 0.32;

// ── Step Sequencer Engine ─────────────────────────────────────────────────────
const SEQ_VALID_STEP_COUNTS = new Set([8, 16, 32]);
const SEQ_VALID_DIRECTIONS = new Set(["forward", "reverse", "pingpong"]);
const SEQ_MIDPOINT = 0;

class StepSequencer {
    constructor() {
        this._bpm = 120;
        this._stepCount = 16;
        this._direction = "forward";
        this._params = new Map();
        this._timerId = null;
        this._currentStep = 0;
        this._playing = false;
        this._pingPongDir = 1;
        this._onStep = null;
        this._onParamUpdate = null;
    }
    destroy() { this.stop(); this._params.clear(); this._onStep = null; this._onParamUpdate = null; }
    setBPM(bpm) { this._bpm = Math.max(30, Math.min(300, Number(bpm) || 120)); if (this._playing) this._restartTimer(); }
    getBPM() { return this._bpm; }
    setStepCount(count) {
        const n = Number(count);
        if (!SEQ_VALID_STEP_COUNTS.has(n)) return;
        if (n === this._stepCount) return;
        const oldCount = this._stepCount;
        this._stepCount = n;
        for (const param of this._params.values()) {
            const newPattern = new Float32Array(n);
            newPattern.fill(SEQ_MIDPOINT);
            const copyLen = Math.min(oldCount, n);
            for (let i = 0; i < copyLen; i++) newPattern[i] = param.pattern[i];
            param.pattern = newPattern;
        }
    }
    getStepCount() { return this._stepCount; }
    linkParameter(path, min, max, step) {
        const pattern = new Float32Array(this._stepCount);
        pattern.fill(SEQ_MIDPOINT);
        this._params.set(path, { path, min: Number(min), max: Number(max), step: step != null ? Number(step) : null, pattern });
    }
    unlinkParameter(path) { this._params.delete(path); }
    isLinked(path) { return this._params.has(path); }
    getLinkedParameters() { return Array.from(this._params.keys()); }
    setStepValue(path, stepIndex, value) {
        const param = this._params.get(path);
        if (!param || stepIndex < 0 || stepIndex >= this._stepCount) return;
        param.pattern[stepIndex] = Math.max(0, Math.min(1, Number(value)));
    }
    getStepValue(path, stepIndex) {
        const param = this._params.get(path);
        if (!param || stepIndex < 0 || stepIndex >= this._stepCount) return SEQ_MIDPOINT;
        return param.pattern[stepIndex];
    }
    clearPattern(path) { const param = this._params.get(path); if (param) param.pattern.fill(SEQ_MIDPOINT); }
    play(onStep, onParamUpdate) {
        if (this._playing) this.stop();
        this._onStep = onStep;
        this._onParamUpdate = onParamUpdate;
        this._currentStep = 0;
        this._pingPongDir = 1;
        this._playing = true;
        this._tick();
        this._timerId = setInterval(() => this._tick(), 60000 / this._bpm);
    }
    stop() {
        if (this._timerId !== null) { clearInterval(this._timerId); this._timerId = null; }
        this._playing = false;
        this._currentStep = 0;
        this._pingPongDir = 1;
    }
    isPlaying() { return this._playing; }
    getCurrentStep() { return this._currentStep; }
    setDirection(dir) { if (SEQ_VALID_DIRECTIONS.has(dir)) { this._direction = dir; this._pingPongDir = 1; } }
    getDirection() { return this._direction; }
    _restartTimer() {
        if (this._timerId !== null) {
            clearInterval(this._timerId);
            this._timerId = setInterval(() => this._tick(), 60000 / this._bpm);
        }
    }
    _denormalize(param, normalized) {
        let value = param.min + normalized * (param.max - param.min);
        if (param.step != null && param.step > 0) {
            value = Math.round((value - param.min) / param.step) * param.step + param.min;
            value = Math.max(param.min, Math.min(param.max, value));
        }
        return value;
    }
    _tick() {
        const step = this._currentStep;
        for (const param of this._params.values()) {
            if (this._onParamUpdate) this._onParamUpdate(param.path, this._denormalize(param, param.pattern[step]));
        }
        if (this._onStep) this._onStep(step);
        this._advanceStep();
    }
    _advanceStep() {
        const count = this._stepCount;
        switch (this._direction) {
            case "forward": this._currentStep = (this._currentStep + 1) % count; break;
            case "reverse": this._currentStep = (this._currentStep - 1 + count) % count; break;
            case "pingpong":
                this._currentStep += this._pingPongDir;
                if (this._currentStep >= count) { this._currentStep = count - 2; this._pingPongDir = -1; }
                if (this._currentStep < 0) { this._currentStep = 1; this._pingPongDir = 1; }
                this._currentStep = Math.max(0, Math.min(count - 1, this._currentStep));
                break;
            default: this._currentStep = (this._currentStep + 1) % count;
        }
    }
}

let sequencer = null;
let seqPanelOpen = false;

const MOTION_MODE_RANDOM_ASSIGNMENT_MIN = 12;
const MOTION_MODE_RANDOM_ASSIGNMENT_MAX = 18;
const MOTION_MODE_GYRO_DECAY = 0.08;
const MOTION_MODE_SMOOTHING = 0.28;
const MOTION_MODE_SPAN_VARIATION_MIN = 1.05;
const MOTION_MODE_SPAN_VARIATION_MAX = 1.55;
const MOTION_MODE_TILT_GAMMA_RANGE = 58;
const MOTION_MODE_TILT_BETA_RANGE = 70;
const MOTION_MODE_GYRO_BETA_RANGE = 95;
const MOTION_MODE_GYRO_GAMMA_RANGE = 95;
const MOTION_MODE_GYRO_ALPHA_RANGE = 125;
const MOTION_MODE_GLYPH_ROTATION_MAX = 42;
const MOTION_MODE_ACCELERATION_RANGE = 18;
const MOTION_CUBE_REST_SLERP = 8.2;
const MOTION_CUBE_ACTIVE_DAMPING = 3.45;
const MOTION_CUBE_IDLE_DAMPING = 9.4;
const MOTION_CUBE_TILT_MAX_RAD = 0.58;
const MOTION_CUBE_ROLL_MAX_RAD = 0.34;
const MOTION_CUBE_SPRING_STRENGTH = 8.3;
const MOTION_CUBE_ACCELERATION_BOOST = 2.85;
const MOTION_CUBE_GYRO_TORQUE = 5.2;
const MOTION_CUBE_VELOCITY_MAX = 7.2;
const RANDOM_BUTTON_DICE_VALUES = Object.freeze([1, 2, 3, 4, 5, 6]);
const RANDOM_BUTTON_DICE_PIP_MAP = Object.freeze({
    1: Object.freeze([4]),
    2: Object.freeze([0, 8]),
    3: Object.freeze([0, 4, 8]),
    4: Object.freeze([0, 2, 6, 8]),
    5: Object.freeze([0, 2, 4, 6, 8]),
    6: Object.freeze([0, 2, 3, 5, 6, 8]),
});
const RANDOM_BUTTON_ROLL_MIN_STEPS = 7;
const RANDOM_BUTTON_ROLL_MAX_STEPS = 11;
const RANDOM_BUTTON_ROLL_STEP_MS = 44;
const RANDOM_BUTTON_ROLL_STEP_VARIATION_MS = 22;
const RANDOM_BUTTON_ROLL_SETTLE_MS = 92;
const RANDOMIZE_MORPH_DURATION_MS = 840;
const RANDOMIZE_MORPH_STAGGER_WINDOW_MS = 260;
const RANDOMIZE_MORPH_DURATION_VARIATION_MIN = 0.82;
const RANDOMIZE_MORPH_DURATION_VARIATION_MAX = 1.18;
const GAIN_CONTROL_KEY = "gain";
const ROOT_CONTROL_KEY = "root";
const USER_PRESET_STORAGE_KEY = "materialize.user-presets.v1";
const USER_PRESET_TRANSFER_PAYLOAD_TYPE = "materialize.user-presets.transfer";
const USER_PRESET_TRANSFER_PAYLOAD_VERSION = 1;
const USER_PRESET_TRANSFER_CODE_PREFIX = "MATUSR1:";
const USER_PRESET_SLOT_COUNT = 8;
const FOOTER_CONSOLE_BOOT_FRAME_MS = 96;
const FOOTER_CONSOLE_BOOT_MESSAGES = Object.freeze([
    "// PATH:EDITIONS-BRINGS YOU:",
    "UNIMCOM.MKI.UNIVERSAL.MATTER.COMPILER",
    "v.0.9.2. / DSPv.0.3.2",
    "URL: https://unimcom.materialize.fun",
    "CONSOLE|TERMINAL: ASCII GRFX / WAREZ .nfo",
]);
const FOOTER_CONSOLE_BOOT_COMMAND_HINTS = Object.freeze([
    "CMDS: /help /export /load /paste",
    "NEXT: /record [soon] /clear /slots",
]);
const FOOTER_CONSOLE_BOOT_TICKER = "PATH:EDITIONS // UNIMCOM.MKI.UNIVERSAL.MATTER.COMPILER // v.0.9.2. / DSPv.0.3.2 // URL: https://unimcom.materialize.fun // CONSOLE|TERMINAL: ASCII GRFX / WAREZ .nfo // CMDS: /help /export /load /paste // NEXT: /record [soon] /clear /slots //";
const USER_PRESET_SLOT_IDS = Object.freeze(
    Array.from({ length: USER_PRESET_SLOT_COUNT }, (_, index) => `user_${String(index + 1).padStart(2, "0")}`)
);
const DEFAULT_GLOBAL_MORPH_DURATION_MS = 900;
const MAX_GLOBAL_MORPH_DURATION_MS = 30000;
const GLOBAL_MORPH_STEP_MS = 50;
const GLOBAL_TRANSPOSE_MIN = -12;
const GLOBAL_TRANSPOSE_MAX = 12;
const GLOBAL_TRANSPOSE_STEP = 1;
const DEFAULT_MOTION_INTENSITY = 0.32;
const MOTION_INTENSITY_MIN = 0;
const MOTION_INTENSITY_MAX = 1;
const MOTION_INTENSITY_STEP = 0.01;
const PRESET_SHADE_VARIANTS = Object.freeze([
    Object.freeze({ accentMix: 0.1, borderMix: 0.1, glowMix: 0.14, knobMix: 0.06, coreMix: 0.03 }),
    Object.freeze({ accentMix: 0.16, borderMix: 0.16, glowMix: 0.2, knobMix: 0.1, coreMix: 0.05 }),
    Object.freeze({ accentMix: 0.22, borderMix: 0.2, glowMix: 0.24, knobMix: 0.13, coreMix: 0.07 }),
    Object.freeze({ accentMix: 0.14, borderMix: 0.14, glowMix: 0.18, knobMix: 0.08, coreMix: 0.04 }),
    Object.freeze({ accentMix: 0.2, borderMix: 0.18, glowMix: 0.22, knobMix: 0.12, coreMix: 0.06 }),
    Object.freeze({ accentMix: 0.26, borderMix: 0.22, glowMix: 0.28, knobMix: 0.15, coreMix: 0.08 }),
    Object.freeze({ accentMix: 0.18, borderMix: 0.17, glowMix: 0.2, knobMix: 0.11, coreMix: 0.05 }),
]);
const PRESET_BUTTON_LABEL_SEEDS = Object.freeze([
    "#4cd3b7",
    "#68d6f6",
    "#5e9ed8",
    "#8b98e7",
    "#b0a4ed",
    "#c46bff",
    "#7fe0d3",
]);
const MOTION_MODE_EXCLUDED_KEYS = new Set([
    "gain",
    "root",
    "cameraorbitx",
    "cameraorbity",
    "mobilerotx",
    "mobileroty",
    "zoomin",
    "zoomout",
    "proximityctl",
    "lockctl",
    "stagectl",
    "objectspinctl",
]);
const MOTION_MODE_SIGNAL_LIBRARY = Object.freeze([
    Object.freeze({ key: "tiltX", span: 0.46 }),
    Object.freeze({ key: "tiltY", span: 0.46 }),
    Object.freeze({ key: "gyroPitch", span: 0.32 }),
    Object.freeze({ key: "gyroRoll", span: 0.32 }),
    Object.freeze({ key: "gyroSpin", span: 0.26 }),
]);
const MOTION_MODE_SENSITIVE_CONTROL_POOL = Object.freeze([
    Object.freeze({ key: "root", probability: 0.36, spanScale: 0.08, preferredSignals: Object.freeze(["tiltY", "gyroPitch"]) }),
    Object.freeze({ key: "ritualtone", probability: 0.44, spanScale: 0.11, preferredSignals: Object.freeze(["tiltY", "gyroSpin"]) }),
    Object.freeze({ key: "detune", probability: 0.52, spanScale: 0.22, preferredSignals: Object.freeze(["tiltX", "gyroRoll", "gyroSpin"]) }),
    Object.freeze({ key: "polychord", probability: 0.4, spanScale: 0.18, preferredSignals: Object.freeze(["tiltX", "tiltY", "gyroPitch"]) }),
    Object.freeze({ key: "chantmode", probability: 0.34, spanScale: 0.16, preferredSignals: Object.freeze(["tiltX", "gyroPitch"]) }),
]);
const motionModeState = {
    active: false,
    listenersBound: false,
    frame: 0,
    assignments: [],
    targets: createMotionSignalState(),
    values: createMotionSignalState(),
    accelerationTarget: 0,
    accelerationValue: 0,
};
const midiInputState = {
    active: false,
    access: null,
    inputs: new Set(),
    stateChangeBound: false,
    supported: typeof navigator.requestMIDIAccess === "function",
};
const liveInputState = {
    active: false,
    streamNode: null,
    selectedDeviceId: "",
    devices: [],
    deviceChangeBound: false,
    supported: Boolean(navigator.mediaDevices?.getUserMedia && navigator.mediaDevices?.enumerateDevices),
};
const faustReady = new Promise((resolve, reject) => {
    faustReadyResolve = resolve;
    faustReadyReject = reject;
});

/**
 * @typedef {{
 *   address: string;
 *   type: string;
 *   min: number;
 *   max: number;
 *   init: number;
 *   step: number;
 * }} DSPControl
 */

/**
 * @typedef {{
 *   id: string;
 *   title: string;
 *   subtitle: string;
 *   values: Record<string, number>;
 * }} ModePreset
 */

/**
 * @typedef {{
 *   id: string;
 *   label: string;
 *   vars: Readonly<Record<string, string>>;
 * }} HUDTheme
 */

/**
 * @typedef {{
 *   id: string;
 *   label: string;
 *   values: Record<string, number> | null;
 *   updatedAt: string;
 *   saved: boolean;
 * }} UserPresetSlot
 */

/**
 * @typedef {{
 *   effectiveRootHz: number;
 *   transposeSemitones: number;
 *   morphDurationMs: number;
 *   motionIntensity: number;
 *   saveModeArmed: boolean;
 * }} GlobalControlState
 */

const HUD_THEME_STORAGE_KEY = "materialize.hud-theme";

/**
 * @param {string} id
 * @param {string} label
 * @param {Record<string, string>} vars
 * @returns {HUDTheme}
 */
function createHUDTheme(id, label, vars) {
    return Object.freeze({
        id,
        label,
        vars: Object.freeze({ ...vars }),
    });
}

/** @type {readonly HUDTheme[]} */
const HUD_THEMES = Object.freeze([
    createHUDTheme("noir", "Noir", {
        "--hud-bg": "rgba(8, 9, 11, 0.86)",
        "--hud-panel-bg": "rgba(11, 12, 14, 0.95)",
        "--hud-border": "rgba(220, 224, 228, 0.22)",
        "--hud-ink": "rgba(232, 236, 240, 0.92)",
        "--hud-ink-soft": "rgba(208, 212, 216, 0.66)",
        "--hud-off": "rgba(206, 210, 214, 0.12)",
        "--hud-on": "rgba(232, 236, 240, 0.86)",
        "--hud-accent": "rgba(232, 236, 240, 0.86)",
        "--hud-accent-soft": "rgba(220, 224, 228, 0.22)",
        "--hud-border-active": "rgba(71, 229, 186, 1)",
        "--hud-grid": "rgba(210, 214, 218, 0.12)",
        "--hud-font-family": "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
        "--hud-body-bg": "#020305",
        "--hud-shell-bg-base": "#000000",
        "--hud-panel-frame-bg": "linear-gradient(180deg, rgba(10, 12, 15, 0.78) 0%, rgba(6, 8, 10, 0.64) 100%)",
        "--hud-strip-bg": "rgba(8, 10, 12, 0.22)",
        "--hud-strip-border": "rgba(210, 214, 218, 0.12)",
        "--hud-mode-knob-fill": "rgba(7, 9, 12, 0.9)",
        "--hud-mode-knob-core-fill": "rgba(5, 7, 10, 0.85)",
        "--hud-pointer-glow": "rgba(71, 229, 186, 0.35)",
    }),
    createHUDTheme("aurora", "Aurora", {
        "--hud-bg": "rgba(13, 12, 26, 0.88)",
        "--hud-panel-bg": "rgba(21, 19, 40, 0.94)",
        "--hud-border": "rgba(196, 210, 255, 0.25)",
        "--hud-ink": "rgba(240, 245, 255, 0.95)",
        "--hud-ink-soft": "rgba(201, 218, 255, 0.72)",
        "--hud-off": "rgba(182, 205, 255, 0.14)",
        "--hud-on": "rgba(224, 255, 250, 0.94)",
        "--hud-accent": "rgba(190, 250, 255, 0.95)",
        "--hud-accent-soft": "rgba(164, 144, 255, 0.24)",
        "--hud-border-active": "rgba(85, 255, 214, 1)",
        "--hud-grid": "rgba(168, 196, 255, 0.16)",
        "--hud-font-family": "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
        "--hud-body-bg": "#040713",
        "--hud-shell-bg-base": "#050914",
        "--hud-panel-frame-bg": "linear-gradient(180deg, rgba(25, 28, 62, 0.78) 0%, rgba(10, 16, 32, 0.74) 100%)",
        "--hud-strip-bg": "rgba(18, 24, 52, 0.32)",
        "--hud-strip-border": "rgba(120, 164, 255, 0.28)",
        "--hud-mode-knob-fill": "rgba(16, 16, 42, 0.92)",
        "--hud-mode-knob-core-fill": "rgba(8, 12, 30, 0.88)",
        "--hud-pointer-glow": "rgba(85, 255, 214, 0.46)",
    }),
    createHUDTheme("sunset", "Sunset", {
        "--hud-bg": "rgba(22, 12, 10, 0.88)",
        "--hud-panel-bg": "rgba(39, 21, 18, 0.95)",
        "--hud-border": "rgba(255, 205, 166, 0.3)",
        "--hud-ink": "rgba(255, 235, 214, 0.95)",
        "--hud-ink-soft": "rgba(255, 210, 175, 0.74)",
        "--hud-off": "rgba(255, 194, 136, 0.15)",
        "--hud-on": "rgba(255, 235, 214, 0.93)",
        "--hud-accent": "rgba(255, 190, 124, 0.94)",
        "--hud-accent-soft": "rgba(255, 124, 114, 0.27)",
        "--hud-border-active": "rgba(255, 130, 76, 1)",
        "--hud-grid": "rgba(255, 182, 136, 0.17)",
        "--hud-font-family": "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
        "--hud-body-bg": "#120605",
        "--hud-shell-bg-base": "#100404",
        "--hud-panel-frame-bg": "linear-gradient(180deg, rgba(68, 32, 24, 0.82) 0%, rgba(28, 12, 10, 0.78) 100%)",
        "--hud-strip-bg": "rgba(55, 24, 18, 0.3)",
        "--hud-strip-border": "rgba(255, 178, 123, 0.32)",
        "--hud-mode-knob-fill": "rgba(34, 15, 12, 0.9)",
        "--hud-mode-knob-core-fill": "rgba(23, 10, 8, 0.88)",
        "--hud-pointer-glow": "rgba(255, 130, 76, 0.48)",
    }),
    createHUDTheme("tide", "Tide", {
        "--hud-bg": "rgba(7, 16, 24, 0.9)",
        "--hud-panel-bg": "rgba(9, 28, 41, 0.95)",
        "--hud-border": "rgba(145, 210, 255, 0.28)",
        "--hud-ink": "rgba(221, 244, 255, 0.95)",
        "--hud-ink-soft": "rgba(173, 216, 238, 0.74)",
        "--hud-off": "rgba(129, 188, 227, 0.14)",
        "--hud-on": "rgba(218, 248, 255, 0.95)",
        "--hud-accent": "rgba(133, 229, 255, 0.95)",
        "--hud-accent-soft": "rgba(84, 156, 225, 0.29)",
        "--hud-border-active": "rgba(74, 227, 255, 1)",
        "--hud-grid": "rgba(135, 199, 232, 0.16)",
        "--hud-font-family": "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
        "--hud-body-bg": "#03131d",
        "--hud-shell-bg-base": "#02121a",
        "--hud-panel-frame-bg": "linear-gradient(180deg, rgba(10, 47, 67, 0.8) 0%, rgba(6, 21, 34, 0.78) 100%)",
        "--hud-strip-bg": "rgba(10, 40, 54, 0.3)",
        "--hud-strip-border": "rgba(106, 186, 235, 0.31)",
        "--hud-mode-knob-fill": "rgba(7, 25, 38, 0.92)",
        "--hud-mode-knob-core-fill": "rgba(5, 17, 28, 0.88)",
        "--hud-pointer-glow": "rgba(74, 227, 255, 0.44)",
    }),
    createHUDTheme("grove", "Grove", {
        "--hud-bg": "rgba(11, 17, 10, 0.9)",
        "--hud-panel-bg": "rgba(17, 30, 15, 0.95)",
        "--hud-border": "rgba(176, 226, 162, 0.27)",
        "--hud-ink": "rgba(231, 245, 220, 0.95)",
        "--hud-ink-soft": "rgba(186, 214, 168, 0.72)",
        "--hud-off": "rgba(155, 192, 131, 0.14)",
        "--hud-on": "rgba(232, 250, 214, 0.95)",
        "--hud-accent": "rgba(170, 236, 143, 0.95)",
        "--hud-accent-soft": "rgba(121, 188, 101, 0.26)",
        "--hud-border-active": "rgba(121, 247, 149, 1)",
        "--hud-grid": "rgba(158, 205, 142, 0.16)",
        "--hud-font-family": "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
        "--hud-body-bg": "#061008",
        "--hud-shell-bg-base": "#050d07",
        "--hud-panel-frame-bg": "linear-gradient(180deg, rgba(24, 52, 18, 0.8) 0%, rgba(10, 22, 8, 0.78) 100%)",
        "--hud-strip-bg": "rgba(18, 38, 16, 0.32)",
        "--hud-strip-border": "rgba(143, 197, 119, 0.3)",
        "--hud-mode-knob-fill": "rgba(13, 24, 10, 0.92)",
        "--hud-mode-knob-core-fill": "rgba(9, 17, 8, 0.88)",
        "--hud-pointer-glow": "rgba(121, 247, 149, 0.44)",
    }),
]);

const HUD_THEME_INDEX = new Map(HUD_THEMES.map((theme) => [theme.id, theme]));
let activeHUDThemeId = HUD_THEMES[0].id;

/**
 * @param {string} themeId
 * @returns {HUDTheme}
 */
function getHUDTheme(themeId) {
    if (typeof themeId === "string" && HUD_THEME_INDEX.has(themeId)) {
        return HUD_THEME_INDEX.get(themeId);
    }
    return HUD_THEMES[0];
}

/**
 * @returns {string}
 */
function readStoredHUDThemeId() {
    try {
        const value = localStorage.getItem(HUD_THEME_STORAGE_KEY);
        return (typeof value === "string") ? value : "";
    } catch (error) {
        console.warn("Unable to read saved vibe theme:", error);
        return "";
    }
}

/**
 * @param {string} themeId
 * @param {{ persist?: boolean }} [options]
 * @returns {HUDTheme}
 */
function applyHUDTheme(themeId, options = {}) {
    const { persist = true } = options;
    const theme = getHUDTheme(themeId);
    activeHUDThemeId = theme.id;
    const $root = document.documentElement;
    Object.entries(theme.vars).forEach(([name, value]) => {
        $root.style.setProperty(name, value);
    });
    $root.dataset.hudTheme = theme.id;
    if (persist) {
        try {
            localStorage.setItem(HUD_THEME_STORAGE_KEY, theme.id);
        } catch (error) {
            console.warn("Unable to save vibe theme:", error);
        }
    }
    return theme;
}

applyHUDTheme(readStoredHUDThemeId(), { persist: false });

/**
 * @param {string} value
 * @returns {{ r: number; g: number; b: number; a: number } | null}
 */
function parseColorString(value) {
    if (typeof value !== "string") return null;
    const color = value.trim();
    if (!color) return null;

    if (color.startsWith("#")) {
        const hex = color.slice(1);
        if (hex.length === 3 || hex.length === 4) {
            const [r, g, b, a = "f"] = hex.split("");
            return {
                r: Number.parseInt(`${r}${r}`, 16),
                g: Number.parseInt(`${g}${g}`, 16),
                b: Number.parseInt(`${b}${b}`, 16),
                a: Number.parseInt(`${a}${a}`, 16) / 255,
            };
        }
        if (hex.length === 6 || hex.length === 8) {
            return {
                r: Number.parseInt(hex.slice(0, 2), 16),
                g: Number.parseInt(hex.slice(2, 4), 16),
                b: Number.parseInt(hex.slice(4, 6), 16),
                a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
            };
        }
        return null;
    }

    const match = color.match(/^rgba?\((.+)\)$/i);
    if (!match) return null;
    const parts = match[1].split(",").map((part) => part.trim());
    if (parts.length < 3) return null;
    const [r, g, b, a = "1"] = parts;
    const parsed = {
        r: Number.parseFloat(r),
        g: Number.parseFloat(g),
        b: Number.parseFloat(b),
        a: Number.parseFloat(a),
    };
    if (
        !Number.isFinite(parsed.r) ||
        !Number.isFinite(parsed.g) ||
        !Number.isFinite(parsed.b) ||
        !Number.isFinite(parsed.a)
    ) {
        return null;
    }
    return parsed;
}

/**
 * @param {{ r: number; g: number; b: number; a: number }} color
 * @returns {string}
 */
function formatColorString(color) {
    const alpha = Math.max(0, Math.min(1, color.a));
    return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha.toFixed(3)})`;
}

/**
 * @param {string} from
 * @param {string} to
 * @param {number} amount
 * @returns {string}
 */
function mixColorStrings(from, to, amount) {
    const start = parseColorString(from);
    const end = parseColorString(to);
    if (!start && !end) return to || from || "rgba(255, 255, 255, 1)";
    if (!start) return to;
    if (!end) return from;
    const t = clamp(amount, 0, 1);
    return formatColorString({
        r: start.r + (end.r - start.r) * t,
        g: start.g + (end.g - start.g) * t,
        b: start.b + (end.b - start.b) * t,
        a: start.a + (end.a - start.a) * t,
    });
}

/**
 * @param {string} value
 * @param {number} alpha
 * @returns {string}
 */
function setColorAlpha(value, alpha) {
    const parsed = parseColorString(value);
    if (!parsed) return value;
    return formatColorString({
        r: parsed.r,
        g: parsed.g,
        b: parsed.b,
        a: clamp(alpha, 0, 1),
    });
}

/**
 * @param {HUDTheme} theme
 * @param {number} presetIndex
 * @returns {Record<string, string>}
 */
function createPresetShadePalette(theme, presetIndex) {
    const variant = PRESET_SHADE_VARIANTS[((presetIndex % PRESET_SHADE_VARIANTS.length) + PRESET_SHADE_VARIANTS.length) % PRESET_SHADE_VARIANTS.length];
    const labelSeed = PRESET_BUTTON_LABEL_SEEDS[((presetIndex % PRESET_BUTTON_LABEL_SEEDS.length) + PRESET_BUTTON_LABEL_SEEDS.length) % PRESET_BUTTON_LABEL_SEEDS.length];
    const vars = theme.vars;
    const accentSeed = mixColorStrings(vars["--hud-border-active"], vars["--hud-accent"], 0.22 + variant.accentMix * 0.22);
    const border = setColorAlpha(mixColorStrings(vars["--hud-border"], accentSeed, variant.borderMix), 0.28 + variant.borderMix * 0.12);
    const surfaceTop = setColorAlpha(mixColorStrings(vars["--hud-accent-soft"], accentSeed, variant.accentMix), 0.22 + variant.accentMix * 0.2);
    const surfaceGlow = setColorAlpha(mixColorStrings(vars["--hud-accent"], accentSeed, variant.glowMix), 0.14 + variant.glowMix * 0.16);
    const label = mixColorStrings(vars["--hud-ink"], accentSeed, 0.08 + variant.accentMix * 0.22);
    const vividSeed = mixColorStrings(labelSeed, vars["--hud-border-active"], 0.14);
    const buttonLabel = mixColorStrings(vividSeed, vars["--hud-on"], 0.08);
    const buttonLabelActive = mixColorStrings(vividSeed, vars["--hud-on"], 0.16);
    const buttonLabelGlow = setColorAlpha(mixColorStrings(vividSeed, vars["--hud-accent"], 0.18), 0.28 + variant.glowMix * 0.18);
    const meta = mixColorStrings(vars["--hud-ink-soft"], accentSeed, 0.08 + variant.accentMix * 0.16);
    const activeBorder = mixColorStrings(vars["--hud-border-active"], vars["--hud-accent"], 0.18 + variant.accentMix * 0.18);
    const activeSoft = setColorAlpha(mixColorStrings(vars["--hud-accent-soft"], accentSeed, 0.44 + variant.accentMix * 0.28), 0.22 + variant.accentMix * 0.18);
    const knobFill = mixColorStrings(vars["--hud-mode-knob-fill"], accentSeed, variant.knobMix);
    const knobCoreFill = mixColorStrings(vars["--hud-mode-knob-core-fill"], accentSeed, variant.coreMix);
    const pointer = mixColorStrings(vars["--hud-border-active"], vars["--hud-accent"], 0.14 + variant.accentMix * 0.22);
    const pointerGlow = setColorAlpha(mixColorStrings(vars["--hud-pointer-glow"], accentSeed, 0.28 + variant.glowMix * 0.24), 0.24 + variant.glowMix * 0.16);
    return {
        "--hud-preset-border": border,
        "--hud-preset-surface-top": surfaceTop,
        "--hud-preset-surface-glow": surfaceGlow,
        "--hud-preset-label": label,
        "--hud-preset-button-label": buttonLabel,
        "--hud-preset-button-label-active": buttonLabelActive,
        "--hud-preset-button-label-glow": buttonLabelGlow,
        "--hud-preset-meta": meta,
        "--hud-preset-active-border": activeBorder,
        "--hud-preset-active-soft": activeSoft,
        "--hud-preset-knob-fill": knobFill,
        "--hud-preset-knob-core-fill": knobCoreFill,
        "--hud-preset-pointer": pointer,
        "--hud-preset-pointer-glow": pointerGlow,
    };
}

/**
 * @param {HTMLElement | null | undefined} $element
 * @param {Record<string, string>} palette
 */
function applyPresetShadePalette($element, palette) {
    if (!($element instanceof HTMLElement)) return;
    Object.entries(palette).forEach(([name, value]) => {
        $element.style.setProperty(name, value);
    });
}

const DSP_CONTROL_DEFAULTS = Object.freeze({
    air: 0.02,
    ambiAmt: 0.26,
    ambiDepth: 0.35,
    ambiElev: 0.5,
    ambiFocus: 0.4,
    ambiRotate: 0.5,
    ambiSpin: 0.22,
    ambiWidth: 0.35,
    ascendAmt: 0,
    attuneBuild: 0,
    attuneHit: 0,
    boadiceaAmt: 0.14,
    boadiceaContour: 0.48,
    boadiceaRate: 0.22,
    cameraOrbitX: 0.5,
    cameraOrbitY: 0.5,
    cathedralAmt: 0.3,
    cathedralTime: 2.8,
    chantAmt: 0.12,
    chantFormant: 0.58,
    chantMode: 0.35,
    chantMotion: 0.24,
    chantReciteMix: 0.55,
    detune: 0.0025,
    gain: -12,
    invisibleAmt: 0,
    lockCtl: 0,
    materialAmt: 0,
    mobileRotX: 0.5,
    mobileRotY: 0.5,
    motion: 0.2,
    objectSpinCtl: 0,
    organumAmt: 0.22,
    percussionDensity: 0.38,
    percussionDrive: 0.46,
    phaserDepth: 1,
    phaserFeedback: 0.85,
    phaserMix: 0.22,
    phaserRate: 0.18,
    polyAmt: 0.25,
    polyChord: 0.35,
    polyMotion: 0.28,
    polySpread: 0.22,
    polyWarp: 0.18,
    proximityCtl: 0,
    ritualDecay: 0.42,
    ritualPercAmt: 0.08,
    ritualPulseRate: 0.72,
    ritualTone: 96,
    root: 110,
    sparkle: 0.14,
    sparkleRate: 0.25,
    sparkleTone: 0.75,
    stageCtl: 0,
    transmuteAmt: 0,
    zoomIn: 0,
    zoomOut: 0,
});

const DSP_MODE_CONTROL_KEYS = Object.freeze(Object.keys(DSP_CONTROL_DEFAULTS));

/**
 * @param {Record<string, number>} values
 * @returns {Record<string, number>}
 */
function completeModeValues(values) {
    /** @type {Record<string, number>} */
    const out = {};
    DSP_MODE_CONTROL_KEYS.forEach((key) => {
        const raw = values[key];
        const value = Number(raw);
        out[key] = Number.isFinite(value) ? value : DSP_CONTROL_DEFAULTS[key];
    });
    return Object.freeze(out);
}

/**
 * @param {string} id
 * @returns {UserPresetSlot}
 */
function createEmptyUserPresetSlot(id) {
    return {
        id,
        label: "",
        values: null,
        updatedAt: "",
        saved: false,
    };
}

/**
 * @param {string} id
 * @param {any} raw
 * @returns {UserPresetSlot}
 */
function normalizeStoredUserPresetSlot(id, raw) {
    if (!raw || typeof raw !== "object" || !raw.values || typeof raw.values !== "object") {
        return createEmptyUserPresetSlot(id);
    }
    return {
        id,
        label: typeof raw.label === "string" ? raw.label : "",
        values: completeModeValues(raw.values),
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
        saved: true,
    };
}

/**
 * @returns {UserPresetSlot[]}
 */
function readStoredUserPresetSlots() {
    const fallback = USER_PRESET_SLOT_IDS.map((id) => createEmptyUserPresetSlot(id));
    try {
        const raw = localStorage.getItem(USER_PRESET_STORAGE_KEY);
        if (typeof raw !== "string" || !raw.trim()) return fallback;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return fallback;
        const slotIndex = new Map(parsed.map((slot) => [slot?.id, slot]));
        return USER_PRESET_SLOT_IDS.map((id) => normalizeStoredUserPresetSlot(id, slotIndex.get(id)));
    } catch (error) {
        console.warn("Unable to read stored user presets:", error);
        return fallback;
    }
}

/**
 * @param {UserPresetSlot[]} slots
 */
function persistUserPresetSlots(slots) {
    try {
        const payload = Array.isArray(slots)
            ? slots.filter((slot) => slot && slot.saved && slot.values).map((slot) => ({
                id: slot.id,
                label: typeof slot.label === "string" ? slot.label : "",
                values: slot.values,
                updatedAt: slot.updatedAt,
            }))
            : [];
        localStorage.setItem(USER_PRESET_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn("Unable to persist user presets:", error);
    }
}

/**
 * @param {UserPresetSlot[]} [slots]
 * @returns {number}
 */
function countSavedUserPresetSlots(slots = userPresetSlots) {
    if (!Array.isArray(slots)) return 0;
    return slots.reduce((count, slot) => count + (slot && slot.saved && slot.values ? 1 : 0), 0);
}

/**
 * @param {any} rawSlots
 * @returns {UserPresetSlot[]}
 */
function normalizeUserPresetSlotCollection(rawSlots) {
    const slotIndex = new Map();
    if (Array.isArray(rawSlots)) {
        rawSlots.forEach((slot) => {
            if (!slot || typeof slot.id !== "string") return;
            if (!USER_PRESET_SLOT_IDS.includes(slot.id)) return;
            if (slotIndex.has(slot.id)) return;
            slotIndex.set(slot.id, slot);
        });
    }
    return USER_PRESET_SLOT_IDS.map((id) => normalizeStoredUserPresetSlot(id, slotIndex.get(id)));
}

/**
 * @param {string} text
 * @returns {string}
 */
function encodeTextToBase64Url(text) {
    const bytes = new TextEncoder().encode(String(text || ""));
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary)
        .replace(/\+/gu, "-")
        .replace(/\//gu, "_")
        .replace(/=+$/u, "");
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodeBase64UrlToText(text) {
    const normalized = String(text || "")
        .replace(/-/gu, "+")
        .replace(/_/gu, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new TextDecoder().decode(bytes);
}

/**
 * @param {UserPresetSlot[]} [slots]
 * @returns {{ type: string; version: number; exportedAt: string; slots: { id: string; values: Record<string, number>; updatedAt: string; }[] }}
 */
function buildUserPresetTransferPayload(slots = userPresetSlots) {
    const normalizedSlots = normalizeUserPresetSlotCollection(slots);
    return {
        type: USER_PRESET_TRANSFER_PAYLOAD_TYPE,
        version: USER_PRESET_TRANSFER_PAYLOAD_VERSION,
        exportedAt: new Date().toISOString(),
        slots: normalizedSlots
            .filter((slot) => slot.saved && slot.values)
            .map((slot) => ({
                id: slot.id,
                values: slot.values,
                updatedAt: slot.updatedAt,
            })),
    };
}

/**
 * @param {UserPresetSlot[]} [slots]
 * @returns {string}
 */
function createUserPresetTransferCode(slots = userPresetSlots) {
    return `${USER_PRESET_TRANSFER_CODE_PREFIX}${encodeTextToBase64Url(
        JSON.stringify(buildUserPresetTransferPayload(slots))
    )}`;
}

/**
 * @param {string} source
 * @returns {{ slots: UserPresetSlot[]; savedCount: number; }}
 */
function parseUserPresetTransferCode(source) {
    const rawText = typeof source === "string" ? source.trim() : "";
    if (!rawText) {
        throw new Error("Paste a transfer code first.");
    }

    let parsed;
    try {
        if (rawText.startsWith(USER_PRESET_TRANSFER_CODE_PREFIX)) {
            const encoded = rawText.slice(USER_PRESET_TRANSFER_CODE_PREFIX.length).trim();
            parsed = JSON.parse(decodeBase64UrlToText(encoded));
        } else {
            parsed = JSON.parse(rawText);
        }
    } catch (error) {
        throw new Error("Transfer code could not be read.");
    }

    let rawSlots = null;
    if (Array.isArray(parsed)) {
        rawSlots = parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.slots)) {
        if (typeof parsed.type === "string" && parsed.type !== USER_PRESET_TRANSFER_PAYLOAD_TYPE) {
            throw new Error("Transfer code type is not supported.");
        }
        if (
            Object.hasOwn(parsed, "version") &&
            Number(parsed.version) !== USER_PRESET_TRANSFER_PAYLOAD_VERSION
        ) {
            throw new Error("Transfer code version is not supported.");
        }
        rawSlots = parsed.slots;
    }

    if (!rawSlots) {
        throw new Error("Transfer code format was not recognized.");
    }

    const slots = normalizeUserPresetSlotCollection(rawSlots);
    return {
        slots,
        savedCount: countSavedUserPresetSlots(slots),
    };
}

/**
 * @param {any} slots
 * @returns {UserPresetSlot[]}
 */
function replaceUserPresetSlots(slots) {
    userPresetSlots = normalizeUserPresetSlotCollection(slots);
    persistUserPresetSlots(userPresetSlots);
    return userPresetSlots;
}

/** @type {UserPresetSlot[]} */
let userPresetSlots = readStoredUserPresetSlots();

/** @type {GlobalControlState} */
const globalControlState = {
    effectiveRootHz: DSP_CONTROL_DEFAULTS.root,
    transposeSemitones: 0,
    morphDurationMs: DEFAULT_GLOBAL_MORPH_DURATION_MS,
    motionIntensity: DEFAULT_MOTION_INTENSITY,
    saveModeArmed: false,
};

/**
 * @param {string} id
 * @param {string} title
 * @param {string} subtitle
 * @param {Record<string, number>} values
 * @returns {ModePreset}
 */
function createModePreset(id, title, subtitle, values) {
    return Object.freeze({
        id,
        title,
        subtitle,
        values: completeModeValues(values),
    });
}

/** @type {readonly ModePreset[]} */
const MODE_PRESETS = Object.freeze([
    createModePreset("golden_discovery", "PC.082", "BCNT.PHSD.68", {
        root: 136,
        motion: 0.31,
        detune: 0.0042,
        air: 0.038,
        sparkle: 0.39,
        sparkleRate: 0.32,
        sparkleTone: 0.9,
        invisibleAmt: 0.08,
        materialAmt: 0.16,
        transmuteAmt: 0.27,
        ascendAmt: 0.31,
        attuneHit: 0.05,
        attuneBuild: 0.36,
        chantAmt: 0.21,
        chantMode: 0.46,
        chantFormant: 0.58,
        chantMotion: 0.34,
        chantReciteMix: 0.61,
        organumAmt: 0.36,
        cathedralAmt: 0.4,
        cathedralTime: 4.2,
        boadiceaAmt: 0.26,
        boadiceaContour: 0.68,
        boadiceaRate: 0.34,
        ritualPercAmt: 0.2,
        ritualPulseRate: 1.02,
        ritualTone: 112,
        ritualDecay: 0.6,
        percussionDrive: 0.36,
        percussionDensity: 0.26,
        cameraOrbitX: 0.65,
        cameraOrbitY: 0.57,
        mobileRotX: 0.6,
        mobileRotY: 0.44,
        zoomIn: 0.44,
        zoomOut: 0.22,
        proximityCtl: 0.52,
        lockCtl: 0.34,
        stageCtl: 0.37,
        objectSpinCtl: 0.38,
        polyAmt: 0.5,
        polySpread: 0.52,
        polyChord: 0.82,
        polyMotion: 0.48,
        polyWarp: 0.42,
        ambiAmt: 0.46,
        ambiRotate: 0.6,
        ambiElev: 0.63,
        ambiWidth: 0.66,
        ambiFocus: 0.52,
        ambiSpin: 0.33,
        ambiDepth: 0.62,
        phaserRate: 0.2,
        phaserDepth: 0.64,
        phaserFeedback: 0.29,
        phaserMix: 0.26,
        gain: -13,
    }),
    createModePreset("night_sky_wonder", "ST.097", "AWID.CATH.88", {
        root: 82,
        motion: 0.07,
        detune: 0.0008,
        air: 0.074,
        sparkle: 0.58,
        sparkleRate: 0.08,
        sparkleTone: 0.97,
        invisibleAmt: 0.46,
        materialAmt: 0.08,
        transmuteAmt: 0.04,
        ascendAmt: 0.24,
        attuneHit: 0.018,
        attuneBuild: 0.03,
        chantAmt: 0.07,
        chantMode: 0.62,
        chantFormant: 0.71,
        chantMotion: 0.08,
        chantReciteMix: 0.79,
        organumAmt: 0.62,
        cathedralAmt: 0.77,
        cathedralTime: 5.9,
        boadiceaAmt: 0.08,
        boadiceaContour: 0.32,
        boadiceaRate: 0.07,
        ritualPercAmt: 0.02,
        ritualPulseRate: 0.26,
        ritualTone: 58,
        ritualDecay: 1.05,
        percussionDrive: 0.08,
        percussionDensity: 0.05,
        cameraOrbitX: 0.48,
        cameraOrbitY: 0.45,
        mobileRotX: 0.49,
        mobileRotY: 0.53,
        zoomIn: 0.63,
        zoomOut: 0.04,
        proximityCtl: 0.23,
        lockCtl: 0.58,
        stageCtl: 0.12,
        objectSpinCtl: 0.11,
        polyAmt: 0.22,
        polySpread: 0.45,
        polyChord: 0.95,
        polyMotion: 0.1,
        polyWarp: 0.06,
        ambiAmt: 0.76,
        ambiRotate: 0.42,
        ambiElev: 0.78,
        ambiWidth: 0.88,
        ambiFocus: 0.66,
        ambiSpin: 0.08,
        ambiDepth: 0.84,
        phaserRate: 0.05,
        phaserDepth: 0.27,
        phaserFeedback: -0.24,
        phaserMix: 0.08,
        gain: -17.5,
    }),
    createModePreset("ancient_forest_curiosity", "BC.081", "MATR.BRAT.71", {
        root: 74,
        motion: 0.37,
        detune: 0.0068,
        air: 0.006,
        sparkle: 0.05,
        sparkleRate: 0.09,
        sparkleTone: 0.35,
        invisibleAmt: 0.04,
        materialAmt: 0.71,
        transmuteAmt: 0.11,
        ascendAmt: 0.08,
        attuneHit: 0.064,
        attuneBuild: 0.41,
        chantAmt: 0.34,
        chantMode: 0.27,
        chantFormant: 0.39,
        chantMotion: 0.42,
        chantReciteMix: 0.33,
        organumAmt: 0.29,
        cathedralAmt: 0.14,
        cathedralTime: 2.1,
        boadiceaAmt: 0.67,
        boadiceaContour: 0.81,
        boadiceaRate: 0.71,
        ritualPercAmt: 0.39,
        ritualPulseRate: 1.22,
        ritualTone: 62,
        ritualDecay: 0.93,
        percussionDrive: 0.67,
        percussionDensity: 0.62,
        cameraOrbitX: 0.31,
        cameraOrbitY: 0.68,
        mobileRotX: 0.35,
        mobileRotY: 0.62,
        zoomIn: 0.12,
        zoomOut: 0.49,
        proximityCtl: 0.74,
        lockCtl: 0.14,
        stageCtl: 0.61,
        objectSpinCtl: 0.46,
        polyAmt: 0.28,
        polySpread: 0.23,
        polyChord: 0.18,
        polyMotion: 0.52,
        polyWarp: 0.31,
        ambiAmt: 0.29,
        ambiRotate: 0.27,
        ambiElev: 0.34,
        ambiWidth: 0.31,
        ambiFocus: 0.81,
        ambiSpin: 0.28,
        ambiDepth: 0.72,
        phaserRate: 0.27,
        phaserDepth: 0.72,
        phaserFeedback: 0.43,
        phaserMix: 0.34,
        gain: -10.8,
    }),
    createModePreset("water_memory", "AW.086", "ADEP.PHSD.80", {
        root: 146.8,
        motion: 0.14,
        detune: 0.0024,
        air: 0.05,
        sparkle: 0.2,
        sparkleRate: 0.2,
        sparkleTone: 0.68,
        invisibleAmt: 0.44,
        materialAmt: 0.34,
        transmuteAmt: 0.06,
        ascendAmt: 0.11,
        attuneHit: 0.022,
        attuneBuild: 0.07,
        chantAmt: 0.18,
        chantMode: 0.45,
        chantFormant: 0.67,
        chantMotion: 0.22,
        chantReciteMix: 0.76,
        organumAmt: 0.33,
        cathedralAmt: 0.57,
        cathedralTime: 5.1,
        boadiceaAmt: 0.19,
        boadiceaContour: 0.43,
        boadiceaRate: 0.26,
        ritualPercAmt: 0.06,
        ritualPulseRate: 0.52,
        ritualTone: 92,
        ritualDecay: 0.92,
        percussionDrive: 0.16,
        percussionDensity: 0.1,
        cameraOrbitX: 0.58,
        cameraOrbitY: 0.36,
        mobileRotX: 0.64,
        mobileRotY: 0.62,
        zoomIn: 0.46,
        zoomOut: 0.2,
        proximityCtl: 0.34,
        lockCtl: 0.5,
        stageCtl: 0.24,
        objectSpinCtl: 0.2,
        polyAmt: 0.39,
        polySpread: 0.54,
        polyChord: 0.64,
        polyMotion: 0.16,
        polyWarp: 0.14,
        ambiAmt: 0.69,
        ambiRotate: 0.56,
        ambiElev: 0.68,
        ambiWidth: 0.86,
        ambiFocus: 0.39,
        ambiSpin: 0.14,
        ambiDepth: 0.8,
        phaserRate: 0.1,
        phaserDepth: 0.74,
        phaserFeedback: -0.58,
        phaserMix: 0.36,
        gain: -15.8,
    }),
    createModePreset("crystal_cave", "PC.100", "AWID.BCNT.94", {
        root: 175,
        motion: 0.25,
        detune: 0.009,
        air: 0.08,
        sparkle: 0.72,
        sparkleRate: 0.56,
        sparkleTone: 0.98,
        invisibleAmt: 0.21,
        materialAmt: 0.04,
        transmuteAmt: 0.58,
        ascendAmt: 0.48,
        attuneHit: 0.058,
        attuneBuild: 0.22,
        chantAmt: 0.09,
        chantMode: 0.73,
        chantFormant: 0.77,
        chantMotion: 0.16,
        chantReciteMix: 0.74,
        organumAmt: 0.52,
        cathedralAmt: 0.86,
        cathedralTime: 6,
        boadiceaAmt: 0.11,
        boadiceaContour: 0.9,
        boadiceaRate: 0.18,
        ritualPercAmt: 0.04,
        ritualPulseRate: 0.36,
        ritualTone: 128,
        ritualDecay: 1.09,
        percussionDrive: 0.12,
        percussionDensity: 0.05,
        cameraOrbitX: 0.78,
        cameraOrbitY: 0.34,
        mobileRotX: 0.72,
        mobileRotY: 0.38,
        zoomIn: 0.91,
        zoomOut: 0.09,
        proximityCtl: 0.28,
        lockCtl: 0.63,
        stageCtl: 0.42,
        objectSpinCtl: 0.44,
        polyAmt: 0.61,
        polySpread: 0.7,
        polyChord: 1,
        polyMotion: 0.31,
        polyWarp: 0.64,
        ambiAmt: 0.82,
        ambiRotate: 0.66,
        ambiElev: 0.87,
        ambiWidth: 0.94,
        ambiFocus: 0.38,
        ambiSpin: 0.36,
        ambiDepth: 0.89,
        phaserRate: 0.06,
        phaserDepth: 0.85,
        phaserFeedback: 0.52,
        phaserMix: 0.4,
        gain: -18.5,
    }),
    createModePreset("childhood_memory", "CM.062", "STON.AELE.58", {
        root: 206,
        motion: 0.06,
        detune: 0.0012,
        air: 0.014,
        sparkle: 0.12,
        sparkleRate: 0.11,
        sparkleTone: 0.58,
        invisibleAmt: 0.03,
        materialAmt: 0.12,
        transmuteAmt: 0.02,
        ascendAmt: 0.03,
        attuneHit: 0.012,
        attuneBuild: 0.02,
        chantAmt: 0.05,
        chantMode: 0.22,
        chantFormant: 0.49,
        chantMotion: 0.09,
        chantReciteMix: 0.62,
        organumAmt: 0.14,
        cathedralAmt: 0.08,
        cathedralTime: 1.4,
        boadiceaAmt: 0.04,
        boadiceaContour: 0.21,
        boadiceaRate: 0.08,
        ritualPercAmt: 0.03,
        ritualPulseRate: 0.32,
        ritualTone: 70,
        ritualDecay: 0.28,
        percussionDrive: 0.08,
        percussionDensity: 0.07,
        cameraOrbitX: 0.5,
        cameraOrbitY: 0.5,
        mobileRotX: 0.5,
        mobileRotY: 0.5,
        zoomIn: 0.18,
        zoomOut: 0.02,
        proximityCtl: 0.1,
        lockCtl: 0.08,
        stageCtl: 0.07,
        objectSpinCtl: 0.04,
        polyAmt: 0.18,
        polySpread: 0.19,
        polyChord: 0.1,
        polyMotion: 0.08,
        polyWarp: 0.03,
        ambiAmt: 0.18,
        ambiRotate: 0.5,
        ambiElev: 0.52,
        ambiWidth: 0.22,
        ambiFocus: 0.6,
        ambiSpin: 0.05,
        ambiDepth: 0.24,
        phaserRate: 0.09,
        phaserDepth: 0.17,
        phaserFeedback: -0.12,
        phaserMix: 0.04,
        gain: -9.8,
    }),
    createModePreset("heroic_gentle_adventure", "PX.088", "PDRV.PMOT.82", {
        root: 123.47,
        motion: 0.43,
        detune: 0.0056,
        air: 0.031,
        sparkle: 0.35,
        sparkleRate: 0.29,
        sparkleTone: 0.78,
        invisibleAmt: 0.09,
        materialAmt: 0.13,
        transmuteAmt: 0.39,
        ascendAmt: 0.23,
        attuneHit: 0.094,
        attuneBuild: 0.64,
        chantAmt: 0.12,
        chantMode: 0.31,
        chantFormant: 0.5,
        chantMotion: 0.41,
        chantReciteMix: 0.41,
        organumAmt: 0.31,
        cathedralAmt: 0.26,
        cathedralTime: 2.7,
        boadiceaAmt: 0.21,
        boadiceaContour: 0.47,
        boadiceaRate: 0.41,
        ritualPercAmt: 0.52,
        ritualPulseRate: 1.62,
        ritualTone: 126,
        ritualDecay: 0.61,
        percussionDrive: 0.82,
        percussionDensity: 0.77,
        cameraOrbitX: 0.67,
        cameraOrbitY: 0.69,
        mobileRotX: 0.62,
        mobileRotY: 0.33,
        zoomIn: 0.18,
        zoomOut: 0.72,
        proximityCtl: 0.86,
        lockCtl: 0.29,
        stageCtl: 0.88,
        objectSpinCtl: 0.71,
        polyAmt: 0.59,
        polySpread: 0.58,
        polyChord: 0.36,
        polyMotion: 0.72,
        polyWarp: 0.35,
        ambiAmt: 0.52,
        ambiRotate: 0.6,
        ambiElev: 0.42,
        ambiWidth: 0.67,
        ambiFocus: 0.62,
        ambiSpin: 0.49,
        ambiDepth: 0.53,
        phaserRate: 0.27,
        phaserDepth: 0.71,
        phaserFeedback: 0.44,
        phaserMix: 0.22,
        gain: -13.5,
    }),
]);

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * @param {number} from
 * @param {number} to
 * @param {number} amount
 * @returns {number}
 */
function interpolateValue(from, to, amount) {
    return from + (to - from) * amount;
}

/**
 * @returns {{ tiltX: number; tiltY: number; gyroPitch: number; gyroRoll: number; gyroSpin: number; }}
 */
function createMotionSignalState() {
    return {
        tiltX: 0.5,
        tiltY: 0.5,
        gyroPitch: 0.5,
        gyroRoll: 0.5,
        gyroSpin: 0.5,
    };
}

/**
 * @returns {boolean}
 */
function canUseTouchHaptics() {
    return hasNativeVibrationSupport() || typeof document !== "undefined";
}

/**
 * @returns {boolean}
 */
function hasNativeVibrationSupport() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * @typedef {{
 *   duration: number;
 *   delay?: number;
 *   intensity?: number;
 * }} HapticStep
 */

/**
 * Stops any running fallback pulse pattern.
 */
function stopFallbackHapticPattern() {
    fallbackPatternToken += 1;
    if (!fallbackPatternFrame) return;
    cancelAnimationFrame(fallbackPatternFrame);
    fallbackPatternFrame = 0;
}

/**
 * @param {HapticStep[] | null | undefined} steps
 * @returns {HapticStep[]}
 */
function normalizeHapticSteps(steps) {
    if (!Array.isArray(steps)) return [];
    return steps
        .map((step) => {
            if (!step || typeof step !== "object") return null;
            const duration = Math.max(1, Math.round(Number(step.duration) || 0));
            const delay = Math.max(0, Math.round(Number(step.delay) || 0));
            const intensity = clamp(Number(step.intensity ?? HAPTIC_TEST_DEFAULT_INTENSITY), 0, 1);
            if (!Number.isFinite(duration) || duration <= 0) return null;
            return {
                duration,
                ...(delay > 0 ? { delay } : {}),
                intensity,
            };
        })
        .filter((step) => step !== null);
}

/**
 * @param {HapticStep[]} steps
 * @returns {number[]}
 */
function toNativeVibratePattern(steps) {
    /** @type {number[]} */
    const out = [];
    steps.forEach((step, index) => {
        const delay = Math.max(0, Math.round(Number(step.delay) || 0));
        const duration = Math.max(1, Math.round(Number(step.duration) || 0));
        if (index === 0) {
            if (delay > 0) out.push(delay);
            out.push(duration);
            return;
        }
        out.push(delay, duration);
    });
    return out.length > 0 ? out : [16];
}

/**
 * @returns {boolean}
 */
function clickFallbackSwitch() {
    const fallbackSwitch = ensureIOSHapticFallbackSwitch();
    if (!fallbackSwitch) return false;
    fallbackSwitch.label.click();
    fallbackSwitch.input.click();
    return true;
}

/**
 * @returns {{ input: HTMLInputElement; label: HTMLLabelElement } | null}
 */
function ensureIOSHapticFallbackSwitch() {
    if (iosHapticFallbackSwitch) return iosHapticFallbackSwitch;
    if (typeof document === "undefined" || !document.body) return null;
    let label = document.querySelector(`label[for="${IOS_HAPTIC_FALLBACK_SWITCH_ID}"]`);
    if (!(label instanceof HTMLLabelElement)) {
        label = document.createElement("label");
        label.setAttribute("for", IOS_HAPTIC_FALLBACK_SWITCH_ID);
        label.textContent = "Haptic feedback";
        label.style.position = "fixed";
        label.style.left = "-9999px";
        label.style.top = "0";
        label.style.width = "1px";
        label.style.height = "1px";
        label.style.opacity = "0";
        label.style.pointerEvents = "none";
        label.style.overflow = "hidden";
        document.body.appendChild(label);
    }
    let input = label.querySelector("input");
    if (!(input instanceof HTMLInputElement)) {
        const existingInput = document.getElementById(IOS_HAPTIC_FALLBACK_SWITCH_ID);
        if (existingInput instanceof HTMLInputElement) {
            input = existingInput;
        } else {
            input = document.createElement("input");
            input.type = "checkbox";
            input.id = IOS_HAPTIC_FALLBACK_SWITCH_ID;
            input.setAttribute("switch", "");
        }
        input.style.all = "initial";
        input.style.appearance = "auto";
        input.style.webkitAppearance = "auto";
        input.style.position = "absolute";
        input.style.left = "0";
        input.style.top = "0";
        input.style.width = "1px";
        input.style.height = "1px";
        input.style.opacity = "0";
        input.style.pointerEvents = "none";
        label.appendChild(input);
    }
    iosHapticFallbackSwitch = { input, label };
    return iosHapticFallbackSwitch;
}

/**
 * @returns {boolean}
 */
function primeIOSHapticFallback() {
    return clickFallbackSwitch();
}

/**
 * @param {HapticStep[]} steps
 * @param {number} defaultIntensity
 * @param {boolean} firstClickFired
 */
function runFallbackPulsePattern(steps, defaultIntensity, firstClickFired) {
    stopFallbackHapticPattern();
    if (steps.length === 0) return;
    const token = fallbackPatternToken;
    const phases = [];
    let totalDuration = 0;
    steps.forEach((step) => {
        const delay = Math.max(0, Number(step.delay) || 0);
        const duration = Math.max(1, Number(step.duration) || 0);
        const intensity = clamp(Number(step.intensity ?? defaultIntensity), 0, 1);
        if (delay > 0) {
            totalDuration += delay;
            phases.push({ end: totalDuration, on: false, intensity: 0 });
        }
        totalDuration += duration;
        phases.push({ end: totalDuration, on: true, intensity });
    });
    if (phases.length === 0 || totalDuration <= 0) return;

    let startTime = 0;
    let lastToggleAt = -1;
    let hasFiredFirstClick = firstClickFired;
    const frame = (now) => {
        if (token !== fallbackPatternToken) return;
        if (startTime === 0) startTime = now;
        const elapsed = now - startTime;
        if (elapsed >= totalDuration) {
            fallbackPatternFrame = 0;
            return;
        }
        const phase = phases.find((entry) => elapsed < entry.end) || phases[phases.length - 1];
        if (phase && phase.on) {
            const toggleInterval = HAPTIC_FALLBACK_TOGGLE_MIN_MS
                + (1 - clamp(phase.intensity, 0, 1)) * HAPTIC_FALLBACK_TOGGLE_RANGE_MS;
            if (!hasFiredFirstClick) {
                clickFallbackSwitch();
                hasFiredFirstClick = true;
                lastToggleAt = now;
            } else if (lastToggleAt < 0 || now - lastToggleAt >= toggleInterval) {
                clickFallbackSwitch();
                lastToggleAt = now;
            }
        }
        fallbackPatternFrame = requestAnimationFrame(frame);
    };
    fallbackPatternFrame = requestAnimationFrame(frame);
}

/**
 * @param {HapticStep[] | null | undefined} stepsIn
 * @param {{ defaultIntensity?: number }} [options]
 * @returns {boolean}
 */
function triggerTouchHapticPattern(stepsIn, options = {}) {
    const steps = normalizeHapticSteps(stepsIn);
    if (steps.length === 0) return false;
    const defaultIntensity = clamp(Number(options.defaultIntensity ?? HAPTIC_TEST_DEFAULT_INTENSITY), 0, 1);
    let fired = false;
    if (hasNativeVibrationSupport()) {
        navigator.vibrate(toNativeVibratePattern(steps));
        fired = true;
    }
    const firstDelay = Math.max(0, Number(steps[0].delay) || 0);
    const firstClickFired = firstDelay === 0 && clickFallbackSwitch();
    if (firstClickFired) fired = true;
    runFallbackPulsePattern(steps, defaultIntensity, firstClickFired);
    return fired;
}

/**
 * @param {number} durationMs
 * @returns {boolean}
 */
function triggerTouchHapticTick(durationMs) {
    const duration = Math.max(1, Math.floor(Number(durationMs) || PRESET_HAPTIC_TICK_DURATION_MS));
    let fired = false;
    if (hasNativeVibrationSupport()) {
        navigator.vibrate(duration);
        fired = true;
    }
    for (let i = 0; i < HAPTIC_FALLBACK_TICK_BURST_COUNT; i += 1) {
        if (clickFallbackSwitch()) {
            fired = true;
        }
    }
    return fired;
}

/**
 * @param {any[]} items
 * @param {DSPControl[]} [out]
 * @returns {DSPControl[]}
 */
function collectDSPControls(items, out = []) {
    if (!Array.isArray(items)) return out;
    items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        if (Array.isArray(item.items)) {
            collectDSPControls(item.items, out);
            return;
        }
        if (!["hslider", "vslider", "nentry"].includes(item.type)) return;
        if (typeof item.address !== "string") return;
        const min = Number(item.min);
        const max = Number(item.max);
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
        const init = Number(item.init);
        const step = Number(item.step);
        out.push({
            address: item.address,
            type: String(item.type || "hslider"),
            min,
            max,
            init: Number.isFinite(init) ? init : min,
            step: Number.isFinite(step) && step > 0 ? step : NaN,
        });
    });
    return out;
}

/**
 * @param {string} address
 * @returns {string}
 */
function controlKeyFromAddress(address) {
    if (typeof address !== "string") return "";
    const key = address.slice(address.lastIndexOf("/") + 1);
    return key.toLowerCase();
}

/**
 * @param {DSPControl[]} controls
 */
function setDSPControls(controls) {
    dspControls = Array.isArray(controls) ? controls : [];
    dspControlIndex = new Map();
    const nextParamValueMap = new Map();
    dspControls.forEach((control) => {
        if (!control || typeof control.address !== "string") return;
        const full = control.address.toLowerCase();
        const short = controlKeyFromAddress(control.address);
        dspControlIndex.set(full, control);
        if (short) dspControlIndex.set(short, control);
        const remembered = currentParamValueMap.get(control.address);
        nextParamValueMap.set(
            control.address,
            Number.isFinite(remembered) ? quantizeControlValue(control, remembered) : quantizeControlValue(control, control.init)
        );
    });
    currentParamValueMap = nextParamValueMap;
}

/**
 * @param {string} key
 * @returns {DSPControl | null}
 */
function getDSPControl(key) {
    if (typeof key !== "string" || !key.trim()) return null;
    return dspControlIndex.get(key.toLowerCase()) || null;
}

/**
 * @param {DSPControl} control
 * @param {number} rawValue
 * @returns {number}
 */
function quantizeControlValue(control, rawValue) {
    const bounded = clamp(rawValue, control.min, control.max);
    if (control.type === "int") {
        return clamp(Math.round(bounded), control.min, control.max);
    }
    if (Number.isFinite(control.step) && control.step > 0) {
        const steps = Math.round((bounded - control.min) / control.step);
        return clamp(control.min + steps * control.step, control.min, control.max);
    }
    return bounded;
}

/**
 * @param {string} path
 * @param {number} value
 * @returns {number | null}
 */
function rememberParamValue(path, value) {
    if (typeof path !== "string" || !Number.isFinite(value)) return null;
    const control = getDSPControl(path);
    const next = control ? quantizeControlValue(control, value) : Number(value);
    currentParamValueMap.set(control?.address || path, next);
    return next;
}

function attachParamValueObserver() {
    if (typeof paramValueObserverCleanup === "function") {
        paramValueObserverCleanup();
        paramValueObserverCleanup = null;
    }
    if (!faustUIBridge || typeof faustUIBridge.subscribeToParamChanges !== "function") return;
    paramValueObserverCleanup = faustUIBridge.subscribeToParamChanges((path, value) => {
        rememberParamValue(path, value);
    });
}

/**
 * @param {DSPControl | null | undefined} control
 * @returns {boolean}
 */
function isRootControl(control) {
    return !!control && controlKeyFromAddress(control.address) === ROOT_CONTROL_KEY;
}

/**
 * @param {number} semitones
 * @returns {number}
 */
function getSemitoneRatio(semitones) {
    return Math.pow(2, Number(semitones || 0) / 12);
}

/**
 * @returns {DSPControl | null}
 */
function getRootDSPControl() {
    return getDSPControl(ROOT_CONTROL_KEY);
}

/**
 * @returns {DSPControl | null}
 */
function getGainDSPControl() {
    return getDSPControl(GAIN_CONTROL_KEY);
}

/**
 * @param {number} baseValue
 * @param {number} [transposeSemitones]
 * @returns {number}
 */
function getEffectiveRootHzFromBase(baseValue, transposeSemitones = globalControlState.transposeSemitones) {
    const control = getRootDSPControl();
    const ratio = getSemitoneRatio(transposeSemitones);
    const next = Number(baseValue) * ratio;
    if (!control) return next;
    return quantizeControlValue(control, next);
}

/**
 * @param {number} effectiveValue
 * @param {number} [transposeSemitones]
 * @returns {number}
 */
function getUnderlyingRootHzFromEffective(effectiveValue, transposeSemitones = globalControlState.transposeSemitones) {
    const control = getRootDSPControl();
    const ratio = getSemitoneRatio(transposeSemitones);
    const next = ratio === 0 ? Number(effectiveValue) : Number(effectiveValue) / ratio;
    if (!control) return next;
    return quantizeControlValue(control, next);
}

/**
 * @param {DSPControl} control
 * @param {number} rawValue
 * @returns {number}
 */
function resolveTargetControlValue(control, rawValue) {
    if (!control) return Number(rawValue);
    if (isRootControl(control)) {
        return getEffectiveRootHzFromBase(rawValue);
    }
    return quantizeControlValue(control, rawValue);
}

/**
 * @param {DSPControl} control
 * @param {number} rawValue
 * @returns {number}
 */
function serializeCurrentControlValue(control, rawValue) {
    if (!control) return Number(rawValue);
    if (isRootControl(control)) {
        return getUnderlyingRootHzFromEffective(rawValue);
    }
    return quantizeControlValue(control, rawValue);
}

/**
 * @param {DSPControl} control
 * @returns {number}
 */
function randomizeControlValue(control) {
    if (control.type === "int") {
        const low = Math.ceil(control.min);
        const high = Math.floor(control.max);
        const randomInt = low + Math.floor(Math.random() * (high - low + 1));
        return clamp(randomInt, control.min, control.max);
    }
    if (Number.isFinite(control.step) && control.step > 0) {
        const stepCount = Math.max(1, Math.floor((control.max - control.min) / control.step));
        const stepIndex = Math.floor(Math.random() * (stepCount + 1));
        return clamp(control.min + stepIndex * control.step, control.min, control.max);
    }
    return control.min + Math.random() * (control.max - control.min);
}

/**
 * @param {DSPControl} control
 * @returns {number}
 */
function zeroOutControlValue(control) {
    const target = (control.min <= 0 && control.max >= 0) ? 0 : control.min;
    return quantizeControlValue(control, target);
}

/**
 * @param {{ path: string; value: number }[]} entries
 */
function applyParamValues(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const rootControl = getRootDSPControl();
    const rootPath = rootControl?.address;
    entries.forEach(({ path, value }) => {
        rememberParamValue(path, value);
        if (typeof path === "string" && path === rootPath && Number.isFinite(value)) {
            setEffectiveRootState(value);
        }
    });
    if (faustUIBridge && typeof faustUIBridge.setParamValues === "function") {
        faustUIBridge.setParamValues(entries);
        return;
    }
    entries.forEach(({ path, value }) => {
        if (typeof path !== "string" || !Number.isFinite(value)) return;
        faustNode?.setParamValue(path, value);
    });
}

/**
 * @returns {{ path: string; value: number }[]}
 */
function snapshotCurrentParamValues() {
    if (!faustNode || typeof faustNode.getParamValue !== "function") return [];
    return dspControls.map((control) => {
        const current = faustNode.getParamValue(control.address);
        const value = Number.isFinite(current) ? current : control.init;
        return {
            path: control.address,
            value: quantizeControlValue(control, value),
        };
    });
}

/**
 * @returns {Map<string, number>}
 */
function snapshotCurrentParamMap() {
    const map = new Map();
    snapshotCurrentParamValues().forEach(({ path, value }) => {
        map.set(path, value);
    });
    return map;
}

/**
 * @returns {Record<string, number>}
 */
function snapshotCurrentPresetValues() {
    /** @type {Record<string, number>} */
    const values = {};
    DSP_MODE_CONTROL_KEYS.forEach((key) => {
        const control = getDSPControl(key);
        if (!control) {
            values[key] = DSP_CONTROL_DEFAULTS[key];
            return;
        }
        values[key] = serializeCurrentControlValue(control, getCurrentControlValue(control));
    });
    return completeModeValues(values);
}

/**
 * @param {{ path: string; value: number; control: DSPControl }[]} targets
 * @param {Map<string, number>} baseline
 * @param {number} amount
 * @returns {{ path: string; value: number }[]}
 */
function buildPresetMorphEntries(targets, baseline, amount) {
    const mix = clamp(amount, 0, 1);
    return targets.map((target) => {
        const rawFrom = baseline?.get(target.path);
        const from = Number.isFinite(rawFrom) ? rawFrom : getCurrentControlValue(target.control);
        const targetValue = resolveTargetControlValue(target.control, target.value);
        const value = quantizeControlValue(
            target.control,
            from + (targetValue - from) * mix
        );
        return { path: target.path, value };
    });
}

/**
 * @param {number} value
 * @returns {number}
 */
function setEffectiveRootState(value) {
    const control = getRootDSPControl();
    const numeric = Number(value);
    const next = control ? quantizeControlValue(control, numeric) : numeric;
    if (Number.isFinite(next)) {
        globalControlState.effectiveRootHz = next;
    }
    return globalControlState.effectiveRootHz;
}

/**
 * @param {number} value
 * @returns {number}
 */
function setGlobalMorphDuration(value) {
    const numeric = Number(value);
    const source = Number.isFinite(numeric) ? numeric : DEFAULT_GLOBAL_MORPH_DURATION_MS;
    const next = clamp(
        Math.round(source / GLOBAL_MORPH_STEP_MS) * GLOBAL_MORPH_STEP_MS,
        0,
        MAX_GLOBAL_MORPH_DURATION_MS
    );
    globalControlState.morphDurationMs = next;
    return next;
}

/**
 * @param {number} value
 * @returns {number}
 */
function setGlobalMotionIntensity(value) {
    const numeric = Number(value);
    const next = clamp(
        Number.isFinite(numeric) ? numeric : DEFAULT_MOTION_INTENSITY,
        MOTION_INTENSITY_MIN,
        MOTION_INTENSITY_MAX
    );
    globalControlState.motionIntensity = next;
    return next;
}

/**
 * @returns {{
 *   normalized: number;
 *   rangeScale: number;
 *   spanMultiplier: number;
 *   smoothing: number;
 *   gyroDecay: number;
 *   accelerationBlend: number;
 *   accelerationDecay: number;
 * }}
 */
function getMotionIntensityProfile() {
    const numeric = Number(globalControlState.motionIntensity);
    const normalized = clamp(
        Number.isFinite(numeric) ? numeric : DEFAULT_MOTION_INTENSITY,
        MOTION_INTENSITY_MIN,
        MOTION_INTENSITY_MAX
    );
    const shaped = normalized * normalized * (3 - 2 * normalized);
    return {
        normalized,
        rangeScale: interpolateValue(1.65, 0.35, shaped),
        spanMultiplier: interpolateValue(0.42, 1.58, shaped),
        smoothing: interpolateValue(0.14, 0.42, shaped),
        gyroDecay: interpolateValue(0.03, 0.13, shaped),
        accelerationBlend: interpolateValue(0.12, 0.36, shaped),
        accelerationDecay: interpolateValue(0.95, 0.81, shaped),
    };
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatMotionIntensityLabel(value) {
    const numeric = clamp(
        Number.isFinite(Number(value)) ? Number(value) : DEFAULT_MOTION_INTENSITY,
        MOTION_INTENSITY_MIN,
        MOTION_INTENSITY_MAX
    );
    if (numeric <= 0.16) return "CALM";
    if (numeric <= 0.38) return "SOFT";
    if (numeric <= 0.62) return "LIVE";
    if (numeric <= 0.84) return "WILD";
    return "MAX";
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatMotionIntensityAriaText(value) {
    const numeric = clamp(
        Number.isFinite(Number(value)) ? Number(value) : DEFAULT_MOTION_INTENSITY,
        MOTION_INTENSITY_MIN,
        MOTION_INTENSITY_MAX
    );
    return `${Math.round(numeric * 100)} percent, ${formatMotionIntensityLabel(numeric).toLowerCase()} motion sensitivity`;
}

/**
 * @param {string} slotId
 * @returns {UserPresetSlot | null}
 */
function getUserPresetSlot(slotId) {
    return userPresetSlots.find((slot) => slot.id === slotId) || null;
}

/**
 * @param {string} slotId
 * @param {Record<string, number>} values
 * @returns {UserPresetSlot | null}
 */
function saveUserPresetSlot(slotId, values) {
    const slot = getUserPresetSlot(slotId);
    if (!slot) return null;
    slot.values = completeModeValues(values);
    slot.updatedAt = new Date().toISOString();
    slot.saved = true;
    persistUserPresetSlots(userPresetSlots);
    return slot;
}

/**
 * @param {string} slotId
 * @returns {Record<string, number> | null}
 */
function getUserPresetValues(slotId) {
    const slot = getUserPresetSlot(slotId);
    return slot && slot.saved && slot.values ? slot.values : null;
}

function mountFooterPresetTransferConsole() {
    const $footer = document.getElementById("site-footer");
    const $panel = document.getElementById("footer-console-panel");
    const $stage = document.getElementById("footer-console-stage");
    const $boot = document.getElementById("footer-console-boot");
    const $toggle = document.getElementById("footer-console-toggle");
    const $status = document.getElementById("footer-console-status");
    const $textarea = document.getElementById("footer-console-textarea");
    const $export = document.getElementById("footer-console-export");
    const $copy = document.getElementById("footer-console-copy");
    const $paste = document.getElementById("footer-console-paste");
    const $load = document.getElementById("footer-console-load");
    const $clear = document.getElementById("footer-console-clear");

    if (
        !($footer instanceof HTMLElement) ||
        !($panel instanceof HTMLElement) ||
        !($stage instanceof HTMLElement) ||
        !($boot instanceof HTMLElement) ||
        !($toggle instanceof HTMLButtonElement) ||
        !($status instanceof HTMLElement) ||
        !($textarea instanceof HTMLTextAreaElement) ||
        !($export instanceof HTMLButtonElement) ||
        !($copy instanceof HTMLButtonElement) ||
        !($paste instanceof HTMLButtonElement) ||
        !($load instanceof HTMLButtonElement) ||
        !($clear instanceof HTMLButtonElement)
    ) {
        return;
    }

    const $focusables = [$textarea, $export, $copy, $paste, $load, $clear];
    const bootState = {
        timer: 0,
        frame: 0,
    };

    const fitBootText = (value, width) => {
        const normalized = String(value || "");
        if (width <= 0) return "";
        if (normalized.length <= width) return normalized.padEnd(width, " ");
        if (width <= 1) return normalized.slice(0, width);
        return `${normalized.slice(0, width - 1)}~`;
    };

    const getBootInnerWidth = () => {
        const stageWidthPx = Math.max($stage.clientWidth, $textarea.clientWidth, 0);
        const fontSizePx = parseFloat(window.getComputedStyle($boot).fontSize) || 8;
        const charWidthPx = Math.max(5.2, fontSizePx * 0.62);
        return clamp(Math.floor((stageWidthPx - 30) / charWidthPx), 28, 58);
    };

    const getBootTickerWindow = (width, offset) => {
        if (width <= 0) return "";
        const source = `   ${FOOTER_CONSOLE_BOOT_TICKER}   `;
        const start = ((offset % source.length) + source.length) % source.length;
        const repeated = source.repeat(Math.max(3, Math.ceil((start + width) / source.length) + 1));
        return repeated.slice(start, start + width).padEnd(width, " ");
    };

    const renderBootFrame = () => {
        const innerWidth = getBootInnerWidth();
        const borderPulse = bootState.frame % 12 < 6 ? "-" : "=";
        const topBorder = `.${borderPulse.repeat(innerWidth + 2)}.`;
        const bottomBorder = `'${borderPulse.repeat(innerWidth + 2)}'`;
        const revealCount = Math.min(
            FOOTER_CONSOLE_BOOT_MESSAGES.length,
            Math.floor(bootState.frame / 2)
        );
        const partialIndex = revealCount < FOOTER_CONSOLE_BOOT_MESSAGES.length ? revealCount : -1;
        const partialSource = partialIndex >= 0 ? FOOTER_CONSOLE_BOOT_MESSAGES[partialIndex] : "";
        const partialLength = partialIndex >= 0
            ? Math.min(
                partialSource.length,
                Math.floor(partialSource.length * (((bootState.frame % 2) + 1) * 0.46))
            )
            : 0;
        const bootLines = FOOTER_CONSOLE_BOOT_MESSAGES.map((line, index) => {
            let visibleLine = "";
            if (index < revealCount) {
                visibleLine = line;
            } else if (index === partialIndex) {
                visibleLine = `${partialSource.slice(0, partialLength)}${bootState.frame % 6 < 3 ? "_" : " "}`;
            }
            return `| ${fitBootText(visibleLine, innerWidth)} |`;
        });
        const commandRevealLead = Math.max(0, bootState.frame - (FOOTER_CONSOLE_BOOT_MESSAGES.length * 2));
        const commandLines = FOOTER_CONSOLE_BOOT_COMMAND_HINTS.map((line, index) => {
            const revealFrame = commandRevealLead - (index * 2);
            let visibleLine = "";
            if (revealFrame >= 2) {
                visibleLine = line;
            } else if (revealFrame >= 0) {
                const partialLineLength = Math.min(
                    line.length,
                    Math.max(1, Math.floor(line.length * ((revealFrame + 1) * 0.46)))
                );
                visibleLine = `${line.slice(0, partialLineLength)}${bootState.frame % 6 < 3 ? "_" : " "}`;
            }
            return `| ${fitBootText(visibleLine, innerWidth)} |`;
        });
        const tickerLead = [">", "}", "]", ">", ":", ">"][bootState.frame % 6];
        const tickerLine = fitBootText(
            `${tickerLead} ${getBootTickerWindow(Math.max(0, innerWidth - 2), bootState.frame)}`,
            innerWidth + 4
        );
        $boot.textContent = [
            topBorder,
            ...bootLines,
            ...commandLines,
            bottomBorder,
            tickerLine,
        ].join("\n");
    };

    const stopBootAnimation = () => {
        if (bootState.timer) {
            window.clearInterval(bootState.timer);
            bootState.timer = 0;
        }
    };

    const startBootAnimation = ({ restart = false } = {}) => {
        if (restart) {
            bootState.frame = 0;
        }
        renderBootFrame();
        if (bootState.timer) return;
        bootState.timer = window.setInterval(() => {
            bootState.frame = (bootState.frame + 1) % 4096;
            renderBootFrame();
        }, FOOTER_CONSOLE_BOOT_FRAME_MS);
    };

    const syncBootAnimation = ({ restart = false } = {}) => {
        const shouldShow = $footer.dataset.consoleOpen === "1" && !$textarea.value.trim();
        $stage.dataset.bootVisible = shouldShow ? "1" : "0";
        if (!shouldShow) {
            stopBootAnimation();
            return;
        }
        startBootAnimation({ restart });
    };

    const setStatus = (message, tone = "idle") => {
        $status.textContent = message;
        $status.dataset.tone = tone;
    };

    const syncActionState = () => {
        const hasText = !!$textarea.value.trim();
        $copy.disabled = !hasText;
        $load.disabled = !hasText;
        $clear.disabled = !hasText;
        syncBootAnimation();
    };

    const setConsoleOpen = (open, options = {}) => {
        const focusTextarea = !!options.focusTextarea;
        const restartBoot = !!options.restartBoot;
        $footer.dataset.consoleOpen = open ? "1" : "0";
        $toggle.setAttribute("aria-expanded", open ? "true" : "false");
        $toggle.title = open ? "Hide preset transfer console" : "Show preset transfer console";
        $toggle.setAttribute("aria-label", open ? "Hide preset transfer console" : "Show preset transfer console");
        $panel.setAttribute("aria-hidden", open ? "false" : "true");
        $focusables.forEach((element) => {
            element.tabIndex = open ? 0 : -1;
        });
        if (!open && $panel.contains(document.activeElement)) {
            $toggle.focus({ preventScroll: true });
        }
        if (open && focusTextarea) {
            requestAnimationFrame(() => {
                $textarea.focus({ preventScroll: true });
                $textarea.select();
            });
        }
        syncBootAnimation({ restart: open && restartBoot });
    };

    const setIdleStatus = () => {
        const savedCount = countSavedUserPresetSlots();
        const suffix = savedCount === 1 ? "" : "s";
        if (savedCount > 0) {
            setStatus(`${savedCount} saved user preset${suffix} ready. EXPORT writes transfer code. See /help and /record in the boot feed.`, "idle");
            return;
        }
        setStatus("No saved user presets yet. EXPORT writes an empty bank. See /help and /record in the boot feed.", "idle");
    };

    refreshFooterPresetTransferConsoleUI = () => {
        syncActionState();
        if ($textarea.value.trim()) return;
        setIdleStatus();
    };

    if ($footer.dataset.transferConsoleMounted === "1") {
        refreshFooterPresetTransferConsoleUI();
        return;
    }
    $footer.dataset.transferConsoleMounted = "1";

    const copyConsoleText = async () => {
        const text = $textarea.value.trim();
        if (!text) {
            throw new Error("Nothing to copy yet.");
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(text);
            return;
        }
        $textarea.focus({ preventScroll: true });
        $textarea.select();
        const didCopy = typeof document.execCommand === "function" && document.execCommand("copy");
        if (!didCopy) {
            throw new Error("Clipboard access is unavailable.");
        }
    };

    const focusTextareaForManualPaste = () => {
        setConsoleOpen(true);
        $textarea.focus({ preventScroll: true });
        const position = $textarea.value.length;
        if (typeof $textarea.setSelectionRange === "function") {
            $textarea.setSelectionRange(position, position);
        }
    };

    const pasteConsoleText = async () => {
        if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
            focusTextareaForManualPaste();
            throw new Error("Clipboard access is unavailable. Paste manually into the field.");
        }
        let text = "";
        try {
            text = await Promise.race([
                navigator.clipboard.readText(),
                new Promise((_, reject) => {
                    window.setTimeout(() => reject(new Error("Clipboard access is unavailable. Paste manually into the field.")), 900);
                }),
            ]);
        } catch (error) {
            focusTextareaForManualPaste();
            throw error instanceof Error ? error : new Error("Clipboard access is unavailable. Paste manually into the field.");
        }
        if (!text.trim()) {
            throw new Error("Clipboard is empty.");
        }
        $textarea.value = text;
        syncActionState();
        setConsoleOpen(true);
        $textarea.focus({ preventScroll: true });
        setStatus("Pasted transfer code from clipboard. Click LOAD to import it.", "success");
    };

    $toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const shouldOpen = $footer.dataset.consoleOpen !== "1";
        const shouldBoot = shouldOpen && !$textarea.value.trim();
        setConsoleOpen(shouldOpen, {
            focusTextarea: shouldBoot,
            restartBoot: shouldBoot,
        });
        refreshFooterPresetTransferConsoleUI();
    });

    $export.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const savedCount = countSavedUserPresetSlots();
        $textarea.value = createUserPresetTransferCode();
        syncActionState();
        setConsoleOpen(true, { focusTextarea: true });
        setStatus(`Generated transfer code for ${savedCount} saved user preset${savedCount === 1 ? "" : "s"}.`, "success");
    });

    $copy.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            await copyConsoleText();
            setStatus("Transfer code copied to clipboard.", "success");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Unable to copy transfer code.", "error");
        }
    });

    $paste.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            await pasteConsoleText();
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Unable to paste transfer code.", "error");
        }
    });

    $load.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
            const { slots, savedCount } = parseUserPresetTransferCode($textarea.value);
            const replaceMessage = savedCount > 0
                ? `Replace all user preset slots with ${savedCount} imported preset${savedCount === 1 ? "" : "s"}?`
                : "Replace all user preset slots with the imported empty preset bank?";
            if (!window.confirm(replaceMessage)) {
                return;
            }
            replaceUserPresetSlots(slots);
            globalControlState.saveModeArmed = false;
            refreshUserPresetButtonsUIExternal();
            $textarea.value = createUserPresetTransferCode();
            syncActionState();
            setConsoleOpen(true);
            if (savedCount > 0) {
                setStatus(`Loaded ${savedCount} user preset${savedCount === 1 ? "" : "s"} from transfer code.`, "success");
            } else {
                setStatus("Loaded an empty user preset bank.", "success");
            }
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Unable to load transfer code.", "error");
        }
    });

    $clear.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        $textarea.value = "";
        syncBootAnimation({ restart: true });
        refreshFooterPresetTransferConsoleUI();
        $textarea.focus({ preventScroll: true });
    });

    $textarea.addEventListener("input", () => {
        syncActionState();
        if (!$textarea.value.trim()) {
            syncBootAnimation({ restart: true });
            setIdleStatus();
            return;
        }
        setStatus("Transfer code ready. Click LOAD to replace the current user preset bank.", "active");
    });

    setConsoleOpen(false);
    refreshFooterPresetTransferConsoleUI();
}

/**
 * @param {number} value
 * @returns {number}
 */
function setGlobalTransposeSemitones(value) {
    const next = clamp(
        Math.round(Number(value || 0) / GLOBAL_TRANSPOSE_STEP) * GLOBAL_TRANSPOSE_STEP,
        GLOBAL_TRANSPOSE_MIN,
        GLOBAL_TRANSPOSE_MAX
    );
    const baseRoot = getUnderlyingRootHzFromEffective(
        globalControlState.effectiveRootHz,
        globalControlState.transposeSemitones
    );
    globalControlState.transposeSemitones = next;
    const rootControl = getRootDSPControl();
    if (rootControl) {
        applyParamValues([{
            path: rootControl.address,
            value: getEffectiveRootHzFromBase(baseRoot, next),
        }]);
    }
    return globalControlState.transposeSemitones;
}

async function waitForNextPaint(frames = 1) {
    const count = Math.max(1, Math.round(Number(frames) || 1));
    for (let index = 0; index < count; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
}

async function resetAudioEngine() {
    cancelModeMorph();
    const shouldResume = audioActivated || audioContext.state === "running";
    const shouldRestoreMIDI = midiInputState.active;
    const shouldRestoreLiveInput = liveInputState.active;
    const snapshot = snapshotCurrentParamValues();

    try {
        await deactivateAudioMIDISensors();
    } catch (error) {
        console.warn("Audio deactivation during reset reported an error:", error);
    }

    if (faustNode) {
        try {
            faustNode.disconnect();
        } catch (error) {
            console.warn("Unable to disconnect previous Faust node during reset:", error);
        }
        if (typeof faustNode.destroy === "function") {
            try {
                await faustNode.destroy();
            } catch (error) {
                console.warn("Unable to destroy previous Faust node during reset:", error);
            }
        }
    }

    if ($divFaustUI instanceof HTMLElement) {
        $divFaustUI.innerHTML = "";
    }

    midiHandlersBound = false;
    audioGraphConnected = false;
    audioActivated = false;
    activationInFlight = null;
    if (typeof paramValueObserverCleanup === "function") {
        paramValueObserverCleanup();
        paramValueObserverCleanup = null;
    }
    faustUIBridge = null;

    const { createFaustNode, createFaustUI } = await import(CREATE_NODE_MODULE_SPEC);
    const result = await createFaustNode(audioContext, "osc", FAUST_DSP_VOICES);
    if (!result.faustNode) throw new Error("Faust DSP reset failed: node was not created.");
    faustNode = result.faustNode;
    setDSPControls(collectDSPControls(faustNode.getUI(), []));

    faustUIBridge = await createFaustUI($divFaustUI, faustNode);
    attachParamValueObserver();
    mountHUDControls();
    applyParamValues(snapshot);
    await waitForNextPaint(2);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    applyParamValues(snapshot);

    if (shouldResume) {
        await ensureAudioActivated();
    }
    if (shouldRestoreMIDI) {
        await startMIDI();
    }
    if (shouldRestoreLiveInput) {
        await startLiveAudioInput();
    }
    refreshStartControlUI();
    refreshMIDIControlUI();
    refreshLiveInputControlUI();
}

function cancelModeMorph() {
    if (modeMorphFrame) {
        cancelAnimationFrame(modeMorphFrame);
        modeMorphFrame = 0;
    }
    modeMorphToken += 1;
}

/**
 * @param {DSPControl} control
 * @returns {number}
 */
function getCurrentControlValue(control) {
    const remembered = currentParamValueMap.get(control.address);
    if (Number.isFinite(remembered)) {
        return quantizeControlValue(control, remembered);
    }
    if (faustNode && typeof faustNode.getParamValue === "function") {
        const value = faustNode.getParamValue(control.address);
        if (Number.isFinite(value)) {
            rememberParamValue(control.address, value);
            return value;
        }
    }
    return quantizeControlValue(control, control.init);
}

/**
 * @param {Record<string, number> | null | undefined} values
 * @returns {{ path: string; value: number; control: DSPControl }[]}
 */
function buildModePresetEntriesFromValues(values) {
    if (!values || typeof values !== "object") return [];
    const entries = [];
    const seen = new Set();
    Object.entries(values).forEach(([key, rawValue]) => {
        const control = getDSPControl(key);
        if (!control || seen.has(control.address)) return;
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) return;
        entries.push({
            path: control.address,
            control,
            value: quantizeControlValue(control, numeric),
        });
        seen.add(control.address);
    });
    return entries;
}

/**
 * @param {ModePreset} preset
 * @returns {{ path: string; value: number; control: DSPControl }[]}
 */
function buildModePresetEntries(preset) {
    if (!preset || typeof preset !== "object") return [];
    return buildModePresetEntriesFromValues(preset.values);
}

/**
 * Normalize flexible agent-facing user preset slot inputs.
 * Accepts canonical IDs (`user_01`), numbers (`1`), and digit strings (`"1"`).
 *
 * @param {string | number} slotId
 * @returns {string}
 */
function normalizeUserPresetSlotId(slotId) {
    if (typeof slotId === "number" && Number.isFinite(slotId)) {
        return `user_${String(Math.trunc(slotId)).padStart(2, "0")}`;
    }
    if (typeof slotId !== "string") return "";
    const trimmed = slotId.trim();
    if (!trimmed) return "";
    if (/^\d+$/.test(trimmed)) {
        return `user_${trimmed.padStart(2, "0")}`;
    }
    return trimmed;
}

/**
 * Converts agent-facing param input into valid morph entries with control metadata.
 *
 * @param {Record<string, number> | { path: string; value: number }[] | null | undefined} targets
 * @returns {{ path: string; value: number; control: DSPControl }[]}
 */
function buildAgentPresetEntries(targets) {
    if (Array.isArray(targets)) {
        /** @type {Record<string, number>} */
        const values = {};
        targets.forEach((entry) => {
            if (!entry || typeof entry !== "object") return;
            const path = typeof entry.path === "string" ? entry.path : "";
            const value = Number(entry.value);
            if (!path || !Number.isFinite(value)) return;
            values[path] = value;
        });
        return buildModePresetEntriesFromValues(values);
    }
    if (targets && typeof targets === "object") {
        return buildModePresetEntriesFromValues(targets);
    }
    return [];
}

/**
 * @param {string} path
 * @param {number} value
 * @returns {{ path: string; value: number; control: DSPControl } | null}
 */
function normalizeAgentParamEntry(path, value) {
    const control = getDSPControl(path);
    const numeric = Number(value);
    if (!control || !Number.isFinite(numeric)) return null;
    return {
        path: control.address,
        control,
        value: quantizeControlValue(control, numeric),
    };
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

/**
 * @returns {Promise<any>}
 */
function getThreeModule() {
    if (!motionCubeModulePromise) {
        motionCubeModulePromise = import(THREE_MODULE_SPEC);
    }
    return motionCubeModulePromise;
}

/**
 * @param {HTMLButtonElement} $button
 * @param {HTMLElement} $host
 * @returns {Promise<{ dispose: () => void; refresh: () => void; }>}
 */
async function createMotionCubeGlyph($button, $host) {
    if (!($button instanceof HTMLButtonElement) || !($host instanceof HTMLElement)) {
        return { dispose: () => {}, refresh: () => {} };
    }

    const THREE = await getThreeModule();
    if (!$button.isConnected || !$host.isConnected) {
        return { dispose: () => {}, refresh: () => {} };
    }

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
        });
    } catch (error) {
        console.warn("Unable to initialize the motion cube renderer:", error);
        return { dispose: () => {}, refresh: () => {} };
    }

    renderer.setClearColor(0x000000, 0);
    if ("outputColorSpace" in renderer && "SRGBColorSpace" in THREE) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    renderer.domElement.className = "hud-motion-cube-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 12);
    camera.zoom = 1.18;
    camera.position.set(2.9, 2.9, 2.9);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);

    const edgeMaterial = new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.88,
    });
    const accentMaterial = new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.22,
    });

    const cubeGeometry = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    const edgeGeometry = new THREE.EdgesGeometry(cubeGeometry);
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    cubeGroup.add(edgeLines);

    const accentGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.48, 0.48, 0.48));
    const accentLines = new THREE.LineSegments(accentGeometry, accentMaterial);
    accentLines.position.set(0.38, 0.38, 0.38);
    cubeGroup.add(accentLines);

    const restQuaternion = cubeGroup.quaternion.clone();
    const angularVelocity = new THREE.Vector3();
    let frameId = 0;
    let disposed = false;
    let lastFrameAt = performance.now();
    let lastSize = 0;
    let lastColor = "";

    const syncSize = () => {
        const hostRect = $host.getBoundingClientRect();
        const fallbackRect = $button.getBoundingClientRect();
        const baseSize = Math.min(
            hostRect.width || fallbackRect.width,
            hostRect.height || fallbackRect.height
        );
        const nextSize = Math.max(24, Math.round(baseSize));
        if (!Number.isFinite(nextSize) || nextSize <= 0 || nextSize === lastSize) return;
        lastSize = nextSize;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(nextSize, nextSize, false);
        renderer.domElement.style.width = `${nextSize}px`;
        renderer.domElement.style.height = `${nextSize}px`;
    };

    const syncPalette = () => {
        const styles = getComputedStyle($button);
        let color = styles.color || "#4cd3b7";
        // Strip alpha channel — THREE.Color.setStyle ignores it and emits a warning
        const rgbaMatch = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbaMatch) color = `rgb(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]})`;
        if (color !== lastColor) {
            edgeMaterial.color.setStyle(color);
            accentMaterial.color.setStyle(color);
            lastColor = color;
        }
        edgeMaterial.opacity = motionModeState.active ? 0.98 : 0.84;
        accentMaterial.opacity = motionModeState.active ? 0.34 : 0.18;
    };

    const updateCubeDynamics = (dt) => {
        const tiltX = (motionModeState.values.tiltX - 0.5) * 2;
        const tiltY = (motionModeState.values.tiltY - 0.5) * 2;
        const gyroPitch = (motionModeState.values.gyroPitch - 0.5) * 2;
        const gyroRoll = (motionModeState.values.gyroRoll - 0.5) * 2;
        const gyroSpin = (motionModeState.values.gyroSpin - 0.5) * 2;
        const accelerationBoost = 1 + motionModeState.accelerationValue * MOTION_CUBE_ACCELERATION_BOOST;

        if (motionModeState.active) {
            const targetX = clamp(-tiltY * MOTION_CUBE_TILT_MAX_RAD, -MOTION_CUBE_TILT_MAX_RAD, MOTION_CUBE_TILT_MAX_RAD);
            const targetY = clamp(tiltX * MOTION_CUBE_TILT_MAX_RAD, -MOTION_CUBE_TILT_MAX_RAD, MOTION_CUBE_TILT_MAX_RAD);
            const targetZ = clamp((tiltX * 0.18) - (tiltY * 0.1), -MOTION_CUBE_ROLL_MAX_RAD, MOTION_CUBE_ROLL_MAX_RAD);
            angularVelocity.x += ((targetX - cubeGroup.rotation.x) * MOTION_CUBE_SPRING_STRENGTH + gyroPitch * MOTION_CUBE_GYRO_TORQUE * 0.92 * accelerationBoost) * dt;
            angularVelocity.y += ((targetY - cubeGroup.rotation.y) * MOTION_CUBE_SPRING_STRENGTH + gyroSpin * MOTION_CUBE_GYRO_TORQUE * accelerationBoost) * dt;
            angularVelocity.z += ((targetZ - cubeGroup.rotation.z) * (MOTION_CUBE_SPRING_STRENGTH * 0.84) - gyroRoll * MOTION_CUBE_GYRO_TORQUE * 0.76 * accelerationBoost) * dt;
        } else {
            const returnMix = 1 - Math.exp(-MOTION_CUBE_REST_SLERP * dt);
            cubeGroup.quaternion.slerp(restQuaternion, returnMix);
        }

        const damping = Math.exp(-(motionModeState.active ? MOTION_CUBE_ACTIVE_DAMPING : MOTION_CUBE_IDLE_DAMPING) * dt);
        angularVelocity.multiplyScalar(damping);
        angularVelocity.clampLength(0, MOTION_CUBE_VELOCITY_MAX);

        cubeGroup.rotation.x += angularVelocity.x * dt;
        cubeGroup.rotation.y += angularVelocity.y * dt;
        cubeGroup.rotation.z += angularVelocity.z * dt;
    };

    const renderFrame = (now) => {
        if (disposed) return;
        const dt = clamp((now - lastFrameAt) / 1000, 1 / 180, 0.05);
        lastFrameAt = now;
        syncSize();
        syncPalette();
        updateCubeDynamics(dt);
        renderer.render(scene, camera);
        frameId = requestAnimationFrame(renderFrame);
    };

    $host.replaceChildren(renderer.domElement);
    syncSize();
    syncPalette();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(renderFrame);

    return {
        dispose: () => {
            if (disposed) return;
            disposed = true;
            if (frameId) cancelAnimationFrame(frameId);
            edgeGeometry.dispose();
            accentGeometry.dispose();
            cubeGeometry.dispose();
            edgeMaterial.dispose();
            accentMaterial.dispose();
            renderer.dispose();
            if (typeof renderer.forceContextLoss === "function") {
                renderer.forceContextLoss();
            }
            $host.replaceChildren();
        },
        refresh: () => {
            if (disposed) return;
            syncSize();
            syncPalette();
        },
    };
}

/**
 * @param {number} currentValue
 * @returns {number}
 */
function pickNextDiceValue(currentValue) {
    const pool = RANDOM_BUTTON_DICE_VALUES.filter((value) => value !== currentValue);
    if (pool.length === 0) return RANDOM_BUTTON_DICE_VALUES[0];
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * @param {number} value
 * @param {number} maxAbs
 * @returns {number}
 */
function normalizeCenteredSignal(value, maxAbs) {
    if (!Number.isFinite(value) || !(maxAbs > 0)) return 0.5;
    return clamp(0.5 + (value / maxAbs) * 0.5, 0, 1);
}

/**
 * @returns {typeof MOTION_MODE_SIGNAL_LIBRARY}
 */
function getMotionSignalLibrary() {
    const library = MOTION_MODE_SIGNAL_LIBRARY.filter((entry) => {
        if (!entry.key.startsWith("gyro")) return true;
        return typeof window.DeviceMotionEvent !== "undefined";
    });
    return library.length ? library : MOTION_MODE_SIGNAL_LIBRARY.slice(0, 2);
}

/**
 * @param {readonly string[]} preferredSignals
 * @param {ReturnType<typeof getMotionSignalLibrary>} library
 * @returns {{ key: "tiltX" | "tiltY" | "gyroPitch" | "gyroRoll" | "gyroSpin"; span: number; }}
 */
function pickMotionSignal(preferredSignals, library) {
    const preferred = Array.isArray(preferredSignals)
        ? library.filter((entry) => preferredSignals.includes(entry.key))
        : [];
    const pool = preferred.length ? preferred : library;
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * @returns {void}
 */
function resetMotionSignals() {
    MOTION_MODE_SIGNAL_KEYS.forEach((key) => {
        motionModeState.targets[key] = 0.5;
        motionModeState.values[key] = 0.5;
    });
    motionModeState.accelerationTarget = 0;
    motionModeState.accelerationValue = 0;
}

/**
 * @returns {{
 *   path: string;
 *   control: DSPControl;
 *   signalKey: "tiltX" | "tiltY" | "gyroPitch" | "gyroRoll" | "gyroSpin";
 *   invert: boolean;
 *   baseline: number;
 *   span: number;
 *   absolute: boolean;
 * }[]}
 */
function buildMotionAssignments() {
    /** @type {{
     *   path: string;
     *   control: DSPControl;
     *   signalKey: "tiltX" | "tiltY" | "gyroPitch" | "gyroRoll" | "gyroSpin";
     *   invert: boolean;
     *   baseline: number;
     *   span: number;
     *   absolute: boolean;
     * }[]} */
    const assignments = [];
    const seen = new Set();
    const library = getMotionSignalLibrary();
    const pushAssignment = (control, signal, options = {}) => {
        if (!control || seen.has(control.address)) return;
        const baseline = getCurrentControlValue(control);
        const spanScale = Number.isFinite(options.spanScale) ? options.spanScale : signal.span;
        const spanVariation = Number.isFinite(options.spanVariation) ? options.spanVariation : randomBetween(MOTION_MODE_SPAN_VARIATION_MIN, MOTION_MODE_SPAN_VARIATION_MAX);
        assignments.push({
            path: control.address,
            control,
            signalKey: signal.key,
            invert: options.invert ?? (Math.random() < 0.5),
            baseline,
            span: (control.max - control.min) * spanScale * spanVariation,
            absolute: options.absolute ?? false,
        });
        seen.add(control.address);
    };
    const pushFixed = (key, signalKey) => {
        const control = getDSPControl(key);
        if (!control || seen.has(control.address)) return;
        const signal = library.find((entry) => entry.key === signalKey);
        if (!signal) return;
        pushAssignment(control, signal, {
            absolute: true,
            invert: false,
            spanScale: 1,
            spanVariation: 1,
        });
    };

    pushFixed("mobilerotx", "tiltX");
    pushFixed("mobileroty", "tiltY");

    MOTION_MODE_SENSITIVE_CONTROL_POOL.forEach((spec) => {
        if (Math.random() > spec.probability) return;
        const control = getDSPControl(spec.key);
        if (!control || seen.has(control.address)) return;
        const signal = pickMotionSignal(spec.preferredSignals, library);
        pushAssignment(control, signal, {
            spanScale: spec.spanScale,
            spanVariation: randomBetween(0.88, 1.12),
        });
    });

    const candidates = dspControls
        .filter((control) => {
            if (!control || typeof control.address !== "string") return false;
            if (seen.has(control.address)) return false;
            const key = controlKeyFromAddress(control.address);
            if (!key || MOTION_MODE_EXCLUDED_KEYS.has(key)) return false;
            return Number.isFinite(control.min) && Number.isFinite(control.max) && control.max > control.min;
        })
        .sort(() => Math.random() - 0.5);

    const randomCount = clamp(
        Math.round(candidates.length * MOTION_MODE_RANDOM_ASSIGNMENT_RATIO),
        MOTION_MODE_RANDOM_ASSIGNMENT_MIN,
        MOTION_MODE_RANDOM_ASSIGNMENT_MAX
    );

    candidates.slice(0, randomCount).forEach((control) => {
        const signal = pickMotionSignal([], library);
        pushAssignment(control, signal);
    });

    return assignments;
}

/**
 * @param {{
 *   path: string;
 *   control: DSPControl;
 *   signalKey: "tiltX" | "tiltY" | "gyroPitch" | "gyroRoll" | "gyroSpin";
 *   invert: boolean;
 *   baseline: number;
 *   span: number;
 *   absolute: boolean;
 * }} assignment
 * @returns {number}
 */
function resolveMotionAssignmentValue(assignment) {
    const intensityProfile = getMotionIntensityProfile();
    const signal = motionModeState.values[assignment.signalKey];
    const normalized = assignment.invert ? (1 - signal) : signal;
    if (assignment.absolute) {
        return quantizeControlValue(
            assignment.control,
            assignment.control.min + normalized * (assignment.control.max - assignment.control.min)
        );
    }
    const centered = (normalized - 0.5) * 2;
    return quantizeControlValue(
        assignment.control,
        assignment.baseline + centered * assignment.span * intensityProfile.spanMultiplier
    );
}

function runMotionModeFrame() {
    if (!motionModeState.active) {
        motionModeState.frame = 0;
        refreshMotionGlyphUI();
        return;
    }

    const intensityProfile = getMotionIntensityProfile();
    motionModeState.targets.gyroPitch += (0.5 - motionModeState.targets.gyroPitch) * intensityProfile.gyroDecay;
    motionModeState.targets.gyroRoll += (0.5 - motionModeState.targets.gyroRoll) * intensityProfile.gyroDecay;
    motionModeState.targets.gyroSpin += (0.5 - motionModeState.targets.gyroSpin) * intensityProfile.gyroDecay;

    MOTION_MODE_SIGNAL_KEYS.forEach((key) => {
        motionModeState.values[key] += (motionModeState.targets[key] - motionModeState.values[key]) * intensityProfile.smoothing;
    });
    motionModeState.accelerationValue += (motionModeState.accelerationTarget - motionModeState.accelerationValue) * intensityProfile.accelerationBlend;
    motionModeState.accelerationTarget *= intensityProfile.accelerationDecay;

    const entries = motionModeState.assignments.map((assignment) => ({
        path: assignment.path,
        value: resolveMotionAssignmentValue(assignment),
    }));
    applyParamValues(entries);
    refreshMotionGlyphUI();
    motionModeState.frame = requestAnimationFrame(runMotionModeFrame);
}

function ensureMotionModeLoop() {
    if (motionModeState.frame) return;
    motionModeState.frame = requestAnimationFrame(runMotionModeFrame);
}

function stopMotionModeLoop() {
    if (!motionModeState.frame) return;
    cancelAnimationFrame(motionModeState.frame);
    motionModeState.frame = 0;
}

/**
 * @param {DeviceOrientationEvent} event
 */
function handleMotionDeviceOrientation(event) {
    if (!motionModeState.active) return;
    const intensityProfile = getMotionIntensityProfile();
    motionModeState.targets.tiltX = normalizeCenteredSignal(
        Number(event.gamma),
        MOTION_MODE_TILT_GAMMA_RANGE * intensityProfile.rangeScale
    );
    motionModeState.targets.tiltY = normalizeCenteredSignal(
        Number(event.beta),
        MOTION_MODE_TILT_BETA_RANGE * intensityProfile.rangeScale
    );
}

/**
 * @param {DeviceMotionEvent} event
 */
function handleMotionDeviceMotion(event) {
    if (!motionModeState.active) return;
    const intensityProfile = getMotionIntensityProfile();
    const rotationRate = event.rotationRate || {};
    motionModeState.targets.gyroPitch = normalizeCenteredSignal(
        Number(rotationRate.beta),
        MOTION_MODE_GYRO_BETA_RANGE * intensityProfile.rangeScale
    );
    motionModeState.targets.gyroRoll = normalizeCenteredSignal(
        Number(rotationRate.gamma),
        MOTION_MODE_GYRO_GAMMA_RANGE * intensityProfile.rangeScale
    );
    motionModeState.targets.gyroSpin = normalizeCenteredSignal(
        Number(rotationRate.alpha),
        MOTION_MODE_GYRO_ALPHA_RANGE * intensityProfile.rangeScale
    );
    const acceleration = event.acceleration || event.accelerationIncludingGravity || {};
    const ax = Number(acceleration.x);
    const ay = Number(acceleration.y);
    const az = Number(acceleration.z);
    const magnitude = Math.hypot(
        Number.isFinite(ax) ? ax : 0,
        Number.isFinite(ay) ? ay : 0,
        Number.isFinite(az) ? az : 0
    );
    motionModeState.accelerationTarget = clamp(
        magnitude / Math.max(MOTION_MODE_ACCELERATION_RANGE * intensityProfile.rangeScale, 0.0001),
        0,
        1
    );
}

function bindMotionModeListeners() {
    if (motionModeState.listenersBound) return;
    window.addEventListener("deviceorientation", handleMotionDeviceOrientation, true);
    window.addEventListener("devicemotion", handleMotionDeviceMotion, true);
    motionModeState.listenersBound = true;
}

function unbindMotionModeListeners() {
    if (!motionModeState.listenersBound) return;
    window.removeEventListener("deviceorientation", handleMotionDeviceOrientation, true);
    window.removeEventListener("devicemotion", handleMotionDeviceMotion, true);
    motionModeState.listenersBound = false;
}

function deactivateMotionMode() {
    motionModeState.active = false;
    motionModeState.assignments = [];
    stopMotionModeLoop();
    unbindMotionModeListeners();
    resetMotionSignals();
    refreshMotionControlUI();
    refreshMotionGlyphUI();
}

async function activateMotionMode() {
    const { requestPermissions } = await import(CREATE_NODE_MODULE_SPEC);
    const granted = await requestPermissions();
    if (!granted) {
        console.warn("Motion mode was not enabled because the browser did not grant sensor access.");
        deactivateMotionMode();
        return false;
    }

    motionModeState.assignments = buildMotionAssignments();
    if (motionModeState.assignments.length === 0) {
        console.warn("Motion mode could not find any eligible parameters to assign.");
        deactivateMotionMode();
        return false;
    }

    resetMotionSignals();
    motionModeState.active = true;
    bindMotionModeListeners();
    ensureMotionModeLoop();
    console.log(
        "Motion mode assignments:",
        motionModeState.assignments.map((assignment) => ({
            control: controlKeyFromAddress(assignment.path),
            signal: assignment.signalKey,
            absolute: assignment.absolute,
            invert: assignment.invert,
        }))
    );
    refreshMotionControlUI();
    return true;
}

async function toggleMotionMode() {
    if (motionModeState.active) {
        deactivateMotionMode();
        return;
    }
    await activateMotionMode();
}

/**
 * @param {{ path: string; value: number; control: DSPControl }[]} targets
 * @param {number} durationMs
 * @returns {Promise<boolean>}
 */
function morphToPresetValues(targets, durationMs = globalControlState.morphDurationMs) {
    cancelModeMorph();
    if (!Array.isArray(targets) || targets.length === 0) return Promise.resolve(false);
    const pairs = targets.map((target) => ({
        control: target.control,
        path: target.path,
        from: getCurrentControlValue(target.control),
        to: resolveTargetControlValue(target.control, target.value),
    }));
    if (!(durationMs > 0)) {
        applyParamValues(pairs.map((pair) => ({ path: pair.path, value: pair.to })));
        return Promise.resolve(true);
    }
    const token = modeMorphToken;
    const startedAt = performance.now();
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const frame = (now) => {
            if (token !== modeMorphToken) {
                finish(false);
                return;
            }
            const progress = Math.min(1, (now - startedAt) / durationMs);
            const eased = 1 - Math.pow(1 - progress, 3);
            const entries = pairs.map((pair) => ({
                path: pair.path,
                value: quantizeControlValue(
                    pair.control,
                    pair.from + (pair.to - pair.from) * eased
                ),
            }));
            applyParamValues(entries);
            if (progress < 1) {
                modeMorphFrame = requestAnimationFrame(frame);
                return;
            }
            modeMorphFrame = 0;
            finish(true);
        };

        modeMorphFrame = requestAnimationFrame(frame);
    });
}

/**
 * @param {{ path: string; value: number; control: DSPControl }[]} targets
 * @param {{
 *   durationMs?: number;
 *   staggerWindowMs?: number;
 *   durationVariationMin?: number;
 *   durationVariationMax?: number;
 * }} [options]
 * @returns {Promise<boolean>}
 */
function morphToRandomizedValuesStaggered(targets, options = {}) {
    cancelModeMorph();
    if (!Array.isArray(targets) || targets.length === 0) return Promise.resolve(false);

    const durationMs = Number.isFinite(options.durationMs) ? Number(options.durationMs) : globalControlState.morphDurationMs;
    const staggerWindowMs = Number.isFinite(options.staggerWindowMs) ? Number(options.staggerWindowMs) : RANDOMIZE_MORPH_STAGGER_WINDOW_MS;
    const durationVariationMin = Number.isFinite(options.durationVariationMin)
        ? Number(options.durationVariationMin)
        : RANDOMIZE_MORPH_DURATION_VARIATION_MIN;
    const durationVariationMax = Number.isFinite(options.durationVariationMax)
        ? Number(options.durationVariationMax)
        : RANDOMIZE_MORPH_DURATION_VARIATION_MAX;

    const staggeredTargets = [...targets];
    for (let index = staggeredTargets.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [staggeredTargets[index], staggeredTargets[swapIndex]] = [staggeredTargets[swapIndex], staggeredTargets[index]];
    }

    const pairs = staggeredTargets.map((target, index, collection) => {
        const progress = collection.length <= 1 ? 0 : index / (collection.length - 1);
        const delay = clamp(
            progress * staggerWindowMs * randomBetween(0.82, 1.06),
            0,
            staggerWindowMs
        );
        const durationVariation = randomBetween(durationVariationMin, durationVariationMax);
        return {
            control: target.control,
            path: target.path,
            from: getCurrentControlValue(target.control),
            to: resolveTargetControlValue(target.control, target.value),
            delay,
            duration: Math.max(120, durationMs * durationVariation),
        };
    });

    if (!(durationMs > 0)) {
        applyParamValues(pairs.map((pair) => ({ path: pair.path, value: pair.to })));
        return Promise.resolve(true);
    }

    const token = modeMorphToken;
    const startedAt = performance.now();

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const frame = (now) => {
            if (token !== modeMorphToken) {
                finish(false);
                return;
            }

            let hasActivePair = false;
            const entries = pairs.map((pair) => {
                const elapsed = Math.max(0, now - startedAt - pair.delay);
                const progress = Math.min(1, elapsed / pair.duration);
                if (progress < 1) hasActivePair = true;
                const eased = progress <= 0 ? 0 : 1 - Math.pow(1 - progress, 3);
                return {
                    path: pair.path,
                    value: quantizeControlValue(
                        pair.control,
                        pair.from + (pair.to - pair.from) * eased
                    ),
                };
            });

            applyParamValues(entries);

            if (hasActivePair) {
                modeMorphFrame = requestAnimationFrame(frame);
                return;
            }

            modeMorphFrame = 0;
            finish(true);
        };

        modeMorphFrame = requestAnimationFrame(frame);
    });
}

function mountHUDControls() {
    if (!($divFaustUI instanceof HTMLElement)) return;
    destroyMotionCubeGlyph();
    destroyMotionCubeGlyph = () => {};
    const oldPanel = document.getElementById("hud-control-panel");
    if (oldPanel) oldPanel.remove();
    const oldStrip = document.getElementById("hud-control-strip");
    if (oldStrip) oldStrip.remove();
    const oldModeStrip = document.getElementById("hud-mode-strip");
    if (oldModeStrip) oldModeStrip.remove();
    const oldModeButtonStrip = document.getElementById("hud-mode-button-strip");
    if (oldModeButtonStrip) oldModeButtonStrip.remove();
    const oldModeKnobCollapse = document.getElementById("hud-mode-knob-collapse");
    if (oldModeKnobCollapse) oldModeKnobCollapse.remove();

    const $panel = document.createElement("div");
    $panel.id = "hud-control-panel";

    const $strip = document.createElement("div");
    $strip.id = "hud-control-strip";

    const $modeStrip = document.createElement("div");
    $modeStrip.id = "hud-mode-strip";
    const $modeButtonStrip = document.createElement("div");
    $modeButtonStrip.id = "hud-mode-button-strip";
    const $modeKnobCollapse = document.createElement("div");
    $modeKnobCollapse.id = "hud-mode-knob-collapse";
    $modeKnobCollapse.dataset.expanded = "0";

    const $start = document.createElement("button");
    $start.type = "button";
    $start.className = "hud-control-btn hud-control-btn-start";
    $start.textContent = "START";

    const $reset = document.createElement("button");
    $reset.type = "button";
    $reset.className = "hud-control-btn";
    $reset.textContent = "RESET";

    const $zero = document.createElement("button");
    $zero.type = "button";
    $zero.className = "hud-control-btn hud-control-btn-zero";
    $zero.title = "Zero out";
    $zero.setAttribute("aria-label", "Zero out");
    const $zeroGlyph = document.createElement("span");
    $zeroGlyph.className = "hud-zero-glyph";
    $zeroGlyph.setAttribute("aria-hidden", "true");
    $zero.appendChild($zeroGlyph);

    const $random = document.createElement("button");
    $random.type = "button";
    $random.className = "hud-control-btn hud-control-btn-random";
    let currentRandomButtonValue = RANDOM_BUTTON_DICE_VALUES[Math.floor(Math.random() * RANDOM_BUTTON_DICE_VALUES.length)];
    const $randomGlyph = document.createElement("span");
    $randomGlyph.className = "hud-random-glyph";
    /** @type {HTMLSpanElement[]} */
    const randomPips = [];
    for (let index = 0; index < 9; index += 1) {
        const $pip = document.createElement("span");
        $pip.className = "hud-random-pip";
        $pip.dataset.index = String(index);
        randomPips.push($pip);
        $randomGlyph.appendChild($pip);
    }
    $random.appendChild($randomGlyph);
    $random.title = "Randomize";
    $random.setAttribute("aria-label", "Randomize");

    const $themePicker = document.createElement("label");
    $themePicker.className = "hud-theme-picker";
    $themePicker.setAttribute("for", "hud-theme-select");
    const $themeLabel = document.createElement("span");
    $themeLabel.className = "hud-theme-picker-label";
    $themeLabel.textContent = "VIBE";
    const $themeSelect = document.createElement("select");
    $themeSelect.id = "hud-theme-select";
    $themeSelect.className = "hud-theme-select";
    $themeSelect.setAttribute("aria-label", "Select visual vibe");
    $themeSelect.title = "Select visual vibe";
    HUD_THEMES.forEach((theme) => {
        const $option = document.createElement("option");
        $option.value = theme.id;
        $option.textContent = theme.label;
        $themeSelect.appendChild($option);
    });
    $themeSelect.value = activeHUDThemeId;
    $themePicker.append($themeLabel, $themeSelect);

    const $globalCluster = document.createElement("div");
    $globalCluster.className = "hud-global-cluster";
    const $globalTitle = document.createElement("span");
    $globalTitle.className = "hud-global-title";
    $globalTitle.textContent = "GLOBAL";
    const $globalList = document.createElement("div");
    $globalList.className = "hud-global-list";
    $globalCluster.append($globalTitle, $globalList);

    const $motionMode = document.createElement("button");
    $motionMode.type = "button";
    $motionMode.className = "hud-control-btn hud-control-btn-motion";
    const $motionModeGlyph = document.createElement("span");
    $motionModeGlyph.className = "hud-motion-cube-glyph";
    $motionModeGlyph.setAttribute("aria-hidden", "true");
    $motionMode.appendChild($motionModeGlyph);
    $motionMode.title = "Enable motion mode";
    $motionMode.setAttribute("aria-label", "Enable motion mode");
    $motionMode.dataset.active = "0";

    const $midiMode = document.createElement("button");
    $midiMode.type = "button";
    $midiMode.className = "hud-control-btn hud-control-btn-midi";
    $midiMode.dataset.active = "0";
    $midiMode.setAttribute("aria-pressed", "false");
    $midiMode.title = "Enable MIDI input";
    $midiMode.setAttribute("aria-label", "Enable MIDI input");
    const $midiModeGlyph = document.createElement("span");
    $midiModeGlyph.className = "hud-mini-control-glyph hud-midi-glyph";
    $midiModeGlyph.textContent = "MIDI";
    $midiMode.appendChild($midiModeGlyph);

    const $liveInput = document.createElement("button");
    $liveInput.type = "button";
    $liveInput.className = "hud-control-btn hud-control-btn-live-input";
    $liveInput.dataset.active = "0";
    $liveInput.dataset.inputUnavailable = "0";
    $liveInput.setAttribute("aria-pressed", "false");
    $liveInput.title = "Enable live audio input";
    $liveInput.setAttribute("aria-label", "Enable live audio input");
    const $liveInputGlyph = document.createElement("span");
    $liveInputGlyph.className = "hud-mini-control-glyph hud-live-input-glyph";
    $liveInputGlyph.textContent = "IN";
    $liveInput.appendChild($liveInputGlyph);

    const $audioInputPicker = document.createElement("label");
    $audioInputPicker.className = "hud-theme-picker hud-audio-input-picker";
    $audioInputPicker.setAttribute("for", "hud-audio-input-select");
    const $audioInputLabel = document.createElement("span");
    $audioInputLabel.className = "hud-theme-picker-label";
    $audioInputLabel.textContent = "SOURCE";
    const $audioInputSelect = document.createElement("select");
    $audioInputSelect.id = "hud-audio-input-select";
    $audioInputSelect.className = "hud-theme-select";
    $audioInputSelect.setAttribute("aria-label", "Select live audio input source");
    $audioInputSelect.title = "Select live audio input source";
    $audioInputPicker.append($audioInputLabel, $audioInputSelect);

    // ── SEQ button ─────────────────────────────────────────────────────────
    const $seqMode = document.createElement("button");
    $seqMode.type = "button";
    $seqMode.className = "hud-control-btn hud-control-btn-seq";
    $seqMode.dataset.active = "0";
    $seqMode.setAttribute("aria-pressed", "false");
    $seqMode.title = "Toggle step sequencer";
    $seqMode.setAttribute("aria-label", "Toggle step sequencer");
    const $seqModeGlyph = document.createElement("span");
    $seqModeGlyph.className = "hud-mini-control-glyph hud-seq-glyph";
    $seqModeGlyph.textContent = "SEQ";
    $seqMode.appendChild($seqModeGlyph);

    // ── SEQ panel ──────────────────────────────────────────────────────────
    const $seqPanel = document.createElement("div");
    $seqPanel.className = "hud-seq-panel";
    $seqPanel.dataset.open = "0";

    const $seqTransport = document.createElement("div");
    $seqTransport.className = "hud-seq-transport";

    const $seqPlay = document.createElement("button");
    $seqPlay.type = "button";
    $seqPlay.className = "hud-seq-btn";
    $seqPlay.textContent = "▶";
    $seqPlay.title = "Play";
    $seqPlay.setAttribute("aria-label", "Play sequencer");
    $seqPlay.dataset.active = "0";

    const $seqStop = document.createElement("button");
    $seqStop.type = "button";
    $seqStop.className = "hud-seq-btn";
    $seqStop.textContent = "■";
    $seqStop.title = "Stop";
    $seqStop.setAttribute("aria-label", "Stop sequencer");

    const $seqBPMLabel = document.createElement("span");
    $seqBPMLabel.className = "hud-seq-label";
    $seqBPMLabel.textContent = "BPM";

    const $seqBPMDown = document.createElement("button");
    $seqBPMDown.type = "button";
    $seqBPMDown.className = "hud-seq-btn hud-seq-btn-sm";
    $seqBPMDown.textContent = "−";
    $seqBPMDown.title = "Decrease BPM";
    $seqBPMDown.setAttribute("aria-label", "Decrease BPM");

    const $seqBPMValue = document.createElement("span");
    $seqBPMValue.className = "hud-seq-value";
    $seqBPMValue.textContent = "120";

    const $seqBPMUp = document.createElement("button");
    $seqBPMUp.type = "button";
    $seqBPMUp.className = "hud-seq-btn hud-seq-btn-sm";
    $seqBPMUp.textContent = "+";
    $seqBPMUp.title = "Increase BPM";
    $seqBPMUp.setAttribute("aria-label", "Increase BPM");

    const $seqStepCountLabel = document.createElement("span");
    $seqStepCountLabel.className = "hud-seq-label";
    $seqStepCountLabel.textContent = "STEPS";

    const $seqStep8 = document.createElement("button");
    $seqStep8.type = "button";
    $seqStep8.className = "hud-seq-btn hud-seq-btn-sm hud-seq-step-select";
    $seqStep8.textContent = "8";
    $seqStep8.dataset.stepCount = "8";
    $seqStep8.title = "8 steps";

    const $seqStep16 = document.createElement("button");
    $seqStep16.type = "button";
    $seqStep16.className = "hud-seq-btn hud-seq-btn-sm hud-seq-step-select";
    $seqStep16.textContent = "16";
    $seqStep16.dataset.stepCount = "16";
    $seqStep16.dataset.active = "1";
    $seqStep16.title = "16 steps";

    const $seqStep32 = document.createElement("button");
    $seqStep32.type = "button";
    $seqStep32.className = "hud-seq-btn hud-seq-btn-sm hud-seq-step-select";
    $seqStep32.textContent = "32";
    $seqStep32.dataset.stepCount = "32";
    $seqStep32.title = "32 steps";

    const $seqDirBtn = document.createElement("button");
    $seqDirBtn.type = "button";
    $seqDirBtn.className = "hud-seq-btn hud-seq-btn-sm";
    $seqDirBtn.textContent = "→";
    $seqDirBtn.title = "Direction: forward";
    $seqDirBtn.dataset.direction = "forward";

    $seqTransport.append(
        $seqPlay, $seqStop,
        $seqBPMLabel, $seqBPMDown, $seqBPMValue, $seqBPMUp,
        $seqStepCountLabel, $seqStep8, $seqStep16, $seqStep32,
        $seqDirBtn
    );

    const $seqGrid = document.createElement("div");
    $seqGrid.className = "hud-seq-grid";

    $seqPanel.append($seqTransport, $seqGrid);

    const rebuildSeqGrid = () => {
        $seqGrid.replaceChildren();
        if (!sequencer) return;
        const linkedPaths = sequencer.getLinkedParameters();
        if (linkedPaths.length === 0) {
            const $empty = document.createElement("div");
            $empty.className = "hud-seq-empty";
            $empty.textContent = "Link knobs with the S button to add parameters";
            $seqGrid.appendChild($empty);
            return;
        }
        const stepCount = sequencer.getStepCount();
        linkedPaths.forEach((path) => {
            const $row = document.createElement("div");
            $row.className = "hud-seq-row";
            const $label = document.createElement("span");
            $label.className = "hud-seq-row-label";
            const shortKey = path.slice(path.lastIndexOf("/") + 1);
            $label.textContent = shortKey.length > 10 ? shortKey.slice(0, 9) + "…" : shortKey;
            $label.title = path;
            $row.appendChild($label);
            for (let i = 0; i < stepCount; i++) {
                const $cell = document.createElement("div");
                $cell.className = "hud-seq-cell";
                $cell.dataset.paramPath = path;
                $cell.dataset.stepIndex = String(i);
                if (i % 4 === 0) $cell.dataset.beat = "1";
                const val = sequencer.getStepValue(path, i);
                $cell.style.setProperty("--seq-value", String(val));
                const $bar = document.createElement("div");
                $bar.className = "hud-seq-cell-bar";
                $cell.appendChild($bar);
                $row.appendChild($cell);
            }
            $seqGrid.appendChild($row);
        });
    };

    const highlightSeqStep = (stepIndex) => {
        $seqGrid.querySelectorAll(".hud-seq-cell.active").forEach(($c) => $c.classList.remove("active"));
        $seqGrid.querySelectorAll(`.hud-seq-cell[data-step-index="${stepIndex}"]`).forEach(($c) => $c.classList.add("active"));
    };

    const seqOnParamUpdate = (path, value) => {
        if (!faustUIBridge || typeof faustUIBridge.setParamValue !== "function") return;
        faustUIBridge.setParamValue(path, value, true);
    };

    const initSequencer = () => {
        if (sequencer) sequencer.destroy();
        sequencer = new StepSequencer();
    };

    const syncSeqToggleButtonStates = () => {
        if (!sequencer) return;
        $seqBPMValue.textContent = String(sequencer.getBPM());
        $seqPlay.dataset.active = sequencer.isPlaying() ? "1" : "0";
        [$seqStep8, $seqStep16, $seqStep32].forEach(($btn) => {
            $btn.dataset.active = String(Number($btn.dataset.stepCount) === sequencer.getStepCount() ? 1 : 0);
        });
        const dirSymbols = { forward: "→", reverse: "←", pingpong: "↔" };
        const dir = sequencer.getDirection();
        $seqDirBtn.textContent = dirSymbols[dir] || "→";
        $seqDirBtn.title = `Direction: ${dir}`;
        $seqDirBtn.dataset.direction = dir;
    };

    refreshSeqPanelUI = () => { syncSeqToggleButtonStates(); rebuildSeqGrid(); };

    // ── SEQ button toggle ──────────────────────────────────────────────────
    $seqMode.addEventListener("click", () => {
        if (!sequencer) initSequencer();
        seqPanelOpen = !seqPanelOpen;
        $seqPanel.dataset.open = seqPanelOpen ? "1" : "0";
        $seqMode.dataset.active = seqPanelOpen ? "1" : "0";
        $seqMode.setAttribute("aria-pressed", String(seqPanelOpen));
        $panel.dataset.seqOpen = seqPanelOpen ? "1" : "0";
        $divFaustUI.dataset.seqOpen = seqPanelOpen ? "1" : "0";
        if (seqPanelOpen) { syncSeqToggleButtonStates(); rebuildSeqGrid(); }
    });

    // ── SEQ transport events ───────────────────────────────────────────────
    $seqPlay.addEventListener("click", () => {
        if (!sequencer) initSequencer();
        if (sequencer.getLinkedParameters().length === 0) return;
        sequencer.play(
            (stepIndex) => highlightSeqStep(stepIndex),
            (path, value) => seqOnParamUpdate(path, value)
        );
        syncSeqToggleButtonStates();
    });

    $seqStop.addEventListener("click", () => {
        if (sequencer) { sequencer.stop(); highlightSeqStep(-1); }
        syncSeqToggleButtonStates();
    });

    $seqBPMDown.addEventListener("click", () => {
        if (!sequencer) return;
        sequencer.setBPM(sequencer.getBPM() - 5);
        $seqBPMValue.textContent = String(sequencer.getBPM());
    });

    $seqBPMUp.addEventListener("click", () => {
        if (!sequencer) return;
        sequencer.setBPM(sequencer.getBPM() + 5);
        $seqBPMValue.textContent = String(sequencer.getBPM());
    });

    [$seqStep8, $seqStep16, $seqStep32].forEach(($btn) => {
        $btn.addEventListener("click", () => {
            if (!sequencer) return;
            const wasPlaying = sequencer.isPlaying();
            if (wasPlaying) sequencer.stop();
            sequencer.setStepCount(Number($btn.dataset.stepCount));
            syncSeqToggleButtonStates();
            rebuildSeqGrid();
            if (wasPlaying) {
                sequencer.play(
                    (stepIndex) => highlightSeqStep(stepIndex),
                    (path, value) => seqOnParamUpdate(path, value)
                );
                syncSeqToggleButtonStates();
            }
        });
    });

    $seqDirBtn.addEventListener("click", () => {
        if (!sequencer) return;
        const dirs = ["forward", "reverse", "pingpong"];
        const cur = dirs.indexOf(sequencer.getDirection());
        sequencer.setDirection(dirs[(cur + 1) % dirs.length]);
        syncSeqToggleButtonStates();
    });

    // ── SEQ grid cell interaction ──────────────────────────────────────────
    $seqGrid.addEventListener("pointerdown", (event) => {
        const $cell = event.target.closest(".hud-seq-cell");
        if (!$cell || !sequencer) return;
        const path = $cell.dataset.paramPath;
        const stepIndex = Number($cell.dataset.stepIndex);
        const currentVal = sequencer.getStepValue(path, stepIndex);
        const newVal = currentVal >= 0.9 ? 0 : Math.min(1, currentVal + 0.25);
        sequencer.setStepValue(path, stepIndex, newVal);
        $cell.style.setProperty("--seq-value", String(newVal));
    });

    // ── Per-knob SEQ toggle delegation (capture phase to beat stopPropagation) ──
    document.addEventListener("click", (event) => {
        const $toggle = event.target.closest(".hud-knob-seq-toggle");
        if (!$toggle || !sequencer) return;
        const path = $toggle.dataset.paramAddress;
        if (!path) return;
        const wasLinked = $toggle.dataset.seqLinked === "1";
        if (wasLinked) {
            sequencer.unlinkParameter(path);
            $toggle.dataset.seqLinked = "0";
        } else {
            const control = getDSPControl(path);
            if (control) {
                sequencer.linkParameter(control.address, control.min, control.max, control.step);
            } else {
                sequencer.linkParameter(path, 0, 1, null);
            }
            $toggle.dataset.seqLinked = "1";
        }
        if (seqPanelOpen) rebuildSeqGrid();
    }, true);

    const $zoomOut = document.createElement("button");
    $zoomOut.type = "button";
    $zoomOut.className = "hud-control-btn hud-control-btn-zoom";
    $zoomOut.textContent = "-";
    $zoomOut.title = "Zoom out";
    $zoomOut.setAttribute("aria-label", "Zoom out");

    const $zoomIn = document.createElement("button");
    $zoomIn.type = "button";
    $zoomIn.className = "hud-control-btn hud-control-btn-zoom";
    $zoomIn.textContent = "+";
    $zoomIn.title = "Zoom in";
    $zoomIn.setAttribute("aria-label", "Zoom in");

    const createPresetKnobToggle = (controlsId, title) => {
        const $toggle = document.createElement("button");
        $toggle.type = "button";
        $toggle.className = "hud-control-btn hud-preset-toggle";
        $toggle.dataset.expanded = "0";
        $toggle.title = `Show ${title}`;
        $toggle.setAttribute("aria-label", `Show ${title}`);
        $toggle.setAttribute("aria-controls", controlsId);
        $toggle.setAttribute("aria-expanded", "false");

        const $icon = document.createElement("span");
        $icon.className = "hud-preset-toggle-icon";
        const $bar1 = document.createElement("span");
        $bar1.className = "bar bar-1";
        const $bar2 = document.createElement("span");
        $bar2.className = "bar bar-2";
        const $bar3 = document.createElement("span");
        $bar3.className = "bar bar-3";
        const $triangleLeft = document.createElement("span");
        $triangleLeft.className = "triangle triangle-left";
        const $triangleRight = document.createElement("span");
        $triangleRight.className = "triangle triangle-right";
        const $triangleBase = document.createElement("span");
        $triangleBase.className = "triangle triangle-base";
        $icon.append($bar1, $bar2, $bar3, $triangleLeft, $triangleRight, $triangleBase);
        $toggle.appendChild($icon);
        return $toggle;
    };

    const $stockKnobToggle = createPresetKnobToggle("hud-stock-mode-card-lane", "stock preset knobs");

    const $stockGroupLabel = document.createElement("button");
    $stockGroupLabel.type = "button";
    $stockGroupLabel.className = "hud-preset-group-toggle";
    $stockGroupLabel.dataset.group = "stock";
    $stockGroupLabel.dataset.expanded = "0";
    $stockGroupLabel.dataset.active = "0";
    $stockGroupLabel.textContent = "STOCK";
    $stockGroupLabel.title = "Show stock presets";
    $stockGroupLabel.setAttribute("aria-label", "Show stock presets");
    $stockGroupLabel.setAttribute("aria-controls", "hud-stock-preset-lane");
    $stockGroupLabel.setAttribute("aria-expanded", "false");

    const $stockPresetLane = document.createElement("div");
    $stockPresetLane.id = "hud-stock-preset-lane";
    $stockPresetLane.className = "hud-preset-stock-lane";
    $stockPresetLane.dataset.expanded = "0";
    const $stockPresetLaneTrack = document.createElement("div");
    $stockPresetLaneTrack.className = "hud-preset-stock-lane-track";
    $stockPresetLane.appendChild($stockPresetLaneTrack);

    const $stockModeCardLane = document.createElement("div");
    $stockModeCardLane.id = "hud-stock-mode-card-lane";
    $stockModeCardLane.className = "hud-mode-stock-lane";
    $stockModeCardLane.dataset.expanded = "0";
    const $stockModeCardLaneTrack = document.createElement("div");
    $stockModeCardLaneTrack.className = "hud-mode-stock-lane-track";
    $stockModeCardLane.appendChild($stockModeCardLaneTrack);

    const $stockKnobToggleSpacer = document.createElement("div");
    $stockKnobToggleSpacer.className = "hud-mode-spacer";
    $stockKnobToggleSpacer.dataset.role = "stock-knob-toggle";
    $stockKnobToggleSpacer.setAttribute("aria-hidden", "true");

    const $stockGroupSpacer = document.createElement("div");
    $stockGroupSpacer.className = "hud-mode-spacer";
    $stockGroupSpacer.dataset.role = "stock-group";
    $stockGroupSpacer.setAttribute("aria-hidden", "true");

    const $userGroupLabel = document.createElement("span");
    $userGroupLabel.className = "hud-preset-group-label";
    $userGroupLabel.dataset.group = "user";
    $userGroupLabel.textContent = "USER";

    const $userGroupSpacer = document.createElement("div");
    $userGroupSpacer.className = "hud-mode-spacer";
    $userGroupSpacer.dataset.role = "user-group";
    $userGroupSpacer.setAttribute("aria-hidden", "true");

    const $userKnobToggle = createPresetKnobToggle("hud-user-mode-card-lane", "user preset knobs");

    const $userKnobToggleSpacer = document.createElement("div");
    $userKnobToggleSpacer.className = "hud-mode-spacer";
    $userKnobToggleSpacer.dataset.role = "user-knob-toggle";
    $userKnobToggleSpacer.setAttribute("aria-hidden", "true");

    const $savePreset = document.createElement("button");
    $savePreset.type = "button";
    $savePreset.className = "hud-control-btn hud-mode-btn";
    $savePreset.dataset.kind = "utility";
    $savePreset.dataset.active = "0";
    $savePreset.dataset.saveArmed = "0";
    $savePreset.title = "Arm save mode";
    $savePreset.setAttribute("aria-label", "Arm save mode");
    const $savePresetName = document.createElement("span");
    $savePresetName.className = "hud-mode-name";
    $savePresetName.textContent = "SAVE";
    const $savePresetMeta = document.createElement("span");
    $savePresetMeta.className = "hud-mode-meta";
    $savePresetMeta.textContent = "READY";
    $savePreset.append($savePresetName, $savePresetMeta);

    const $savePresetSpacer = document.createElement("div");
    $savePresetSpacer.className = "hud-mode-spacer";
    $savePresetSpacer.dataset.role = "save";
    $savePresetSpacer.setAttribute("aria-hidden", "true");

    const $userModeCardLane = document.createElement("div");
    $userModeCardLane.id = "hud-user-mode-card-lane";
    $userModeCardLane.className = "hud-mode-user-lane";
    $userModeCardLane.dataset.expanded = "0";
    const $userModeCardLaneTrack = document.createElement("div");
    $userModeCardLaneTrack.className = "hud-mode-user-lane-track";
    $userModeCardLane.appendChild($userModeCardLaneTrack);

    const $scrollDown = document.createElement("button");
    $scrollDown.type = "button";
    $scrollDown.className = "hud-control-btn hud-control-btn-scroll";
    $scrollDown.textContent = "▼";
    $scrollDown.title = "Scroll down";
    $scrollDown.setAttribute("aria-label", "Scroll down");

    const $scrollUp = document.createElement("button");
    $scrollUp.type = "button";
    $scrollUp.className = "hud-control-btn hud-control-btn-scroll";
    $scrollUp.textContent = "▲";
    $scrollUp.title = "Scroll up";
    $scrollUp.setAttribute("aria-label", "Scroll up");

    const $fullscreen = document.createElement("button");
    $fullscreen.type = "button";
    $fullscreen.className = "hud-control-btn hud-control-btn-scroll hud-control-btn-fullscreen";
    $fullscreen.textContent = "⛶";
    $fullscreen.title = "Enter fullscreen";
    $fullscreen.setAttribute("aria-label", "Enter fullscreen");

    const topStripReactiveItems = [
        $start,
        $reset,
        $zero,
        $random,
        $themePicker,
        $motionMode,
        $midiMode,
        $liveInput,
        $audioInputPicker,
        $seqMode,
        $globalCluster,
        $zoomOut,
        $zoomIn,
        $scrollDown,
        $scrollUp,
        $fullscreen,
    ];
    topStripReactiveItems.forEach(($item) => $item.classList.add("hud-hover-reactive-item"));

    const presetButtonReactiveItems = [$stockKnobToggle, $stockGroupLabel, $userKnobToggle, $userGroupLabel, $savePreset];
    presetButtonReactiveItems.forEach(($item) => $item.classList.add("hud-hover-reactive-item"));
    const presetCardReactiveItems = [];

    $strip.append($start, $reset, $zero, $random, $themePicker, $motionMode, $midiMode, $liveInput, $audioInputPicker, $seqMode, $globalCluster, $zoomOut, $zoomIn, $scrollDown, $scrollUp, $fullscreen);
    $panel.appendChild($strip);
    $panel.appendChild($seqPanel);
    $modeButtonStrip.append($stockKnobToggle, $stockGroupLabel, $stockPresetLane);
    $modeStrip.append($stockKnobToggleSpacer, $stockGroupSpacer, $stockModeCardLane);

    const modeControls = new Map();
    let motionCubeController = null;
    let stockQuickPresetsExpanded = false;
    let stockPresetKnobsExpanded = false;
    let userPresetKnobsExpanded = false;
    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fineHoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

    /**
     * @param {HTMLElement} $item
     */
    const clearReactiveItemState = ($item) => {
        $item.style.removeProperty("--hud-hover-shift");
        $item.style.removeProperty("--hud-hover-scale");
        $item.style.removeProperty("--hud-hover-glow");
        $item.style.removeProperty("--hud-hover-brightness");
        $item.style.removeProperty("--hud-hover-saturate");
        $item.style.removeProperty("--hud-hover-content-shift");
        $item.style.removeProperty("z-index");
    };

    /**
     * @param {HTMLElement} $stripElement
     * @param {HTMLElement[]} sourceItems
     * @param {{
     *   collectiveShift?: number;
     *   collectiveScale?: number;
     *   collectiveGlow?: number;
     *   collectiveBrightness?: number;
     *   collectiveSaturate?: number;
     *   contentParallax?: number;
     *   scrollLerp?: number;
     *   edgeCommitThreshold?: number;
     *   reverseThreshold?: number;
     *   edgeLockLerpBoost?: number;
     *   viewportCommitThreshold?: number;
     *   viewportReverseThreshold?: number;
     *   viewportBaseResponse?: number;
     *   viewportEdgeResponseBoost?: number;
     *   viewportEaseExponent?: number;
     *   centerIdleZone?: boolean;
     *   edgeHoverOnly?: boolean;
     *   disableCollectiveMotion?: boolean;
     *   maxScrollStepPx?: number;
     * }} [config]
     */
    const bindStripHoverPan = ($stripElement, sourceItems, config = {}) => {
        const items = sourceItems.filter(($item) => $item instanceof HTMLElement);
        if (!($stripElement instanceof HTMLElement) || items.length === 0) return;

        const collectiveShift = Number.isFinite(config.collectiveShift) ? Number(config.collectiveShift) : 2.4;
        const collectiveScale = Number.isFinite(config.collectiveScale) ? Number(config.collectiveScale) : 0.01;
        const collectiveGlow = Number.isFinite(config.collectiveGlow) ? Number(config.collectiveGlow) : 4;
        const collectiveBrightness = Number.isFinite(config.collectiveBrightness) ? Number(config.collectiveBrightness) : 0.05;
        const collectiveSaturate = Number.isFinite(config.collectiveSaturate) ? Number(config.collectiveSaturate) : 0.06;
        const contentParallax = Number.isFinite(config.contentParallax) ? Number(config.contentParallax) : 0.22;
        const scrollLerp = Number.isFinite(config.scrollLerp) ? Number(config.scrollLerp) : 0.24;
        const edgeCommitThreshold = clamp(
            Number.isFinite(config.edgeCommitThreshold) ? Number(config.edgeCommitThreshold) : 0.24,
            0.08,
            0.42
        );
        const reverseThreshold = clamp(
            Number.isFinite(config.reverseThreshold) ? Number(config.reverseThreshold) : 0.75,
            Math.max(0.52, edgeCommitThreshold + 0.08),
            0.92
        );
        const edgeLockLerpBoost = clamp(
            Number.isFinite(config.edgeLockLerpBoost) ? Number(config.edgeLockLerpBoost) : 0.2,
            0,
            0.6
        );
        const viewportCommitThreshold = clamp(
            Number.isFinite(config.viewportCommitThreshold) ? Number(config.viewportCommitThreshold) : Math.max(0.3, edgeCommitThreshold + 0.08),
            edgeCommitThreshold,
            0.48
        );
        const viewportReverseThreshold = clamp(
            Number.isFinite(config.viewportReverseThreshold) ? Number(config.viewportReverseThreshold) : Math.max(0.68, reverseThreshold),
            Math.max(0.56, viewportCommitThreshold + 0.08),
            0.92
        );
        const viewportBaseResponse = clamp(
            Number.isFinite(config.viewportBaseResponse) ? Number(config.viewportBaseResponse) : 0.78,
            0.08,
            1.25
        );
        const viewportEdgeResponseBoost = clamp(
            Number.isFinite(config.viewportEdgeResponseBoost) ? Number(config.viewportEdgeResponseBoost) : 0.65,
            0,
            2
        );
        const viewportEaseExponent = clamp(
            Number.isFinite(config.viewportEaseExponent) ? Number(config.viewportEaseExponent) : 1.8,
            1,
            5
        );
        const centerIdleZone = config.centerIdleZone === true;
        const edgeHoverOnly = config.edgeHoverOnly === true;
        const disableCollectiveMotion = config.disableCollectiveMotion === true;
        const maxScrollStepPx = Number.isFinite(config.maxScrollStepPx)
            ? Math.max(0.25, Number(config.maxScrollStepPx))
            : Number.POSITIVE_INFINITY;

        let rafId = 0;
        let active = false;
        let pointerType = "mouse";
        let pointerX = 0;
        let targetScrollLeft = $stripElement.scrollLeft;
        let animatedScrollLeft = $stripElement.scrollLeft;
        /** @type {-1 | 0 | 1} */
        let committedEdge = 0;

        const clearAll = () => {
            items.forEach(clearReactiveItemState);
        };

        /**
         * @param {number} normalizedX
         * @param {number} overflowRatio
         */
        const applyCollectiveItemState = (normalizedX, overflowRatio) => {
            const direction = normalizedX >= 0.5 ? 1 : -1;
            const edgeStrengthRaw = Math.abs(normalizedX - 0.5) * 2;
            const edgeStrength = edgeStrengthRaw * edgeStrengthRaw * (3 - 2 * edgeStrengthRaw);
            const combinedStrength = clamp(edgeStrength * 0.72 + overflowRatio * 0.28, 0, 1);

            if (combinedStrength <= 0.0005) {
                clearAll();
                return;
            }

            const shift = direction * collectiveShift * combinedStrength;
            const scale = collectiveScale * combinedStrength;
            const glow = collectiveGlow * combinedStrength;
            const brightness = collectiveBrightness * combinedStrength;
            const saturate = collectiveSaturate * combinedStrength;
            const contentShift = shift * -contentParallax;
            const zIndex = String(24 + Math.round(combinedStrength * 18));

            items.forEach(($item) => {
                $item.style.setProperty("--hud-hover-shift", `${shift.toFixed(2)}px`);
                $item.style.setProperty("--hud-hover-scale", scale.toFixed(4));
                $item.style.setProperty("--hud-hover-glow", `${glow.toFixed(2)}px`);
                $item.style.setProperty("--hud-hover-brightness", brightness.toFixed(4));
                $item.style.setProperty("--hud-hover-saturate", saturate.toFixed(4));
                $item.style.setProperty("--hud-hover-content-shift", `${contentShift.toFixed(2)}px`);
                $item.style.zIndex = zIndex;
            });
        };

        const flush = () => {
            rafId = 0;
            if (!active || pointerType === "touch" || reduceMotionQuery.matches || !fineHoverQuery.matches) {
                clearAll();
                return;
            }

            const stripRect = $stripElement.getBoundingClientRect();
            const stripWidth = Math.max(stripRect.width, 1);
            const normalizedStripX = clamp((pointerX - stripRect.left) / stripWidth, 0, 1);
            const viewportWidth = Math.max(window.innerWidth || stripWidth, 1);
            const normalizedViewportX = clamp(pointerX / viewportWidth, 0, 1);
            const viewportEdgeDistance = Math.min(normalizedViewportX, 1 - normalizedViewportX);
            const viewportEdgeProximityRaw = 1 - clamp(viewportEdgeDistance / 0.5, 0, 1);
            const viewportEdgeProximityPow = Math.pow(viewportEdgeProximityRaw, viewportEaseExponent);
            const viewportEdgeStrength = viewportEdgeProximityPow * viewportEdgeProximityPow * (3 - 2 * viewportEdgeProximityPow);
            const maxScroll = Math.max(0, $stripElement.scrollWidth - $stripElement.clientWidth);
            if (maxScroll > 0) {
                const leftStripActivation = normalizedStripX <= edgeCommitThreshold;
                const rightStripActivation = normalizedStripX >= (1 - edgeCommitThreshold);
                const leftActivation = leftStripActivation || normalizedViewportX <= viewportCommitThreshold;
                const rightActivation = rightStripActivation || normalizedViewportX >= (1 - viewportCommitThreshold);
                const reverseToRight = normalizedStripX >= reverseThreshold || normalizedViewportX >= viewportReverseThreshold;
                const reverseToLeft = normalizedStripX <= (1 - reverseThreshold) || normalizedViewportX <= (1 - viewportReverseThreshold);
                if (edgeHoverOnly) {
                    if (leftStripActivation) {
                        committedEdge = -1;
                    } else if (rightStripActivation) {
                        committedEdge = 1;
                    } else {
                        committedEdge = 0;
                        targetScrollLeft = animatedScrollLeft;
                        clearAll();
                        return;
                    }
                } else {
                    if (committedEdge === 0) {
                        if (leftActivation) {
                            committedEdge = -1;
                        } else if (rightActivation) {
                            committedEdge = 1;
                        } else if (centerIdleZone) {
                            targetScrollLeft = animatedScrollLeft;
                            clearAll();
                            return;
                        } else {
                            committedEdge = normalizedStripX >= 0.5 ? 1 : -1;
                        }
                    } else if (committedEdge < 0 && reverseToRight) {
                        committedEdge = 1;
                    } else if (committedEdge > 0 && reverseToLeft) {
                        committedEdge = -1;
                    } else if (leftActivation) {
                        committedEdge = -1;
                    } else if (rightActivation) {
                        committedEdge = 1;
                    }
                }
                targetScrollLeft = committedEdge > 0 ? maxScroll : 0;
            } else {
                committedEdge = 0;
                targetScrollLeft = 0;
            }

            const edgeLocked = maxScroll > 0 && committedEdge !== 0;
            const viewportResponse = viewportBaseResponse + viewportEdgeStrength * viewportEdgeResponseBoost;
            const effectiveLerp = clamp((scrollLerp + (edgeLocked ? edgeLockLerpBoost : 0)) * viewportResponse, 0.006, 0.9);
            const scrollDelta = (targetScrollLeft - animatedScrollLeft) * effectiveLerp;
            const limitedScrollDelta = Math.abs(scrollDelta) > maxScrollStepPx
                ? Math.sign(scrollDelta) * maxScrollStepPx
                : scrollDelta;
            animatedScrollLeft += limitedScrollDelta;
            if (Math.abs(targetScrollLeft - animatedScrollLeft) < 0.35) {
                animatedScrollLeft = targetScrollLeft;
            }
            if (maxScroll > 0 && Math.abs($stripElement.scrollLeft - animatedScrollLeft) > 0.35) {
                $stripElement.scrollLeft = animatedScrollLeft;
            }

            const overflowRatio = maxScroll > 0 ? clamp(maxScroll / Math.max($stripElement.clientWidth, 1), 0, 1) : 0;
            const reactiveX = committedEdge === 0 ? normalizedStripX : (committedEdge > 0 ? 1 : 0);
            if (disableCollectiveMotion) {
                clearAll();
            } else {
                applyCollectiveItemState(reactiveX, overflowRatio);
            }

            if (Math.abs(targetScrollLeft - animatedScrollLeft) > 0.35) {
                queueFlush();
            }
        };

        const queueFlush = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(flush);
        };

        const handlePointerEnter = (event) => {
            if (event.pointerType === "touch") return;
            active = true;
            pointerType = event.pointerType || "mouse";
            pointerX = event.clientX;
            animatedScrollLeft = $stripElement.scrollLeft;
            targetScrollLeft = $stripElement.scrollLeft;
            committedEdge = 0;
            queueFlush();
        };

        const handlePointerMove = (event) => {
            if (event.pointerType === "touch") return;
            active = true;
            pointerType = event.pointerType || "mouse";
            pointerX = event.clientX;
            queueFlush();
        };

        const handlePointerLeave = () => {
            active = false;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = 0;
            }
            committedEdge = 0;
            clearAll();
        };

        const handleScrollSync = () => {
            if (active) return;
            animatedScrollLeft = $stripElement.scrollLeft;
            targetScrollLeft = $stripElement.scrollLeft;
            committedEdge = 0;
        };

        const bindMediaQueryReset = (query) => {
            if (!query) return;
            if (typeof query.addEventListener === "function") {
                query.addEventListener("change", handlePointerLeave);
                return;
            }
            if (typeof query.addListener === "function") {
                query.addListener(handlePointerLeave);
            }
        };

        $stripElement.addEventListener("pointerenter", handlePointerEnter);
        $stripElement.addEventListener("pointermove", handlePointerMove);
        $stripElement.addEventListener("pointerleave", handlePointerLeave);
        $stripElement.addEventListener("scroll", handleScrollSync, { passive: true });
        bindMediaQueryReset(reduceMotionQuery);
        bindMediaQueryReset(fineHoverQuery);
    };

    const userPresetControls = new Map();

    /**
     * @param {string} slotId
     * @returns {string}
     */
    const getUserPresetShortLabel = (slotId) => {
        const suffix = String(slotId || "").split("_").pop() || "00";
        return `USR.${suffix}`;
    };

    /**
     * @param {string} updatedAt
     * @returns {string}
     */
    const formatUserPresetTimestamp = (updatedAt) => {
        if (typeof updatedAt !== "string" || !updatedAt) return "EMPTY";
        const parsed = new Date(updatedAt);
        if (Number.isNaN(parsed.getTime())) return "SAVED";
        const hh = String(parsed.getHours()).padStart(2, "0");
        const mm = String(parsed.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
    };

    /**
     * @param {{
     *   title: string;
     *   meta: string;
     *   buttonTitle: string;
     *   ariaLabel: string;
     *   kind?: string;
     * }} config
     */
    const createPresetQuickButton = (config) => {
        const $button = document.createElement("button");
        $button.type = "button";
        $button.className = "hud-control-btn hud-mode-btn";
        $button.classList.add("hud-hover-reactive-item");
        $button.dataset.active = "0";
        if (typeof config.kind === "string" && config.kind) {
            $button.dataset.kind = config.kind;
        }
        $button.title = config.buttonTitle;
        $button.setAttribute("aria-label", config.ariaLabel);

        const $name = document.createElement("span");
        $name.className = "hud-mode-name";
        $name.textContent = config.title;

        const $meta = document.createElement("span");
        $meta.className = "hud-mode-meta";
        $meta.textContent = config.meta;

        $button.append($name, $meta);

        return {
            button: $button,
            name: $name,
            meta: $meta,
        };
    };

    /**
     * @param {{
     *   cardTitle: string;
     *   label: string;
     *   meta: string;
     *   knobAriaLabel: string;
     * }} config
     */
    const createPresetMorphCard = (config) => {
        const $modeCard = document.createElement("div");
        $modeCard.className = "hud-mode-card";
        $modeCard.dataset.active = "0";
        $modeCard.dataset.empty = "0";
        $modeCard.title = config.cardTitle;

        const $modeKnob = document.createElement("div");
        $modeKnob.className = "hud-mode-knob";
        $modeKnob.tabIndex = 0;
        $modeKnob.setAttribute("role", "slider");
        $modeKnob.setAttribute("aria-label", config.knobAriaLabel);
        $modeKnob.setAttribute("aria-valuemin", "0");
        $modeKnob.setAttribute("aria-valuemax", "100");
        $modeKnob.setAttribute("aria-valuenow", "0");
        $modeKnob.setAttribute("aria-disabled", "false");

        const $modeKnobCore = document.createElement("div");
        $modeKnobCore.className = "hud-mode-knob-core";
        const $modeKnobPointer = document.createElement("div");
        $modeKnobPointer.className = "hud-mode-knob-pointer";
        const $modeKnobDot = document.createElement("div");
        $modeKnobDot.className = "hud-mode-knob-dot";
        $modeKnob.append($modeKnobCore, $modeKnobPointer, $modeKnobDot);

        const $name = document.createElement("span");
        $name.className = "hud-mode-name";
        $name.textContent = config.label.toUpperCase().slice(0, 6);

        const $meta = document.createElement("span");
        $meta.className = "hud-mode-meta";
        $meta.textContent = config.meta;

        const $amount = document.createElement("span");
        $amount.className = "hud-mode-amount";
        $amount.textContent = "0%";

        $modeCard.append($modeKnob, $name, $meta, $amount);
        $modeCard.classList.add("hud-hover-reactive-item");

        return {
            card: $modeCard,
            knob: $modeKnob,
            pointer: $modeKnobPointer,
            amount: $amount,
            name: $name,
            meta: $meta,
        };
    };

    const refreshPresetLaneMeasurements = () => {
        const expandedWidth = Math.ceil($stockPresetLaneTrack.scrollWidth);
        $stockPresetLane.style.setProperty("--hud-stock-lane-expanded-width", `${Math.max(0, expandedWidth)}px`);
        const expandedCardWidth = Math.ceil($stockModeCardLaneTrack.scrollWidth);
        $stockModeCardLane.style.setProperty("--hud-stock-mode-lane-expanded-width", `${Math.max(0, expandedCardWidth)}px`);
        const expandedUserCardWidth = Math.ceil($userModeCardLaneTrack.scrollWidth);
        $userModeCardLane.style.setProperty("--hud-user-mode-lane-expanded-width", `${Math.max(0, expandedUserCardWidth)}px`);
    };

    const syncPresetSpacerWidths = () => {
        /** @param {HTMLElement} $source */
        const measureWidth = ($source) => Math.max(0, Math.ceil($source.getBoundingClientRect().width));
        /**
         * @param {HTMLElement} $spacer
         * @param {HTMLElement} $source
         */
        const applyWidth = ($spacer, $source) => {
            const width = measureWidth($source);
            $spacer.style.flexBasis = `${width}px`;
            $spacer.style.width = `${width}px`;
            $spacer.style.minWidth = `${width}px`;
            $spacer.style.maxWidth = `${width}px`;
        };
        applyWidth($stockKnobToggleSpacer, $stockKnobToggle);
        applyWidth($stockGroupSpacer, $stockGroupLabel);
        applyWidth($userKnobToggleSpacer, $userKnobToggle);
        applyWidth($userGroupSpacer, $userGroupLabel);
        applyWidth($savePresetSpacer, $savePreset);
    };

    const bindLinkedHorizontalScroll = ($a, $b) => {
        let syncingA = false;
        let syncingB = false;
        const sync = (source, target, key) => {
            const nextLeft = source.scrollLeft;
            if (Math.abs(target.scrollLeft - nextLeft) < 0.5) return;
            if (key === "a") {
                syncingB = true;
            } else {
                syncingA = true;
            }
            target.scrollLeft = nextLeft;
        };
        $a.addEventListener("scroll", () => {
            if (syncingA) {
                syncingA = false;
                return;
            }
            sync($a, $b, "a");
        }, { passive: true });
        $b.addEventListener("scroll", () => {
            if (syncingB) {
                syncingB = false;
                return;
            }
            sync($b, $a, "b");
        }, { passive: true });
    };

    const refreshStockPresetLaneUI = () => {
        const isExpanded = stockQuickPresetsExpanded;
        const hasActiveStockPreset = modeControls.has(activeModePresetId);
        $stockPresetLane.dataset.expanded = isExpanded ? "1" : "0";
        $stockPresetLane.dataset.hasActive = hasActiveStockPreset ? "1" : "0";
        $stockModeCardLane.dataset.hasActive = hasActiveStockPreset ? "1" : "0";
        $stockGroupLabel.dataset.expanded = isExpanded ? "1" : "0";
        $stockGroupLabel.dataset.active = hasActiveStockPreset ? "1" : "0";
        $stockGroupLabel.title = isExpanded ? "Hide stock presets" : "Show stock presets";
        $stockGroupLabel.setAttribute("aria-label", isExpanded ? "Hide stock presets" : "Show stock presets");
        $stockGroupLabel.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        refreshPresetLaneMeasurements();
    };

    const refreshStockPresetKnobUI = () => {
        const isExpanded = stockPresetKnobsExpanded;
        $stockKnobToggle.dataset.expanded = isExpanded ? "1" : "0";
        $stockKnobToggle.title = isExpanded ? "Hide stock preset knobs" : "Show stock preset knobs";
        $stockKnobToggle.setAttribute("aria-label", isExpanded ? "Hide stock preset knobs" : "Show stock preset knobs");
        $stockKnobToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        $stockModeCardLane.dataset.expanded = isExpanded ? "1" : "0";
    };

    const refreshUserPresetKnobUI = () => {
        const isExpanded = userPresetKnobsExpanded;
        $userKnobToggle.dataset.expanded = isExpanded ? "1" : "0";
        $userKnobToggle.title = isExpanded ? "Hide user preset knobs" : "Show user preset knobs";
        $userKnobToggle.setAttribute("aria-label", isExpanded ? "Hide user preset knobs" : "Show user preset knobs");
        $userKnobToggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        $userModeCardLane.dataset.expanded = isExpanded ? "1" : "0";
    };

    /**
     * @param {boolean} expanded
     */
    const setStockQuickPresetsExpanded = (expanded) => {
        stockQuickPresetsExpanded = !!expanded;
        refreshStockPresetLaneUI();
    };

    /**
     * @param {boolean} expanded
     */
    const setStockPresetKnobsExpanded = (expanded) => {
        stockPresetKnobsExpanded = !!expanded;
        refreshStockPresetKnobUI();
        refreshPresetKnobCollapseUI();
    };

    /**
     * @param {boolean} expanded
     */
    const setUserPresetKnobsExpanded = (expanded) => {
        userPresetKnobsExpanded = !!expanded;
        refreshUserPresetKnobUI();
        refreshPresetKnobCollapseUI();
    };

    /**
     * @param {{
     *   label: string;
     *   ariaLabel: string;
     *   min: number;
     *   max: number;
     *   step: number;
     *   value: number;
     *   formatValue: (value: number) => string;
     *   onChange: (value: number) => void;
     * }} config
     */
    const createMicroKnobControl = (config) => {
        const $control = document.createElement("div");
        $control.className = "hud-mini-knob-control";

        const $shell = document.createElement("div");
        $shell.className = "hud-mini-knob-shell";
        $shell.tabIndex = 0;
        $shell.setAttribute("role", "slider");
        $shell.setAttribute("aria-label", config.ariaLabel);
        $shell.setAttribute("aria-valuemin", String(config.min));
        $shell.setAttribute("aria-valuemax", String(config.max));

        const $core = document.createElement("div");
        $core.className = "hud-mini-knob-core";
        const $pointer = document.createElement("div");
        $pointer.className = "hud-mini-knob-pointer";
        const $dot = document.createElement("div");
        $dot.className = "hud-mini-knob-dot";
        $shell.append($core, $pointer, $dot);

        const $label = document.createElement("span");
        $label.className = "hud-mini-knob-label";
        $label.textContent = config.label;

        const $value = document.createElement("span");
        $value.className = "hud-mini-knob-value";

        $control.append($shell, $label, $value);

        const quantizeValue = (rawValue) => {
            const bounded = clamp(rawValue, config.min, config.max);
            if (Number.isFinite(config.step) && config.step > 0) {
                const steps = Math.round((bounded - config.min) / config.step);
                return clamp(config.min + steps * config.step, config.min, config.max);
            }
            return bounded;
        };

        let currentValue = quantizeValue(config.value);
        const dragState = {
            pointerId: -1,
            startX: 0,
            startY: 0,
            startValue: currentValue,
        };

        const syncUI = () => {
            const range = Math.max(config.max - config.min, 0.0001);
            const progress = clamp((currentValue - config.min) / range, 0, 1);
            const angle = -140 + progress * 280;
            const valueLabel = config.formatValue(currentValue);
            $pointer.style.transform = `translate(-50%, -100%) rotate(${angle.toFixed(1)}deg)`;
            $value.textContent = valueLabel;
            $shell.setAttribute("aria-valuenow", String(currentValue));
            $shell.setAttribute("aria-valuetext", valueLabel);
        };

        const setValue = (nextValue, options = {}) => {
            const { emit = true, force = false } = options;
            const next = quantizeValue(nextValue);
            const tolerance = Number.isFinite(config.step) && config.step > 0
                ? Math.max(config.step / 4, 0.0001)
                : 0.0001;
            if (!force && Math.abs(next - currentValue) < tolerance) return currentValue;
            currentValue = next;
            syncUI();
            if (emit) config.onChange(currentValue);
            return currentValue;
        };

        $shell.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            event.preventDefault();
            dragState.pointerId = event.pointerId;
            dragState.startX = event.clientX;
            dragState.startY = event.clientY;
            dragState.startValue = currentValue;
            try {
                $shell.setPointerCapture(event.pointerId);
            } catch {
                // Ignore pointer capture failures on unsupported browsers.
            }
        });

        $shell.addEventListener("pointermove", (event) => {
            if (dragState.pointerId !== event.pointerId) return;
            event.preventDefault();
            const dy = dragState.startY - event.clientY;
            const dx = event.clientX - dragState.startX;
            const delta = ((dy + dx * 0.4) / 170) * (config.max - config.min);
            setValue(dragState.startValue + delta);
        });

        const endDrag = (event) => {
            if (dragState.pointerId !== event.pointerId) return;
            event.preventDefault();
            try {
                if ($shell.hasPointerCapture(event.pointerId)) {
                    $shell.releasePointerCapture(event.pointerId);
                }
            } catch {
                // Ignore pointer capture cleanup errors.
            }
            dragState.pointerId = -1;
        };

        $shell.addEventListener("pointerup", endDrag);
        $shell.addEventListener("pointercancel", endDrag);
        $shell.addEventListener("lostpointercapture", () => {
            dragState.pointerId = -1;
        });

        $shell.addEventListener("keydown", (event) => {
            const key = event.key;
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(key)) return;
            event.preventDefault();
            if (key === "Home") {
                setValue(config.min);
                return;
            }
            if (key === "End") {
                setValue(config.max);
                return;
            }
            const step = (key === "PageUp" || key === "PageDown")
                ? Math.max(config.step * 5, (config.max - config.min) / 12)
                : config.step;
            const direction = (key === "ArrowUp" || key === "ArrowRight" || key === "PageUp") ? 1 : -1;
            setValue(currentValue + step * direction);
        });

        syncUI();

        return {
            root: $control,
            shell: $shell,
            setValue,
            getValue: () => currentValue,
        };
    };

    /**
     * @param {{
     *   label: string;
     *   ariaLabel: string;
     *   min: number;
     *   max: number;
     *   step: number;
     *   value: number;
     *   formatValue: (value: number) => string;
     *   formatAriaValue?: (value: number) => string;
     *   onChange: (value: number) => void;
     * }} config
     */
    const createMiniSliderControl = (config) => {
        const $control = document.createElement("div");
        $control.className = "hud-mini-slider-control";
        $control.title = config.ariaLabel;

        const $label = document.createElement("span");
        $label.className = "hud-mini-slider-label";
        $label.textContent = config.label;

        const $value = document.createElement("span");
        $value.className = "hud-mini-slider-value";

        const $rail = document.createElement("div");
        $rail.className = "hud-mini-slider-rail";
        const $fill = document.createElement("div");
        $fill.className = "hud-mini-slider-fill";
        const $thumb = document.createElement("div");
        $thumb.className = "hud-mini-slider-thumb";
        const $input = document.createElement("input");
        $input.className = "hud-mini-slider-input";
        $input.type = "range";
        $input.min = String(config.min);
        $input.max = String(config.max);
        $input.step = String(config.step);
        $input.setAttribute("aria-label", config.ariaLabel);
        $rail.append($fill, $thumb, $input);
        $control.append($label, $value, $rail);

        const quantizeValue = (rawValue) => {
            const bounded = clamp(rawValue, config.min, config.max);
            if (Number.isFinite(config.step) && config.step > 0) {
                const steps = Math.round((bounded - config.min) / config.step);
                return clamp(config.min + steps * config.step, config.min, config.max);
            }
            return bounded;
        };

        let currentValue = quantizeValue(config.value);
        const syncUI = () => {
            const range = Math.max(config.max - config.min, 0.0001);
            const progress = clamp((currentValue - config.min) / range, 0, 1);
            const valueLabel = config.formatValue(currentValue);
            const ariaValueText = typeof config.formatAriaValue === "function"
                ? config.formatAriaValue(currentValue)
                : valueLabel;
            $value.textContent = valueLabel;
            $fill.style.transform = `scaleX(${progress.toFixed(4)})`;
            $thumb.style.left = `${(progress * 100).toFixed(2)}%`;
            $input.value = String(currentValue);
            $input.setAttribute("aria-valuetext", ariaValueText);
        };

        const setValue = (nextValue, options = {}) => {
            const { emit = true, force = false } = options;
            const next = quantizeValue(nextValue);
            const tolerance = Number.isFinite(config.step) && config.step > 0
                ? Math.max(config.step / 4, 0.0001)
                : 0.0001;
            if (!force && Math.abs(next - currentValue) < tolerance) return currentValue;
            currentValue = next;
            syncUI();
            if (emit) config.onChange(currentValue);
            return currentValue;
        };

        $input.addEventListener("input", () => {
            setValue(Number($input.value));
        });

        syncUI();

        return {
            root: $control,
            input: $input,
            setValue,
            getValue: () => currentValue,
        };
    };

    const refreshModeControlActiveUI = () => {
        modeControls.forEach((otherState, id) => {
            const isActive = id === activeModePresetId;
            otherState.card.dataset.active = isActive ? "1" : "0";
            otherState.knob.dataset.active = isActive ? "1" : "0";
            if (otherState.quickButton) {
                otherState.quickButton.dataset.active = isActive ? "1" : "0";
            }
        });
        userPresetControls.forEach((controlState, id) => {
            const isActive = id === activeModePresetId;
            controlState.button.dataset.active = isActive ? "1" : "0";
            if (controlState.card) {
                controlState.card.dataset.active = isActive ? "1" : "0";
            }
            if (controlState.knob) {
                controlState.knob.dataset.active = isActive ? "1" : "0";
            }
        });
        refreshStockPresetLaneUI();
    };

    const refreshSaveModeUI = () => {
        const armed = globalControlState.saveModeArmed;
        $savePreset.dataset.active = armed ? "1" : "0";
        $savePreset.dataset.saveArmed = armed ? "1" : "0";
        $savePreset.title = armed ? "Cancel save mode" : "Arm save mode";
        $savePreset.setAttribute("aria-label", armed ? "Cancel save mode" : "Arm save mode");
        $savePresetMeta.textContent = armed ? "SELECT" : "READY";
        userPresetControls.forEach((controlState) => {
            controlState.button.dataset.saveArmed = armed ? "1" : "0";
        });
        syncPresetSpacerWidths();
    };

    const refreshUserPresetButtonsUI = () => {
        userPresetControls.forEach((controlState, slotId) => {
            const slot = getUserPresetSlot(slotId);
            const isSaved = !!(slot && slot.saved && slot.values);
            const shortLabel = getUserPresetShortLabel(slotId);
            const stamp = isSaved ? formatUserPresetTimestamp(slot.updatedAt) : "EMPTY";
            controlState.button.dataset.empty = isSaved ? "0" : "1";
            controlState.meta.textContent = stamp;
            controlState.button.title = isSaved
                ? `${shortLabel} saved ${slot.updatedAt || "recently"}`
                : `${shortLabel} is empty`;
            controlState.button.setAttribute(
                "aria-label",
                isSaved
                    ? `${shortLabel} saved preset`
                    : `${shortLabel} empty preset slot`
            );
            controlState.targets = isSaved ? buildModePresetEntriesFromValues(slot.values) : [];
            controlState.card.dataset.empty = isSaved ? "0" : "1";
            controlState.knob.dataset.empty = isSaved ? "0" : "1";
            controlState.knob.tabIndex = isSaved ? 0 : -1;
            controlState.knob.setAttribute("aria-disabled", isSaved ? "false" : "true");
            controlState.card.title = isSaved
                ? `${shortLabel} · ${stamp}`
                : `${shortLabel} · EMPTY`;
            controlState.knob.setAttribute("aria-label", isSaved ? `${shortLabel} morph` : `${shortLabel} empty preset slot`);
            controlState.metaLabel.textContent = stamp;
            if (!isSaved) {
                controlState.baseline = null;
                if (activeModePresetId === slotId) {
                    activeModePresetId = "";
                }
                setModeMorphAmount(controlState, 0, { apply: false, force: true });
            }
        });
        refreshSaveModeUI();
        refreshModeControlActiveUI();
        refreshFooterPresetTransferConsoleUI();
    };

    /**
     * @param {{
     *   preset: ModePreset;
     *   targets: { path: string; value: number; control: DSPControl }[];
     *   value: number;
     *   baseline: Map<string, number> | null;
     *   card: HTMLElement;
     *   knob: HTMLElement;
     *   pointer: HTMLElement;
     *   amount: HTMLElement;
     *   haptic: { touchActive: boolean; touchPointerId: number; lastTickAt: number; lastBucket: number };
     * }} controlState
     * @param {number} value
     * @param {{ apply?: boolean; force?: boolean }} [options]
     */
    const maybeTriggerPresetHapticTick = (controlState) => {
        const haptic = controlState.haptic;
        if (!haptic.touchActive) return;
        if (!canUseTouchHaptics()) return;
        const bucket = Math.round(clamp(controlState.value, 0, 1) * PRESET_HAPTIC_TICK_BUCKET_COUNT);
        const now = performance.now();
        if (haptic.lastBucket < 0) {
            haptic.lastBucket = bucket;
            return;
        }
        if (bucket === haptic.lastBucket) return;
        haptic.lastBucket = bucket;
        if (now - haptic.lastTickAt < PRESET_HAPTIC_TICK_MIN_INTERVAL_MS) return;
        haptic.lastTickAt = now;
        triggerTouchHapticTick(PRESET_HAPTIC_TICK_DURATION_MS);
    };

    const setModeMorphAmount = (controlState, value, options = {}) => {
        const { apply = true, force = false } = options;
        const next = clamp(value, 0, 1);
        if (!force && Math.abs(next - controlState.value) < 0.0001) return;
        controlState.value = next;
        const angle = -140 + next * 280;
        controlState.pointer.style.transform = `translate(-50%, -100%) rotate(${angle.toFixed(1)}deg)`;
        controlState.amount.textContent = `${Math.round(next * 100)}%`;
        controlState.knob.setAttribute("aria-valuenow", String(Math.round(next * 100)));
        if (apply && controlState.targets.length > 0) {
            if (!(controlState.baseline instanceof Map)) {
                controlState.baseline = snapshotCurrentParamMap();
            }
            const entries = buildPresetMorphEntries(controlState.targets, controlState.baseline, next);
            applyParamValues(entries);
        }
        maybeTriggerPresetHapticTick(controlState);
        activeModePresetId = next > 0.001 ? controlState.preset.id : "";
        refreshModeControlActiveUI();
    };

    /**
     * @param {string} [exceptId]
     */
    const resetPresetMorphIndicators = (exceptId = "") => {
        modeControls.forEach((otherState, id) => {
            if (id === exceptId) return;
            otherState.baseline = null;
            setModeMorphAmount(otherState, 0, { apply: false, force: true });
        });
        userPresetControls.forEach((otherState, id) => {
            if (id === exceptId) return;
            otherState.baseline = null;
            setModeMorphAmount(otherState, 0, { apply: false, force: true });
        });
    };

    /**
     * @param {{
     *   preset: ModePreset;
     *   targets: { path: string; value: number; control: DSPControl }[];
     *   value: number;
     *   baseline: Map<string, number> | null;
     * }} controlState
     * @param {number} [durationMs]
     */
    const runQuickPresetMorph = (controlState, durationMs = globalControlState.morphDurationMs) => {
        if (!controlState || !Array.isArray(controlState.targets) || controlState.targets.length === 0) return Promise.resolve(false);
        const duration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : globalControlState.morphDurationMs;
        resetPresetMorphIndicators(controlState.preset.id);
        controlState.baseline = snapshotCurrentParamMap();
        setModeMorphAmount(controlState, 0, { apply: false, force: true });
        activeModePresetId = controlState.preset.id;
        refreshModeControlActiveUI();
        const morphPromise = morphToPresetValues(controlState.targets, duration);
        if (!(duration > 0)) {
            setModeMorphAmount(controlState, 1, { apply: false, force: true });
            return morphPromise;
        }
        const token = modeMorphToken;
        const startedAt = performance.now();
        const animateIndicator = (now) => {
            if (token !== modeMorphToken) return;
            const progress = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            setModeMorphAmount(controlState, Math.max(0.001, eased), { apply: false, force: true });
            if (progress < 1) {
                requestAnimationFrame(animateIndicator);
                return;
            }
            setModeMorphAmount(controlState, 1, { apply: false, force: true });
        };
        requestAnimationFrame(animateIndicator);
        return morphPromise;
    };

    runQuickPresetMorphExternal = (presetId, durationMs = globalControlState.morphDurationMs) => {
        const id = normalizeUserPresetSlotId(presetId) || presetId;
        const controlState = modeControls.get(presetId) || modeControls.get(id) || userPresetControls.get(id);
        if (!controlState) return Promise.resolve(false);
        return runQuickPresetMorph(controlState, durationMs);
    };
    clearPresetMorphIndicatorsExternal = () => {
        resetPresetMorphIndicators();
    };

    /**
     * @param {{
     *   value: number;
     *   baseline: Map<string, number> | null;
   * }} controlState
     */
    const beginModeMorphFromCurrent = (controlState) => {
        cancelModeMorph();
        controlState.baseline = snapshotCurrentParamMap();
        setModeMorphAmount(controlState, 0, { apply: true, force: true });
    };

    /**
     * @param {{
     *   preset: { id: string };
     *   targets: { path: string; value: number; control: DSPControl }[];
     *   value: number;
     *   baseline: Map<string, number> | null;
     *   card: HTMLElement;
     *   knob: HTMLElement;
     *   pointer: HTMLElement;
     *   amount: HTMLElement;
     *   haptic: { touchActive: boolean; touchPointerId: number; lastTickAt: number; lastBucket: number };
     * }} controlState
     */
    const bindMorphCardInteractions = (controlState) => {
        const dragState = {
            pointerId: -1,
            startX: 0,
            startY: 0,
            startValue: 0,
        };

        controlState.knob.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            if (!Array.isArray(controlState.targets) || controlState.targets.length === 0) return;
            event.preventDefault();
            event.stopPropagation();
            beginModeMorphFromCurrent(controlState);
            if (event.pointerType === "touch") {
                controlState.haptic.touchActive = true;
                controlState.haptic.touchPointerId = event.pointerId;
                controlState.haptic.lastTickAt = 0;
                controlState.haptic.lastBucket = -1;
                primeIOSHapticFallback();
            } else {
                controlState.haptic.touchActive = false;
                controlState.haptic.touchPointerId = -1;
                controlState.haptic.lastTickAt = 0;
                controlState.haptic.lastBucket = -1;
            }
            dragState.pointerId = event.pointerId;
            dragState.startX = event.clientX;
            dragState.startY = event.clientY;
            dragState.startValue = controlState.value;
            try {
                controlState.knob.setPointerCapture(event.pointerId);
            } catch {
                // Ignore browsers that fail pointer capture for synthetic events.
            }
        });

        controlState.knob.addEventListener("pointermove", (event) => {
            if (dragState.pointerId !== event.pointerId) return;
            event.preventDefault();
            const dy = dragState.startY - event.clientY;
            const dx = event.clientX - dragState.startX;
            const delta = (dy + dx * 0.4) / 170;
            setModeMorphAmount(controlState, dragState.startValue + delta);
        });

        const endDrag = (event) => {
            if (dragState.pointerId !== event.pointerId) return;
            event.preventDefault();
            try {
                if (controlState.knob.hasPointerCapture(event.pointerId)) {
                    controlState.knob.releasePointerCapture(event.pointerId);
                }
            } catch {
                // Ignore pointer capture cleanup errors.
            }
            if (
                controlState.haptic.touchPointerId === -1 ||
                controlState.haptic.touchPointerId === event.pointerId
            ) {
                controlState.haptic.touchActive = false;
                controlState.haptic.touchPointerId = -1;
                controlState.haptic.lastTickAt = 0;
                controlState.haptic.lastBucket = -1;
            }
            dragState.pointerId = -1;
        };

        controlState.knob.addEventListener("pointerup", endDrag);
        controlState.knob.addEventListener("pointercancel", endDrag);
        controlState.knob.addEventListener("lostpointercapture", () => {
            controlState.haptic.touchActive = false;
            controlState.haptic.touchPointerId = -1;
            controlState.haptic.lastTickAt = 0;
            controlState.haptic.lastBucket = -1;
            dragState.pointerId = -1;
        });

        controlState.knob.addEventListener("keydown", (event) => {
            if (!Array.isArray(controlState.targets) || controlState.targets.length === 0) return;
            const key = event.key;
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(key)) return;
            event.preventDefault();
            if (!(controlState.baseline instanceof Map)) {
                beginModeMorphFromCurrent(controlState);
            }
            if (key === "Home") {
                setModeMorphAmount(controlState, 0);
                return;
            }
            if (key === "End") {
                setModeMorphAmount(controlState, 1);
                return;
            }
            const step = (key === "PageUp" || key === "PageDown") ? 0.1 : 0.03;
            const direction = (key === "ArrowUp" || key === "ArrowRight" || key === "PageUp") ? 1 : -1;
            setModeMorphAmount(controlState, controlState.value + step * direction);
        });
    };

    MODE_PRESETS.forEach((preset, presetIndex) => {
        const targets = buildModePresetEntries(preset);
        if (targets.length === 0) return;

        const stockButtonControl = createPresetQuickButton({
            title: preset.title.toUpperCase(),
            meta: preset.subtitle.toUpperCase(),
            buttonTitle: `${preset.title} · ${preset.subtitle}`,
            ariaLabel: `${preset.title} quick morph`,
        });
        const $modeButton = stockButtonControl.button;
        $stockPresetLaneTrack.appendChild($modeButton);
        const stockCardControl = createPresetMorphCard({
            cardTitle: `${preset.title} · ${preset.subtitle}`,
            label: preset.title.toUpperCase(),
            meta: preset.subtitle.toUpperCase(),
            knobAriaLabel: `${preset.title} morph`,
        });
        $stockModeCardLaneTrack.appendChild(stockCardControl.card);
        presetButtonReactiveItems.push($modeButton);
        presetCardReactiveItems.push(stockCardControl.card);

        const controlState = {
            preset,
            presetIndex,
            targets,
            value: 0,
            baseline: null,
            card: stockCardControl.card,
            knob: stockCardControl.knob,
            pointer: stockCardControl.pointer,
            amount: stockCardControl.amount,
            quickButton: $modeButton,
            haptic: {
                touchActive: false,
                touchPointerId: -1,
                lastTickAt: 0,
                lastBucket: -1,
            },
        };
        modeControls.set(preset.id, controlState);
        setModeMorphAmount(controlState, 0, { apply: false, force: true });
        bindMorphCardInteractions(controlState);

        $modeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            runQuickPresetMorph(controlState);
        });
    });

    refreshPresetLaneMeasurements();
    $modeButtonStrip.append($userKnobToggle, $userGroupLabel, $savePreset);
    $modeStrip.append($userKnobToggleSpacer, $userGroupSpacer, $savePresetSpacer, $userModeCardLane);

    userPresetSlots.forEach((slot, index) => {
        const userButtonControl = createPresetQuickButton({
            title: getUserPresetShortLabel(slot.id),
            meta: "EMPTY",
            buttonTitle: `${getUserPresetShortLabel(slot.id)} preset slot`,
            ariaLabel: `${getUserPresetShortLabel(slot.id)} preset slot`,
        });
        const $userButton = userButtonControl.button;
        $modeButtonStrip.appendChild($userButton);
        presetButtonReactiveItems.push($userButton);
        const userCardControl = createPresetMorphCard({
            cardTitle: `${getUserPresetShortLabel(slot.id)} · EMPTY`,
            label: getUserPresetShortLabel(slot.id),
            meta: "EMPTY",
            knobAriaLabel: `${getUserPresetShortLabel(slot.id)} empty preset slot`,
        });
        userCardControl.card.dataset.empty = "1";
        userCardControl.knob.dataset.empty = "1";
        userCardControl.knob.tabIndex = -1;
        userCardControl.knob.setAttribute("aria-disabled", "true");
        $userModeCardLaneTrack.appendChild(userCardControl.card);
        presetCardReactiveItems.push(userCardControl.card);

        const controlState = {
            preset: {
                id: slot.id,
                title: getUserPresetShortLabel(slot.id),
                subtitle: "EMPTY",
            },
            paletteIndex: MODE_PRESETS.length + index + 1,
            targets: [],
            value: 0,
            baseline: null,
            card: userCardControl.card,
            knob: userCardControl.knob,
            pointer: userCardControl.pointer,
            amount: userCardControl.amount,
            name: userButtonControl.name,
            meta: userButtonControl.meta,
            metaLabel: userCardControl.meta,
            button: $userButton,
            quickButton: $userButton,
            haptic: {
                touchActive: false,
                touchPointerId: -1,
                lastTickAt: 0,
                lastBucket: -1,
            },
        };
        userPresetControls.set(slot.id, controlState);
        setModeMorphAmount(controlState, 0, { apply: false, force: true });
        bindMorphCardInteractions(controlState);

        Object.assign(controlState, {
            ...userButtonControl,
            card: userCardControl.card,
            knob: userCardControl.knob,
            pointer: userCardControl.pointer,
            amount: userCardControl.amount,
            metaLabel: userCardControl.meta,
        });

        $userButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (globalControlState.saveModeArmed) {
                const currentSlot = getUserPresetSlot(slot.id);
                if (currentSlot?.saved && !window.confirm(`Overwrite ${getUserPresetShortLabel(slot.id)} with the current preset state?`)) {
                    return;
                }
                saveUserPresetSlot(slot.id, snapshotCurrentPresetValues());
                globalControlState.saveModeArmed = false;
                refreshUserPresetButtonsUI();
                return;
            }
            runQuickPresetMorph(controlState);
        });
    });
    refreshUserPresetButtonsUIExternal = refreshUserPresetButtonsUI;
    mountFooterPresetTransferConsole();
    refreshUserPresetButtonsUI();
    refreshStockPresetLaneUI();

    $savePreset.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        globalControlState.saveModeArmed = !globalControlState.saveModeArmed;
        refreshUserPresetButtonsUI();
    });

    $stockGroupLabel.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setStockQuickPresetsExpanded(!stockQuickPresetsExpanded);
    });

    const gainControl = getGainDSPControl();
    const rootControl = getRootDSPControl();
    if (rootControl) {
        setEffectiveRootState(getCurrentControlValue(rootControl));
    }

    const motionIntensitySlider = createMiniSliderControl({
        label: "MOTN",
        ariaLabel: "Motion sensitivity",
        min: MOTION_INTENSITY_MIN,
        max: MOTION_INTENSITY_MAX,
        step: MOTION_INTENSITY_STEP,
        value: globalControlState.motionIntensity,
        formatValue: (value) => formatMotionIntensityLabel(value),
        formatAriaValue: (value) => formatMotionIntensityAriaText(value),
        onChange: (value) => {
            setGlobalMotionIntensity(value);
        },
    });

    const gainValueDecimals = gainControl && Number.isFinite(gainControl.step) && gainControl.step > 0 && gainControl.step < 1 ? 1 : 0;
    const gainKnob = createMicroKnobControl({
        label: "GAIN",
        ariaLabel: "Global gain",
        min: gainControl?.min ?? -36,
        max: gainControl?.max ?? -3,
        step: gainControl?.step ?? 0.1,
        value: gainControl ? getCurrentControlValue(gainControl) : -12,
        formatValue: (value) => `${value.toFixed(gainValueDecimals)}DB`,
        onChange: (value) => {
            if (!gainControl) return;
            applyParamValues([{ path: gainControl.address, value }]);
        },
    });

    const rootValueDecimals = rootControl && Number.isFinite(rootControl.step) && rootControl.step > 0 && rootControl.step < 1 ? 1 : 0;
    const rootKnob = createMicroKnobControl({
        label: "ROOT",
        ariaLabel: "Global root",
        min: rootControl?.min ?? 55,
        max: rootControl?.max ?? 220,
        step: rootControl?.step ?? 0.1,
        value: globalControlState.effectiveRootHz,
        formatValue: (value) => `${value.toFixed(rootValueDecimals)}HZ`,
        onChange: (value) => {
            if (!rootControl) return;
            applyParamValues([{ path: rootControl.address, value }]);
        },
    });

    const transposeKnob = createMicroKnobControl({
        label: "TRNS",
        ariaLabel: "Global transpose",
        min: GLOBAL_TRANSPOSE_MIN,
        max: GLOBAL_TRANSPOSE_MAX,
        step: GLOBAL_TRANSPOSE_STEP,
        value: globalControlState.transposeSemitones,
        formatValue: (value) => `${value > 0 ? "+" : ""}${Math.round(value)}ST`,
        onChange: (value) => {
            setGlobalTransposeSemitones(value);
            rootKnob.setValue(globalControlState.effectiveRootHz, { emit: false, force: true });
        },
    });

    const timeKnob = createMicroKnobControl({
        label: "M.TIME",
        ariaLabel: "Global morph time",
        min: 0,
        max: MAX_GLOBAL_MORPH_DURATION_MS,
        step: GLOBAL_MORPH_STEP_MS,
        value: globalControlState.morphDurationMs,
        formatValue: (value) => value >= 1000
            ? `${(value / 1000).toFixed(value % 1000 === 0 ? 1 : 2)}S`
            : `${Math.round(value)}MS`,
        onChange: (value) => {
            setGlobalMorphDuration(value);
        },
    });

    $globalList.append(motionIntensitySlider.root, gainKnob.root, rootKnob.root, transposeKnob.root, timeKnob.root);
    motionIntensitySlider.setValue(globalControlState.motionIntensity, { emit: false, force: true });
    gainKnob.setValue(gainControl ? getCurrentControlValue(gainControl) : -12, { emit: false, force: true });
    rootKnob.setValue(globalControlState.effectiveRootHz, { emit: false, force: true });
    transposeKnob.setValue(globalControlState.transposeSemitones, { emit: false, force: true });
    timeKnob.setValue(globalControlState.morphDurationMs, { emit: false, force: true });

    if (faustUIBridge && typeof faustUIBridge.subscribeToParamChanges === "function") {
        faustUIBridge.subscribeToParamChanges((path, value) => {
            if (!Number.isFinite(value)) return;
            const controlKey = controlKeyFromAddress(path);
            if (controlKey === GAIN_CONTROL_KEY) {
                gainKnob.setValue(value, { emit: false, force: true });
                return;
            }
            if (controlKey !== ROOT_CONTROL_KEY) return;
            setEffectiveRootState(value);
            rootKnob.setValue(globalControlState.effectiveRootHz, { emit: false, force: true });
        });
    }

    refreshPresetShadeUI = () => {
        const theme = getHUDTheme(activeHUDThemeId);
        applyPresetShadePalette($stockKnobToggle, createPresetShadePalette(theme, 0));
        applyPresetShadePalette($userKnobToggle, createPresetShadePalette(theme, MODE_PRESETS.length + 1));
        applyPresetShadePalette($savePreset, createPresetShadePalette(theme, MODE_PRESETS.length));
        modeControls.forEach((controlState) => {
            const palette = createPresetShadePalette(theme, controlState.presetIndex);
            applyPresetShadePalette(controlState.quickButton, palette);
            applyPresetShadePalette(controlState.card, palette);
        });
        userPresetControls.forEach((controlState) => {
            const palette = createPresetShadePalette(theme, controlState.paletteIndex);
            applyPresetShadePalette(controlState.button, palette);
            applyPresetShadePalette(controlState.card, palette);
        });
    };
    refreshPresetShadeUI();

    $modeKnobCollapse.appendChild($modeStrip);
    $panel.appendChild($modeButtonStrip);
    $panel.appendChild($modeKnobCollapse);
    $divFaustUI.appendChild($panel);
    createMotionCubeGlyph($motionMode, $motionModeGlyph)
        .then((controller) => {
            if (!$motionMode.isConnected || !$motionModeGlyph.isConnected) {
                controller.dispose();
                return;
            }
            motionCubeController = controller;
            destroyMotionCubeGlyph = () => {
                if (!motionCubeController) return;
                motionCubeController.dispose();
                motionCubeController = null;
            };
            motionCubeController.refresh();
        })
        .catch((error) => {
            console.warn("Unable to mount the motion cube glyph:", error);
        });
    syncPresetSpacerWidths();
    bindLinkedHorizontalScroll($modeButtonStrip, $modeStrip);

    const topStripHoverPanConfig = {
        collectiveShift: 0,
        collectiveScale: 0,
        collectiveGlow: 0,
        collectiveBrightness: 0,
        collectiveSaturate: 0,
        contentParallax: 0,
        scrollLerp: 0.04,
        edgeLockLerpBoost: 0,
        edgeCommitThreshold: 0.12,
        edgeHoverOnly: true,
        disableCollectiveMotion: true,
        maxScrollStepPx: 2.4,
    };
    bindStripHoverPan($strip, topStripReactiveItems, topStripHoverPanConfig);
    const presetStripHoverPanConfig = {
        collectiveShift: 0,
        collectiveScale: 0,
        collectiveGlow: 0,
        collectiveBrightness: 0,
        collectiveSaturate: 0,
        contentParallax: 0,
        scrollLerp: 0.045,
        edgeLockLerpBoost: 0,
        edgeCommitThreshold: 0.13,
        edgeHoverOnly: true,
        disableCollectiveMotion: true,
        maxScrollStepPx: 2.6,
    };
    bindStripHoverPan($modeButtonStrip, presetButtonReactiveItems, presetStripHoverPanConfig);
    bindStripHoverPan($modeStrip, presetCardReactiveItems, presetStripHoverPanConfig);

    const refreshPresetKnobCollapseUI = () => {
        const isExpanded = stockPresetKnobsExpanded || userPresetKnobsExpanded;
        $modeKnobCollapse.dataset.expanded = isExpanded ? "1" : "0";
        document.documentElement.style.setProperty(
            "--hud-panel-reserve",
            isExpanded ? "var(--hud-panel-reserve-expanded)" : "var(--hud-panel-reserve-collapsed)"
        );
    };
    refreshPresetKnobCollapseUI();
    refreshStockPresetKnobUI();
    refreshUserPresetKnobUI();

    refreshStartControlUI = () => {
        const isOn = audioActivated || audioContext.state === "running";
        $start.textContent = isOn ? "ON" : "START";
        $start.dataset.active = isOn ? "1" : "0";
    };
    refreshStartControlUI();

    refreshMotionControlUI = () => {
        const active = motionModeState.active;
        $motionMode.dataset.active = active ? "1" : "0";
        $motionMode.title = active ? "Disable motion mode" : "Enable motion mode";
        $motionMode.setAttribute("aria-label", active ? "Disable motion mode" : "Enable motion mode");
        motionCubeController?.refresh();
    };
    refreshMotionControlUI();

    refreshMIDIControlUI = () => {
        const active = midiInputState.active;
        const inputCount = midiInputState.access ? midiInputState.access.inputs.size : 0;
        $midiMode.dataset.active = active ? "1" : "0";
        $midiMode.disabled = !midiInputState.supported;
        $midiMode.setAttribute("aria-pressed", active ? "true" : "false");
        if (!midiInputState.supported) {
            $midiMode.title = "Web MIDI is not supported in this browser";
            $midiMode.setAttribute("aria-label", "MIDI input unavailable: Web MIDI is not supported");
            return;
        }
        $midiMode.title = active
            ? `Disable MIDI input (${inputCount} input${inputCount === 1 ? "" : "s"})`
            : "Enable MIDI input";
        $midiMode.setAttribute("aria-label", active ? "Disable MIDI input" : "Enable MIDI input");
    };
    refreshMIDIControlUI();

    refreshAudioInputDeviceListUI = () => {
        $audioInputSelect.replaceChildren();
        $audioInputSelect.appendChild(new Option("DEFAULT", ""));
        liveInputState.devices.forEach((device, index) => {
            const label = device.label || `INPUT ${index + 1}`;
            $audioInputSelect.appendChild(new Option(label, device.deviceId));
        });
        const hasSelectedDevice = Array.from($audioInputSelect.options).some((option) => option.value === liveInputState.selectedDeviceId);
        if (!hasSelectedDevice) liveInputState.selectedDeviceId = "";
        $audioInputSelect.value = liveInputState.selectedDeviceId;
    };
    refreshAudioInputDeviceListUI();

    refreshLiveInputControlUI = () => {
        const inputCount = getFaustAudioInputCount();
        const available = liveInputState.supported && inputCount > 0;
        const active = liveInputState.active;
        $liveInput.dataset.active = active ? "1" : "0";
        $liveInput.dataset.inputUnavailable = available ? "0" : "1";
        $liveInput.disabled = !available;
        $liveInput.setAttribute("aria-pressed", active ? "true" : "false");
        $audioInputSelect.disabled = !available;
        $audioInputPicker.dataset.disabled = available ? "0" : "1";
        if (!liveInputState.supported) {
            $liveInput.title = "Live audio input is not supported in this browser";
            $liveInput.setAttribute("aria-label", "Live audio input unavailable: browser does not support media devices");
            $audioInputSelect.title = "Live audio input is not supported in this browser";
            return;
        }
        if (inputCount <= 0) {
            $liveInput.title = "Current Faust DSP exposes 0 live audio input channels";
            $liveInput.setAttribute("aria-label", "Live audio input unavailable: current Faust DSP has no audio inputs");
            $audioInputSelect.title = "Current Faust DSP exposes 0 live audio input channels";
            return;
        }
        $liveInput.title = active ? "Disable live audio input" : "Enable live audio input";
        $liveInput.setAttribute("aria-label", active ? "Disable live audio input" : "Enable live audio input");
        $audioInputSelect.title = "Select live audio input source";
    };
    refreshLiveInputControlUI();

    if (!liveInputState.deviceChangeBound && navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener("devicechange", () => {
            refreshAudioInputDevices().catch((error) => console.warn("Unable to refresh audio input devices:", error));
        });
        liveInputState.deviceChangeBound = true;
    }
    refreshAudioInputDevices().catch((error) => console.warn("Unable to enumerate audio input devices:", error));

    refreshMotionGlyphUI = () => {
        motionCubeController?.refresh();
    };
    refreshMotionGlyphUI();

    const refreshZoomControlUI = () => {
        if (!faustUIBridge || typeof faustUIBridge.getColumnRange !== "function" || typeof faustUIBridge.getColumns !== "function") {
            $zoomIn.disabled = true;
            $zoomOut.disabled = true;
            return;
        }
        const range = faustUIBridge.getColumnRange();
        const current = faustUIBridge.getColumns();
        if (!range || typeof range !== "object") {
            $zoomIn.disabled = true;
            $zoomOut.disabled = true;
            return;
        }
        const min = Number(range.min);
        const max = Number(range.max);
        $zoomIn.disabled = !Number.isFinite(min) || !Number.isFinite(current) || current <= min;
        $zoomOut.disabled = !Number.isFinite(max) || !Number.isFinite(current) || current >= max;
        const tip = `Controls per row: ${current} (${min}-${max})`;
        $zoomIn.title = `Zoom in. ${tip}`;
        $zoomOut.title = `Zoom out. ${tip}`;
    };
    refreshZoomControlUI();

    const getGridScroller = () => {
        const $candidate = $divFaustUI.querySelector("[data-faust-grid='1']");
        return ($candidate instanceof HTMLElement) ? $candidate : null;
    };

    const refreshScrollControlUI = () => {
        const $grid = getGridScroller();
        if (!$grid) {
            $scrollUp.disabled = true;
            $scrollDown.disabled = true;
            return;
        }
        const maxScroll = Math.max(0, $grid.scrollHeight - $grid.clientHeight);
        if (maxScroll <= 2) {
            $scrollUp.disabled = true;
            $scrollDown.disabled = true;
            return;
        }
        $scrollUp.disabled = $grid.scrollTop <= 1;
        $scrollDown.disabled = $grid.scrollTop >= (maxScroll - 1);
    };
    refreshScrollControlUI();

    const getFullscreenElement = () => {
        const docAny = /** @type {any} */ (document);
        return document.fullscreenElement || docAny.webkitFullscreenElement || null;
    };

    const refreshFullscreenControlUI = () => {
        const rootAny = /** @type {any} */ (document.documentElement);
        const docAny = /** @type {any} */ (document);
        const supported = Boolean(
            document.fullscreenEnabled ||
            docAny.webkitFullscreenEnabled ||
            document.documentElement.requestFullscreen ||
            rootAny.webkitRequestFullscreen
        );
        $fullscreen.disabled = !supported;
        const active = Boolean(getFullscreenElement());
        $fullscreen.dataset.active = active ? "1" : "0";
        $fullscreen.title = active ? "Exit fullscreen" : "Enter fullscreen";
        $fullscreen.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
    };
    refreshFullscreenControlUI();

    const withButtonBusyState = async ($button, work) => {
        $button.disabled = true;
        try {
            await work();
        } finally {
            $button.disabled = false;
        }
    };

    /**
     * @param {number} value
     */
    const setRandomButtonValue = (value) => {
        currentRandomButtonValue = value;
        const activePips = new Set(RANDOM_BUTTON_DICE_PIP_MAP[value] || RANDOM_BUTTON_DICE_PIP_MAP[1]);
        randomPips.forEach(($pip, index) => {
            $pip.dataset.active = activePips.has(index) ? "1" : "0";
        });
        if ($random.isConnected) {
            $random.dataset.value = String(value);
        }
    };
    setRandomButtonValue(currentRandomButtonValue);

    const rollRandomButtonGlyph = async () => {
        const startValue = currentRandomButtonValue;
        const finalValue = pickNextDiceValue(startValue);
        const rollStepCount = Math.max(
            RANDOM_BUTTON_ROLL_MIN_STEPS,
            Math.round(randomBetween(RANDOM_BUTTON_ROLL_MIN_STEPS, RANDOM_BUTTON_ROLL_MAX_STEPS))
        );
        let rollingValue = startValue;
        for (let index = 0; index < rollStepCount; index += 1) {
            rollingValue = pickNextDiceValue(rollingValue);
            setRandomButtonValue(rollingValue);
            const progress = (index + 1) / rollStepCount;
            const stepDelay = RANDOM_BUTTON_ROLL_STEP_MS + progress * RANDOM_BUTTON_ROLL_STEP_VARIATION_MS;
            await new Promise((resolve) => window.setTimeout(resolve, stepDelay));
        }
        await new Promise((resolve) => window.setTimeout(resolve, RANDOM_BUTTON_ROLL_SETTLE_MS));
        setRandomButtonValue(finalValue);
        return finalValue;
    };

    $start.addEventListener("click", (event) => {
        event.stopPropagation();
        resumeAudioContext();
        withButtonBusyState($start, async () => {
            $start.textContent = "START...";
            try {
                await ensureAudioActivated();
            } catch (error) {
                console.error("Failed to start audio from control strip:", error);
                $start.textContent = "START!";
                return;
            }
            if (!startupModePresetApplied) {
                const startupControlState = modeControls.get(STARTUP_MODE_PRESET_ID);
                if (startupControlState) {
                    runQuickPresetMorph(startupControlState);
                } else {
                    console.warn(`Startup preset '${STARTUP_MODE_PRESET_ID}' was not found.`);
                }
                startupModePresetApplied = true;
            }
            refreshStartControlUI();
        });
    });

    $reset.addEventListener("click", (event) => {
        event.stopPropagation();
        withButtonBusyState($reset, async () => {
            $reset.textContent = "RESET...";
            globalControlState.saveModeArmed = false;
            try {
                await resetAudioEngine();
            } catch (error) {
                console.error("Failed to reset audio engine:", error);
                $reset.textContent = "RESET!";
                setTimeout(() => {
                    if ($reset.isConnected) $reset.textContent = "RESET";
                }, 1200);
                return;
            }
            if ($reset.isConnected) $reset.textContent = "RESET";
            refreshStartControlUI();
        });
    });

    $zero.addEventListener("click", (event) => {
        event.stopPropagation();
        withButtonBusyState($zero, async () => {
            globalControlState.saveModeArmed = false;
            activeModePresetId = "";
            resetPresetMorphIndicators();
            const entries = dspControls.map((control) => ({
                control,
                path: control.address,
                value: zeroOutControlValue(control),
            }));
            await morphToPresetValues(entries, globalControlState.morphDurationMs);
            refreshUserPresetButtonsUI();
            refreshStartControlUI();
        });
    });

    $random.addEventListener("click", (event) => {
        event.stopPropagation();
        withButtonBusyState($random, async () => {
            cancelModeMorph();
            globalControlState.saveModeArmed = false;
            activeModePresetId = "";
            resetPresetMorphIndicators();
            const entries = dspControls.map((control) => ({
                control,
                path: control.address,
                value: quantizeControlValue(control, randomizeControlValue(control)),
            }));
            const morphPromise = morphToRandomizedValuesStaggered(entries);
            const rollPromise = rollRandomButtonGlyph();
            await Promise.all([morphPromise, rollPromise]);
            refreshUserPresetButtonsUI();
            refreshStartControlUI();
        });
    });

    $themePicker.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
    });

    $themeSelect.addEventListener("change", (event) => {
        event.stopPropagation();
        const theme = applyHUDTheme($themeSelect.value);
        if ($themeSelect.value !== theme.id) {
            $themeSelect.value = theme.id;
        }
        refreshPresetShadeUI();
        if (faustUIBridge && typeof faustUIBridge.setTheme === "function") {
            faustUIBridge.setTheme(theme.id);
        }
    });

    $motionMode.addEventListener("click", (event) => {
        event.stopPropagation();
        withButtonBusyState($motionMode, async () => {
            await toggleMotionMode();
        });
    });

    $midiMode.addEventListener("click", (event) => {
        event.stopPropagation();
        withButtonBusyState($midiMode, async () => {
            await toggleMIDIInputMode();
        }).finally(refreshMIDIControlUI);
    });

    $liveInput.addEventListener("click", (event) => {
        event.stopPropagation();
        resumeAudioContext();
        withButtonBusyState($liveInput, async () => {
            await toggleLiveAudioInputMode();
        }).finally(refreshLiveInputControlUI);
    });

    $audioInputPicker.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
    });

    $audioInputSelect.addEventListener("change", (event) => {
        event.stopPropagation();
        liveInputState.selectedDeviceId = $audioInputSelect.value || "";
        if (!liveInputState.active) return;
        withButtonBusyState($liveInput, async () => {
            await startLiveAudioInput();
        }).finally(refreshLiveInputControlUI);
    });

    $zoomIn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!faustUIBridge || typeof faustUIBridge.zoomIn !== "function") return;
        faustUIBridge.zoomIn();
        refreshZoomControlUI();
        refreshScrollControlUI();
    });

    $zoomOut.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!faustUIBridge || typeof faustUIBridge.zoomOut !== "function") return;
        faustUIBridge.zoomOut();
        refreshZoomControlUI();
        refreshScrollControlUI();
    });

    $stockKnobToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setStockPresetKnobsExpanded(!stockPresetKnobsExpanded);
        refreshScrollControlUI();
    });

    $userKnobToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setUserPresetKnobsExpanded(!userPresetKnobsExpanded);
        refreshScrollControlUI();
    });

    const scrollGridByStep = (direction) => {
        const $grid = getGridScroller();
        if (!$grid) return;
        const delta = Math.max(120, Math.round($grid.clientHeight * 0.72));
        $grid.scrollBy({
            top: delta * direction,
            behavior: "smooth",
        });
        requestAnimationFrame(refreshScrollControlUI);
        setTimeout(refreshScrollControlUI, 220);
    };

    $scrollDown.addEventListener("click", (event) => {
        event.stopPropagation();
        scrollGridByStep(1);
    });

    $scrollUp.addEventListener("click", (event) => {
        event.stopPropagation();
        scrollGridByStep(-1);
    });

    $fullscreen.addEventListener("click", async (event) => {
        event.stopPropagation();
        const docAny = /** @type {any} */ (document);
        const rootAny = /** @type {any} */ (document.documentElement);
        const active = Boolean(getFullscreenElement());
        try {
            if (!active) {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                } else if (rootAny.webkitRequestFullscreen) {
                    rootAny.webkitRequestFullscreen();
                }
            } else if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (docAny.webkitExitFullscreen) {
                docAny.webkitExitFullscreen();
            }
        } catch (error) {
            console.warn("Fullscreen toggle failed:", error);
        }
        refreshFullscreenControlUI();
    });

    if (zoomResizeHandler) {
        window.removeEventListener("resize", zoomResizeHandler);
    }
    zoomResizeHandler = () => {
        refreshZoomControlUI();
        refreshScrollControlUI();
        refreshFullscreenControlUI();
        refreshPresetLaneMeasurements();
        syncPresetSpacerWidths();
    };
    window.addEventListener("resize", zoomResizeHandler);

    const $gridScroller = getGridScroller();
    if ($gridScroller) {
        $gridScroller.addEventListener("scroll", refreshScrollControlUI, { passive: true });
    }

    if (fullscreenChangeHandler) {
        document.removeEventListener("fullscreenchange", fullscreenChangeHandler);
        document.removeEventListener("webkitfullscreenchange", fullscreenChangeHandler);
    }
    fullscreenChangeHandler = () => {
        refreshFullscreenControlUI();
    };
    document.addEventListener("fullscreenchange", fullscreenChangeHandler);
    document.addEventListener("webkitfullscreenchange", fullscreenChangeHandler);

    if (saveModeKeydownHandler) {
        window.removeEventListener("keydown", saveModeKeydownHandler);
    }
    saveModeKeydownHandler = (event) => {
        if (event.key !== "Escape" || !globalControlState.saveModeArmed) return;
        globalControlState.saveModeArmed = false;
        refreshUserPresetButtonsUI();
    };
    window.addEventListener("keydown", saveModeKeydownHandler);
}

// Called at load time
(async () => {

    // Import the create-node module
    const { createFaustNode, createFaustUI } = await import(CREATE_NODE_MODULE_SPEC);

    // To test the ScriptProcessorNode mode
    // const result = await createFaustNode(audioContext, "osc", FAUST_DSP_VOICES, true, 512);
    const result = await createFaustNode(audioContext, "osc", FAUST_DSP_VOICES);
    faustNode = result.faustNode;  // Assign to the global variable
    if (!faustNode) throw new Error("Faust DSP not compiled");
    setDSPControls(collectDSPControls(faustNode.getUI(), []));

    // Create the Faust UI
    faustUIBridge = await createFaustUI($divFaustUI, faustNode);
    attachParamValueObserver();
    mountHUDControls();
    faustReadyResolve?.();

})().catch((error) => {
    console.error("Failed to initialize Faust node/UI:", error);
    faustReadyReject?.(error);
});

// Synchronous function to resume AudioContext, to be called first in the synchronous event listener
function resumeAudioContext() {
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext resumed successfully');
        }).catch(error => {
            console.error('Error when resuming AudioContext:', error);
        });
    }
}

function getFaustAudioInputCount() {
    const methodCount = typeof faustNode?.getNumInputs === "function" ? Number(faustNode.getNumInputs()) : NaN;
    if (Number.isFinite(methodCount)) return Math.max(0, methodCount);
    const propertyCount = Number(faustNode?.numberOfInputs);
    return Number.isFinite(propertyCount) ? Math.max(0, propertyCount) : 0;
}

function handleMIDIMessage(event) {
    if (!midiInputState.active) return;
    if (!faustNode || typeof faustNode.midiMessage !== "function") return;
    faustNode.midiMessage(event.data);
}

function bindMIDIInput(input) {
    if (!input || input.type !== "input" || midiInputState.inputs.has(input)) return;
    if (typeof input.addEventListener === "function") {
        input.addEventListener("midimessage", handleMIDIMessage);
    } else {
        input.onmidimessage = handleMIDIMessage;
    }
    midiInputState.inputs.add(input);
    console.log(`Connected to MIDI input: ${input.name || "unnamed"}`);
}

function unbindMIDIInput(input) {
    if (!input) return;
    if (typeof input.removeEventListener === "function") {
        input.removeEventListener("midimessage", handleMIDIMessage);
    }
    if (input.onmidimessage === handleMIDIMessage) {
        input.onmidimessage = null;
    }
    midiInputState.inputs.delete(input);
}

function handleMIDIStateChange(event) {
    const port = event?.port;
    if (!port || port.type !== "input") {
        refreshMIDIControlUI();
        return;
    }
    if (midiInputState.active && port.state === "connected") {
        bindMIDIInput(port);
    } else if (port.state === "disconnected") {
        unbindMIDIInput(port);
    }
    refreshMIDIControlUI();
}

async function startMIDI() {
    await faustReady;
    if (!midiInputState.supported) {
        console.log("Web MIDI API is not supported in this browser.");
        refreshMIDIControlUI();
        return false;
    }
    if (!faustNode || typeof faustNode.midiMessage !== "function") {
        console.warn("Faust node is not ready for MIDI input.");
        refreshMIDIControlUI();
        return false;
    }
    if (!midiInputState.access) {
        midiInputState.access = await navigator.requestMIDIAccess({ sysex: false });
        console.log("MIDI Access obtained.");
    }
    if (!midiInputState.stateChangeBound) {
        if (typeof midiInputState.access.addEventListener === "function") {
            midiInputState.access.addEventListener("statechange", handleMIDIStateChange);
        } else {
            midiInputState.access.onstatechange = handleMIDIStateChange;
        }
        midiInputState.stateChangeBound = true;
    }
    midiInputState.active = true;
    for (const input of midiInputState.access.inputs.values()) {
        bindMIDIInput(input);
    }
    midiHandlersBound = true;
    refreshMIDIControlUI();
    return true;
}

function stopMIDI() {
    for (const input of Array.from(midiInputState.inputs)) {
        unbindMIDIInput(input);
        console.log(`Disconnected from MIDI input: ${input.name || "unnamed"}`);
    }
    midiInputState.active = false;
    midiHandlersBound = false;
    refreshMIDIControlUI();
}

async function toggleMIDIInputMode() {
    if (midiInputState.active) {
        stopMIDI();
        return;
    }
    try {
        await startMIDI();
    } catch (error) {
        console.warn("MIDI input was not enabled:", error);
        stopMIDI();
    }
}

function stopMediaStreamNode(streamNode) {
    if (!streamNode) return;
    try {
        streamNode.disconnect(faustNode);
    } catch (error) {
        try {
            streamNode.disconnect();
        } catch (disconnectError) {
            console.warn("Unable to disconnect live audio input node:", disconnectError || error);
        }
    }
    streamNode.mediaStream?.getTracks?.().forEach((track) => track.stop());
}

async function refreshAudioInputDevices() {
    if (!liveInputState.supported) {
        liveInputState.devices = [];
        refreshAudioInputDeviceListUI();
        refreshLiveInputControlUI();
        return;
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    liveInputState.devices = devices.filter((device) => device.kind === "audioinput");
    refreshAudioInputDeviceListUI();
    refreshLiveInputControlUI();
}

async function startLiveAudioInput() {
    await faustReady;
    if (getFaustAudioInputCount() <= 0) {
        console.warn("Live audio input is unavailable because the current Faust DSP exposes 0 input channels.");
        stopLiveAudioInput();
        refreshLiveInputControlUI();
        return false;
    }
    if (!liveInputState.supported) {
        console.warn("Live audio input is not supported in this browser.");
        refreshLiveInputControlUI();
        return false;
    }
    await ensureAudioActivated();
    const { connectToAudioInput } = await import(CREATE_NODE_MODULE_SPEC);
    const oldStreamNode = liveInputState.streamNode;
    const nextStreamNode = await connectToAudioInput(
        audioContext,
        liveInputState.selectedDeviceId || null,
        faustNode,
        oldStreamNode
    );
    if (oldStreamNode && oldStreamNode !== nextStreamNode) {
        stopMediaStreamNode(oldStreamNode);
    }
    liveInputState.streamNode = nextStreamNode || null;
    liveInputState.active = Boolean(liveInputState.streamNode);
    await refreshAudioInputDevices();
    refreshLiveInputControlUI();
    return liveInputState.active;
}

function stopLiveAudioInput() {
    stopMediaStreamNode(liveInputState.streamNode);
    liveInputState.streamNode = null;
    liveInputState.active = false;
    refreshLiveInputControlUI();
}

async function toggleLiveAudioInputMode() {
    if (liveInputState.active) {
        stopLiveAudioInput();
        return;
    }
    try {
        await startLiveAudioInput();
    } catch (error) {
        console.warn("Live audio input was not enabled:", error);
        stopLiveAudioInput();
        await refreshAudioInputDevices().catch((refreshError) => console.warn("Unable to refresh audio input devices:", refreshError));
    }
}

let midiHandlersBound = false;
let audioGraphConnected = false;
let activationInFlight = null;
let audioActivated = false;

async function ensureAudioActivated() {
    if (audioActivated) return;
    if (activationInFlight) return activationInFlight;

    activationInFlight = (async () => {
        await faustReady;
        if (!faustNode) throw new Error("Faust node is not ready.");

        // Connect the Faust node to the audio output only once.
        if (!audioGraphConnected) {
            faustNode.connect(audioContext.destination);
            audioGraphConnected = true;
        }

        // Resume the AudioContext
        if (audioContext.state === "suspended") {
            await audioContext.resume();
        }

        audioActivated = true;
        refreshStartControlUI();
        refreshLiveInputControlUI();
    })();

    try {
        await activationInFlight;
    } finally {
        activationInFlight = null;
    }
}

// Function to activate MIDI and audio on user interaction
async function activateMIDISensors() {
    await ensureAudioActivated();
}

// Function to suspend AudioContext and deactivate MIDI on user interaction
async function deactivateAudioMIDISensors() {

    stopLiveAudioInput();

    // Suspend the AudioContext
    if (audioContext.state === 'running') {
        await audioContext.suspend();
    }

    // Deactivate the MIDI setup
    if (midiHandlersBound || midiInputState.active) {
        stopMIDI();
    }

    audioActivated = false;
    refreshStartControlUI();
    refreshLiveInputControlUI();
}

// Deactivate AudioContext, MIDI and Sensors on user interaction
window.addEventListener('visibilitychange', function () {
    if (window.visibilityState === 'hidden') {
        deactivateAudioMIDISensors();
    }
});

// ── Hermes Agent Control Bridge (__agentAPI) ─────────────────────────────
// Every method is safe to call before the page is ready or before audio
// is activated — they return null / empty / false if a dependency is missing.
(function () {
    'use strict';
    var A = {
        _version: '1.2.2',
        _ready: false,
        _readyPromise: null
    };

    // ── Audio lifecycle ──────────────────────────────────────────────────────
    A.audio = {
        /** Resume AudioContext + connect Faust node. Returns true on success. */
        activate: async function () {
            if (typeof ensureAudioActivated !== 'function') return false;
            try { await ensureAudioActivated(); return true; }
            catch (e) { return false; }
        },
        /** True if audio has been activated and not suspended. */
        isActive: function () { return !!(typeof audioActivated !== 'undefined' && audioActivated); },
        /** Suspend AudioContext, disconnect MIDI, stop live input. */
        deactivate: async function () {
            if (typeof deactivateAudioMIDISensors !== 'function') return false;
            try { await deactivateAudioMIDISensors(); return true; }
            catch (e) { return false; }
        }
    };

    // ── Param control ────────────────────────────────────────────────────────
    A.params = {
        /** Set a single Faust parameter. @param {string} path — full address like '/ambient_m7_3.0/air' */
        set: function (path, value) {
            if (typeof faustUIBridge === 'undefined' || !faustUIBridge) return false;
            var entry = typeof normalizeAgentParamEntry === 'function' ? normalizeAgentParamEntry(path, value) : null;
            if (!entry) return false;
            try { faustUIBridge.setParamValue(entry.path, entry.value, true); return true; }
            catch (e) { return false; }
        },
        /** Get current value of a parameter from the live value map. */
        get: function (path) {
            var control = typeof getDSPControl === 'function' ? getDSPControl(path) : null;
            if (!control || typeof currentParamValueMap === 'undefined') return null;
            var v = currentParamValueMap.get(control.address);
            return v !== undefined ? v : control.init;
        },
        /** Return full schema for every parameter: { address, label, min, max, step, init, value }. */
        getAll: function () {
            if (typeof dspControls === 'undefined') return [];
            var out = [];
            for (var i = 0; i < dspControls.length; i++) {
                var c = dspControls[i];
                out.push({
                    address: c.address,
                    label: c.label || c.address.split('/').pop(),
                    min: c.min, max: c.max, step: c.step, init: c.init,
                    value: (typeof currentParamValueMap !== 'undefined' ? currentParamValueMap.get(c.address) : undefined) ?? c.init
                });
            }
            return out;
        },
        /**
         * Batch-set multiple parameters. Entries: [{path, value}, ...].
         * Values are validated, clamped, and quantized before any are applied.
         */
        setBatch: function (entries) {
            if (typeof faustUIBridge === 'undefined' || !faustUIBridge || !Array.isArray(entries)) return false;
            var normalized = [];
            for (var i = 0; i < entries.length; i++) {
                var candidate = entries[i] || {};
                var entry = typeof normalizeAgentParamEntry === 'function' ? normalizeAgentParamEntry(candidate.path, candidate.value) : null;
                if (!entry) return false;
                normalized.push(entry);
            }
            if (normalized.length === 0) return false;
            try {
                for (var j = 0; j < normalized.length; j++) {
                    faustUIBridge.setParamValue(normalized[j].path, normalized[j].value, true);
                }
                return true;
            } catch (e) {
                return false;
            }
        },
        /** Resolve parameter metadata from the control index by address or short name. */
        info: function (path) {
            var c = typeof getDSPControl === 'function' ? getDSPControl(path) : null;
            if (!c) return null;
            return {
                address: c.address, label: c.label || c.address.split('/').pop(),
                min: c.min, max: c.max, step: c.step, init: c.init,
                value: (typeof currentParamValueMap !== 'undefined' ? currentParamValueMap.get(c.address) : undefined) ?? c.init
            };
        }
    };

    // ── HUD button controls (motion / MIDI / live input) ─────────────────────
    function makeToggleControl(activator, deactivator, stateGetter) {
        return {
            isEnabled: function () { return !!stateGetter(); },
            enable: async function () {
                if (stateGetter()) return true;
                try { await activator(); return !!stateGetter(); }
                catch (e) { return false; }
            },
            disable: async function () {
                if (!stateGetter()) return true;
                try { await deactivator(); return !stateGetter(); }
                catch (e) { return false; }
            },
            toggle: async function () {
                if (stateGetter()) { await deactivator(); return false; }
                else { await activator(); return !!stateGetter(); }
            }
        };
    }
    A.controls = {
        motion: makeToggleControl(
            function () {
                if (typeof activateMotionMode === 'function') return activateMotionMode();
                return Promise.resolve();
            },
            function () {
                if (typeof deactivateMotionMode === 'function') deactivateMotionMode();
                else if (typeof stopMotionModeLoop === 'function') stopMotionModeLoop();
                return Promise.resolve();
            },
            function () { return typeof motionModeState !== 'undefined' && motionModeState.active; }
        ),
        midi: makeToggleControl(
            function () { if (typeof startMIDI === 'function') return startMIDI(); return Promise.resolve(); },
            function () { if (typeof stopMIDI === 'function') stopMIDI(); return Promise.resolve(); },
            function () { return typeof midiInputState !== 'undefined' && midiInputState.active; }
        ),
        liveInput: makeToggleControl(
            function () {
                var btn = document.querySelector('.hud-control-btn-live-input');
                if (btn) { btn.click(); return new Promise(function (r) { setTimeout(r, 200); }); }
                return Promise.resolve();
            },
            function () { if (typeof stopLiveAudioInput === 'function') stopLiveAudioInput(); return Promise.resolve(); },
            function () { return typeof liveInputState !== 'undefined' && liveInputState.active; }
        )
    };

    // ── Sequencer ────────────────────────────────────────────────────────────
    A.seq = {
        isPlaying: function () { return !!(typeof sequencer !== 'undefined' && sequencer && sequencer.isPlaying()); },
        play: function () {
            if (typeof sequencer === 'undefined' || !sequencer) return false;
            if (sequencer.getLinkedParameters().length === 0) return false;
            var btn = document.querySelector('.hud-seq-btn[aria-label="Play sequencer"]');
            if (btn) { btn.click(); return true; }
            return false;
        },
        stop: function () {
            if (typeof sequencer === 'undefined' || !sequencer) return false;
            var btn = document.querySelector('.hud-seq-btn[aria-label="Stop sequencer"]');
            if (btn) { btn.click(); return true; }
            return false;
        },
        setBPM: function (bpm) {
            if (typeof sequencer === 'undefined' || !sequencer) return false;
            sequencer.setBPM(Number(bpm));
            return true;
        },
        getBPM: function () { return (typeof sequencer !== 'undefined' && sequencer) ? sequencer.getBPM() : 120; },
        setStepCount: function (count) {
            if (typeof sequencer === 'undefined' || !sequencer) return false;
            if ([8, 16, 32].indexOf(Number(count)) === -1) return false;
            sequencer.setStepCount(Number(count));
            return true;
        },
        setDirection: function (dir) {
            if (typeof sequencer === 'undefined' || !sequencer) return false;
            if (['forward', 'reverse', 'pingpong'].indexOf(dir) === -1) return false;
            sequencer.setDirection(dir);
            return true;
        },
        /** Link a parameter to the sequencer by address. */
        link: function (path) {
            if (typeof sequencer === 'undefined' || !sequencer) return false;
            var ctrl = typeof getDSPControl === 'function' ? getDSPControl(path) : null;
            if (!ctrl) return false;
            sequencer.linkParameter(ctrl.address, ctrl.min, ctrl.max, ctrl.step);
            return true;
        },
        unlink: function (path) {
            if (typeof sequencer === 'undefined' || !sequencer) return false;
            sequencer.unlinkParameter(path);
            return true;
        },
        /** Set a single step value for a linked parameter (0–1 normalized). */
        setStep: function (path, index, value) {
            if (typeof sequencer === 'undefined' || !sequencer) return false;
            sequencer.setStepValue(path, Number(index), Number(value));
            return true;
        },
        /** Open the sequencer panel. */
        open: function () {
            var btn = document.querySelector('.hud-control-btn-seq');
            if (btn && btn.dataset.active !== '1') { btn.click(); return true; }
            return btn ? btn.dataset.active === '1' : false;
        },
        /** Close the sequencer panel. */
        close: function () {
            var btn = document.querySelector('.hud-control-btn-seq');
            if (btn && btn.dataset.active === '1') { btn.click(); return true; }
            return btn ? btn.dataset.active !== '1' : false;
        },
        /** Toggle sequencer panel open/closed. */
        toggle: function () {
            var btn = document.querySelector('.hud-control-btn-seq');
            if (btn) { btn.click(); return true; }
            return false;
        },
        /** Current sequencer state snapshot. */
        getState: function () {
            if (typeof sequencer === 'undefined' || !sequencer) return null;
            return {
                playing: sequencer.isPlaying(),
                bpm: sequencer.getBPM(),
                stepCount: sequencer.getStepCount(),
                direction: sequencer.getDirection(),
                currentStep: sequencer.getCurrentStep(),
                linkedCount: sequencer.getLinkedParameters().length,
                linkedParams: sequencer.getLinkedParameters()
            };
        }
    };

    // ── Presets ──────────────────────────────────────────────────────────────
    A.preset = {
        /** List every stock preset with its ID, title, and subtitle. */
        list: function () {
            if (typeof MODE_PRESETS === 'undefined') return [];
            var out = [];
            for (var i = 0; i < MODE_PRESETS.length; i++) {
                var p = MODE_PRESETS[i];
                out.push({ id: p.id, title: p.title, subtitle: p.subtitle });
            }
            return out;
        },
        /** Trigger a stock or saved user preset morph by preset ID. */
        apply: async function (id, duration) {
            if (typeof runQuickPresetMorphExternal !== 'function') return false;
            try { return !!(await runQuickPresetMorphExternal(id, duration)); }
            catch (e) { return false; }
        },
        /**
         * Morph to arbitrary target values.
         * @param {Object|Array} targets — { path: value, ... } or [{ path, value }, ...]
         * @param {number} [duration] - morph duration in ms (default: global control state)
         */
        morphTo: async function (targets, duration) {
            if (typeof morphToPresetValues !== 'function' || typeof buildAgentPresetEntries !== 'function') return false;
            var entries = buildAgentPresetEntries(targets);
            if (!entries.length) return false;
            if (typeof clearPresetMorphIndicatorsExternal === 'function') clearPresetMorphIndicatorsExternal();
            try {
                return !!(await morphToPresetValues(entries, duration ?? (typeof globalControlState !== 'undefined' ? globalControlState.morphDurationMs : undefined)));
            } catch (e) {
                return false;
            }
        },
        /** List user preset slots. */
        listUser: function () {
            if (typeof userPresetSlots === 'undefined') return [];
            var out = [];
            for (var i = 0; i < userPresetSlots.length; i++) {
                var s = userPresetSlots[i];
                var hasValues = !!(s && s.saved && s.values && Object.keys(s.values).length > 0);
                out.push({
                    id: s.id,
                    label: s.label || (typeof getUserPresetShortLabel === 'function' ? getUserPresetShortLabel(s.id) : 'Slot ' + s.id),
                    hasData: hasValues,
                    count: hasValues ? Object.keys(s.values).length : 0,
                    updatedAt: s.updatedAt || ''
                });
            }
            return out;
        },
        /** Snapshot current preset-mode parameters into a user preset slot. */
        save: function (slotId, label) {
            if (typeof saveUserPresetSlot !== 'function' || typeof snapshotCurrentPresetValues !== 'function') return false;
            var id = typeof normalizeUserPresetSlotId === 'function' ? normalizeUserPresetSlotId(slotId) : slotId;
            if (!id) return false;
            var slot = saveUserPresetSlot(id, snapshotCurrentPresetValues());
            if (!slot) return false;
            if (typeof label === 'string') {
                slot.label = label;
                if (typeof persistUserPresetSlots === 'function') persistUserPresetSlots(userPresetSlots);
            }
            if (typeof refreshUserPresetButtonsUIExternal === 'function') refreshUserPresetButtonsUIExternal();
            return true;
        },
        /** Load a saved user preset and morph to its values. */
        load: async function (slotId, duration) {
            if (typeof getUserPresetSlot !== 'function' || typeof buildModePresetEntriesFromValues !== 'function' || typeof morphToPresetValues !== 'function') return false;
            var id = typeof normalizeUserPresetSlotId === 'function' ? normalizeUserPresetSlotId(slotId) : slotId;
            var slot = getUserPresetSlot(id);
            if (!slot || !slot.saved || !slot.values || Object.keys(slot.values).length === 0) return false;
            var entries = buildModePresetEntriesFromValues(slot.values);
            if (!entries.length) return false;
            if (typeof runQuickPresetMorphExternal === 'function') {
                try { return !!(await runQuickPresetMorphExternal(id, duration)); }
                catch (e) { return false; }
            }
            try {
                return !!(await morphToPresetValues(entries, duration ?? (typeof globalControlState !== 'undefined' ? globalControlState.morphDurationMs : 600)));
            } catch (e) {
                return false;
            }
        },
        /** Delete a user preset slot by ID while preserving the fixed slot list. */
        del: function (slotId) {
            if (typeof userPresetSlots === 'undefined' || typeof createEmptyUserPresetSlot !== 'function' || typeof persistUserPresetSlots !== 'function') return false;
            var id = typeof normalizeUserPresetSlotId === 'function' ? normalizeUserPresetSlotId(slotId) : slotId;
            for (var i = 0; i < userPresetSlots.length; i++) {
                if (userPresetSlots[i].id === id) {
                    userPresetSlots[i] = createEmptyUserPresetSlot(id);
                    persistUserPresetSlots(userPresetSlots);
                    if (typeof refreshUserPresetButtonsUIExternal === 'function') refreshUserPresetButtonsUIExternal();
                    return true;
                }
            }
            return false;
        }
    };

    // ── MIDI injection ───────────────────────────────────────────────────────
    A.midi = {
        /** Send a raw MIDI message to the Faust AudioNode. */
        send: function (status, data1, data2) {
            if (typeof faustNode === 'undefined' || !faustNode || typeof faustNode.midiMessage !== 'function') return false;
            try { faustNode.midiMessage(new Uint8Array([status, data1, data2])); return true; }
            catch (e) { return false; }
        },
        isEnabled: function () { return !!(typeof midiInputState !== 'undefined' && midiInputState.active); }
    };

    // ── State snapshot ───────────────────────────────────────────────────────
    A.state = {
        /** Lightweight state — keys only, no param values. */
        get: function () {
            var audioActive = !!(typeof audioActivated !== 'undefined' && audioActivated);
            return {
                version: A._version,
                audioActive: audioActive,
                audioContextState: typeof audioContext !== 'undefined' ? audioContext.state : 'unknown',
                faustReady: !!(typeof faustNode !== 'undefined' && faustNode),
                paramCount: typeof dspControls !== 'undefined' ? dspControls.length : 0,
                motionEnabled: !!(typeof motionModeState !== 'undefined' && motionModeState.active),
                midiEnabled: !!(typeof midiInputState !== 'undefined' && midiInputState.active),
                liveInputEnabled: !!(typeof liveInputState !== 'undefined' && liveInputState.active),
                sequencerPlaying: !!(typeof sequencer !== 'undefined' && sequencer && sequencer.isPlaying()),
                seqLinkedCount: (typeof sequencer !== 'undefined' && sequencer) ? sequencer.getLinkedParameters().length : 0,
                stockPresets: typeof MODE_PRESETS !== 'undefined' ? MODE_PRESETS.length : 0
            };
        },
        /** Full state — includes every parameter's current value. */
        full: function () {
            var s = A.state.get();
            s.params = {};
            if (typeof dspControls !== 'undefined') {
                for (var i = 0; i < dspControls.length; i++) {
                    var c = dspControls[i];
                    s.params[c.address] = (typeof currentParamValueMap !== 'undefined' ? currentParamValueMap.get(c.address) : undefined) ?? c.init;
                }
            }
            return s;
        }
    };

    // ── Register ─────────────────────────────────────────────────────────────
    window.__agentAPI = A;
    if (typeof console !== 'undefined') {
        console.log('[agentAPI] Hermes Control Bridge v' + A._version + ' ready. Call __agentAPI.state.get() for a snapshot.');
    }
})();
