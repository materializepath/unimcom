// @ts-check

/**
 * @typedef {{ dspModule: WebAssembly.Module; dspMeta: FaustDspMeta; effectModule?: WebAssembly.Module; effectMeta?: FaustDspMeta; mixerModule?: WebAssembly.Module }} FaustDspDistribution
 * @typedef {import("./faustwasm").FaustDspMeta} FaustDspMeta
 * @typedef {import("./faustwasm").FaustMonoAudioWorkletNode} FaustMonoAudioWorkletNode
 * @typedef {import("./faustwasm").FaustPolyAudioWorkletNode} FaustPolyAudioWorkletNode
 * @typedef {import("./faustwasm").FaustMonoScriptProcessorNode} FaustMonoScriptProcessorNode
 * @typedef {import("./faustwasm").FaustPolyScriptProcessorNode} FaustPolyScriptProcessorNode
 * @typedef {FaustMonoAudioWorkletNode | FaustPolyAudioWorkletNode | FaustMonoScriptProcessorNode | FaustPolyScriptProcessorNode} FaustNode
 */

/**
 * Creates a Faust audio node for use in the Web Audio API.
 *
 * @param {AudioContext} audioContext - The Web Audio API AudioContext to which the Faust audio node will be connected.
 * @param {string} [dspName] - The name of the DSP to be loaded.
 * @param {number} [voices] - The number of voices to be used for polyphonic DSPs.
 * @param {boolean} [sp] - Whether to create a ScriptProcessorNode instead of an AudioWorkletNode.
 * @returns {Promise<{ faustNode: FaustNode | null; dspMeta: FaustDspMeta }>} - An object containing the Faust audio node and the DSP metadata.
 */
const createFaustNode = async (audioContext, dspName = "template", voices = 0, sp = false, bufferSize = 512) => {
    // Set to true if the DSP has an effect
    const FAUST_DSP_HAS_EFFECT = false;

    // Import necessary Faust modules and data
    const { FaustMonoDspGenerator, FaustPolyDspGenerator } = await import("./faustwasm/index.js");

    // Load DSP metadata from JSON
    /** @type {FaustDspMeta} */
    const dspMeta = await (await fetch("./dsp-meta.json")).json();

    // Compile the DSP module from WebAssembly binary data
    const dspModule = await WebAssembly.compileStreaming(await fetch("./dsp-module.wasm"));

    // Create an object representing Faust DSP with metadata and module
    /** @type {FaustDspDistribution} */
    const faustDsp = { dspMeta, dspModule };

    /** @type {FaustNode | null} */
    let faustNode = null;

    // Create either a polyphonic or monophonic Faust audio node based on the number of voices
    if (voices > 0) {

        // Try to load optional mixer and effect modules
        faustDsp.mixerModule = await WebAssembly.compileStreaming(await fetch("./mixer-module.wasm"));

        if (FAUST_DSP_HAS_EFFECT) {
            faustDsp.effectMeta = await (await fetch("./effect-meta.json")).json();
            faustDsp.effectModule = await WebAssembly.compileStreaming(await fetch("./effect-module.wasm"));
        }

        // Create a polyphonic Faust audio node
        const generator = new FaustPolyDspGenerator();
        faustNode = await generator.createNode(
            audioContext,
            voices,
            dspName,
            { module: faustDsp.dspModule, json: JSON.stringify(faustDsp.dspMeta), soundfiles: {} },
            faustDsp.mixerModule,
            faustDsp.effectModule ? { module: faustDsp.effectModule, json: JSON.stringify(faustDsp.effectMeta), soundfiles: {} } : undefined,
            sp,
            bufferSize
        );
    } else {
        // Create a standard Faust audio node
        const generator = new FaustMonoDspGenerator();
        const sp = true; // Force ScriptProcessor mode — avoids COOP/COEP header requirement
        faustNode = await generator.createNode(
            audioContext,
            dspName,
            { module: faustDsp.dspModule, json: JSON.stringify(faustDsp.dspMeta), soundfiles: {} },
            sp,
            bufferSize
        );
    }

    // Return an object with the Faust audio node and the DSP metadata
    return { faustNode, dspMeta };
}

/**
 * Connects an audio input stream to a Faust WebAudio node.
 * 
 * @param {AudioContext} audioContext - The Web Audio API AudioContext to which the Faust audio node is connected.
 * @param {string} id - The ID of the audio input device to connect.
 * @param {FaustNode} faustNode - The Faust audio node to which the audio input stream will be connected.
 * @param {MediaStreamAudioSourceNode} oldInputStreamNode - The old audio input stream node to be disconnected from the Faust audio node.
 * @returns {Promise<MediaStreamAudioSourceNode>} - The new audio input stream node connected to the Faust audio node.
 */
async function connectToAudioInput(audioContext, id, faustNode, oldInputStreamNode) {
    // Create an audio input stream node
    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            deviceId: id ? { exact: id } : undefined,
        },
    };
    // Get the audio input stream
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (stream) {
        if (oldInputStreamNode) oldInputStreamNode.disconnect();
        const newInputStreamNode = audioContext.createMediaStreamSource(stream);
        newInputStreamNode.connect(faustNode);
        return newInputStreamNode;
    } else {
        return oldInputStreamNode;
    }
};

const HUD_THEMES = Object.freeze({
    mobiel_core: Object.freeze({
        bg: "rgba(8, 9, 11, 0.86)",
        panelBg: "rgba(11, 12, 14, 0.95)",
        border: "rgba(220, 224, 228, 0.22)",
        borderActive: "rgba(71, 229, 186, 1)",
        ink: "rgba(232, 236, 240, 0.92)",
        inkSoft: "rgba(208, 212, 216, 0.66)",
        off: "rgba(206, 210, 214, 0.12)",
        on: "rgba(232, 236, 240, 0.86)",
        accent: "rgba(232, 236, 240, 0.86)",
        accentSoft: "rgba(220, 224, 228, 0.22)",
        grid: "rgba(210, 214, 218, 0.12)",
    }),
    original: Object.freeze({
        bg: "rgba(8, 9, 11, 0.86)",
        panelBg: "rgba(11, 12, 14, 0.95)",
        border: "rgba(220, 224, 228, 0.22)",
        borderActive: "rgba(71, 229, 186, 1)",
        ink: "rgba(232, 236, 240, 0.92)",
        inkSoft: "rgba(208, 212, 216, 0.66)",
        off: "rgba(206, 210, 214, 0.12)",
        on: "rgba(232, 236, 240, 0.86)",
        accent: "rgba(232, 236, 240, 0.86)",
        accentSoft: "rgba(220, 224, 228, 0.22)",
        grid: "rgba(210, 214, 218, 0.12)",
    }),
    lilac_mint: Object.freeze({
        bg: "rgba(8, 9, 11, 0.86)",
        panelBg: "rgba(11, 12, 14, 0.95)",
        border: "rgba(220, 224, 228, 0.22)",
        ink: "rgba(232, 236, 240, 0.92)",
        inkSoft: "rgba(208, 212, 216, 0.66)",
        off: "rgba(206, 210, 214, 0.12)",
        on: "rgba(232, 236, 240, 0.86)",
        accent: "rgba(232, 236, 240, 0.86)",
        accentSoft: "rgba(220, 224, 228, 0.22)",
        borderActive: "rgba(71, 229, 186, 1)",
        grid: "rgba(210, 214, 218, 0.12)",
    }),
    neon_lilac: Object.freeze({
        bg: "rgba(8, 9, 11, 0.86)",
        panelBg: "rgba(11, 12, 14, 0.95)",
        border: "rgba(220, 224, 228, 0.22)",
        ink: "rgba(232, 236, 240, 0.92)",
        inkSoft: "rgba(208, 212, 216, 0.66)",
        off: "rgba(206, 210, 214, 0.12)",
        on: "rgba(232, 236, 240, 0.86)",
        accent: "rgba(232, 236, 240, 0.86)",
        accentSoft: "rgba(220, 224, 228, 0.22)",
        borderActive: "rgba(71, 229, 186, 1)",
        grid: "rgba(210, 214, 218, 0.12)",
    }),
});

const DEFAULT_HUD_THEME_ID = "mobiel_core";

const FAUST_UI_MIN_GRID = 34;
const KNOB_TARGET_SIZE = 116;
const KNOB_MIN_COLUMNS = 2;
const KNOB_MAX_COLUMNS = 10;
const KNOB_MANUAL_MIN_COLUMNS = 1;
const KNOB_MIN_COLUMN_PIXEL_WIDTH = 72;
const HUD_BAR_COUNT = 12;
const HUD_SPARK_HISTORY = 24;
const HUD_ASSET_VERSION = "20260521seq4";
const HUD_CONTROL_STRIP_HEIGHT_FALLBACK = 196;
const HUD_FONT_FAMILY = "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace";
const HAPTIC_TICK_DURATION_MS = 120;
const HAPTIC_TICK_MIN_INTERVAL_MS = 60;
const HAPTIC_TICK_BUCKET_COUNT = 48;
const HAPTIC_FALLBACK_TICK_BURST_COUNT = 3;
const IOS_HAPTIC_FALLBACK_SWITCH_ID = "hud-ios-haptic-main";
let iosHapticFallbackSwitch = null;
const HUD_TEXT_SIZES = Object.freeze({
    name: "8.4px",
    index: "7.8px",
    meta: "7.3px",
    range: "6.9px",
});
const HUD_CONTROL_FAMILY_SEEDS = Object.freeze({
    tone: "#4cd3b7",
    ambience: "#68d6f6",
    motion: "#5e9ed8",
    voice: "#b0a4ed",
    harmony: "#8b98e7",
    pulse: "#c46bff",
    matter: "#7fe0d3",
});
const FAUST_UI_MODULE_SPECS = Object.freeze([
    `./faust-ui/index.js?v=${HUD_ASSET_VERSION}`,
    "./faust-ui/index.js",
]);

/**
 * @typedef {{
 *   bg: string;
 *   panelBg: string;
 *   border: string;
 *   borderActive: string;
 *   ink: string;
 *   inkSoft: string;
 *   off: string;
 *   on: string;
 *   accent: string;
 *   accentSoft: string;
 *   grid: string;
 *   id?: string;
 * }} HUDTheme
 */

/**
 * @returns {string}
 */
function getHUDThemeId() {
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get("hudTheme") || params.get("theme") || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (raw && raw in HUD_THEMES) return raw;
    return DEFAULT_HUD_THEME_ID;
}

/**
 * @param {string} themeId
 * @returns {HUDTheme}
 */
function applyHUDThemeVars(themeId) {
    const theme = HUD_THEMES[themeId] || HUD_THEMES[DEFAULT_HUD_THEME_ID];
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--hud-bg", theme.bg);
    rootStyle.setProperty("--hud-panel-bg", theme.panelBg);
    rootStyle.setProperty("--hud-border", theme.border);
    rootStyle.setProperty("--hud-ink", theme.ink);
    rootStyle.setProperty("--hud-ink-soft", theme.inkSoft);
    rootStyle.setProperty("--hud-off", theme.off);
    rootStyle.setProperty("--hud-on", theme.on);
    rootStyle.setProperty("--hud-accent", theme.accent);
    rootStyle.setProperty("--hud-accent-soft", theme.accentSoft);
    rootStyle.setProperty("--hud-border-active", theme.borderActive);
    rootStyle.setProperty("--hud-grid", theme.grid);
    rootStyle.setProperty("--hud-theme-id", themeId);
    return theme;
}

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
    const t = Math.max(0, Math.min(1, amount));
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
        a: Math.max(0, Math.min(1, alpha)),
    });
}

/**
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function readHUDVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

/**
 * @param {string} [themeIdHint]
 * @returns {HUDTheme}
 */
function readActiveHUDTheme(themeIdHint = "") {
    const root = document.documentElement;
    const themeId = (
        themeIdHint ||
        root.dataset.hudTheme ||
        root.style.getPropertyValue("--hud-theme-id") ||
        ""
    ).trim().toLowerCase() || DEFAULT_HUD_THEME_ID;
    const fallback = HUD_THEMES[themeId] || HUD_THEMES[DEFAULT_HUD_THEME_ID];
    return {
        id: themeId,
        bg: readHUDVar("--hud-bg", fallback.bg),
        panelBg: readHUDVar("--hud-panel-bg", fallback.panelBg),
        border: readHUDVar("--hud-border", fallback.border),
        borderActive: readHUDVar("--hud-border-active", fallback.borderActive),
        ink: readHUDVar("--hud-ink", fallback.ink),
        inkSoft: readHUDVar("--hud-ink-soft", fallback.inkSoft),
        off: readHUDVar("--hud-off", fallback.off),
        on: readHUDVar("--hud-on", fallback.on),
        accent: readHUDVar("--hud-accent", fallback.accent),
        accentSoft: readHUDVar("--hud-accent-soft", fallback.accentSoft),
        grid: readHUDVar("--hud-grid", fallback.grid),
    };
}

/**
 * @param {HUDTheme} theme
 * @param {HUDControlPalette | null} [palette]
 * @returns {{ low: string; high: string }}
 */
function getKnobIndicatorStops(theme, palette = null) {
    if (palette) {
        return {
            low: palette.indicatorLow,
            high: palette.indicatorHigh,
        };
    }
    const lowBase = (theme.id === "noir")
        ? setColorAlpha(theme.borderActive, 0.7)
        : setColorAlpha(theme.accent, 0.74);
    const highBase = theme.borderActive;
    return {
        low: lowBase,
        high: highBase,
    };
}

/**
 * @param {HUDTheme} theme
 * @param {HUDControlPalette | null} [palette]
 * @returns {{ low: string; high: string }}
 */
function getKnobNeedleStops(theme, palette = null) {
    if (palette) {
        return {
            low: palette.needleLow,
            high: palette.needleHigh,
        };
    }
    if (theme.id === "noir") {
        return {
            low: setColorAlpha(theme.borderActive, 0.96),
            high: theme.borderActive,
        };
    }
    return {
        low: setColorAlpha(theme.accent, 0.96),
        high: theme.borderActive,
    };
}

/**
 * @param {HUDTheme} theme
 * @param {HUDControlPalette | null} [palette]
 * @returns {Record<string, string | number | undefined>}
 */
function createKnobStyle(theme, palette = null) {
    const indicator = getKnobIndicatorStops(theme, palette);
    const needle = getKnobNeedleStops(theme, palette);
    return {
        labelcolor: palette?.label || theme.ink,
        textcolor: palette?.meta || theme.inkSoft,
        bgcolor: theme.panelBg,
        bordercolor: palette?.border || theme.border,
        knobcolor: setColorAlpha(theme.on, 0.08),
        knoboncolor: indicator.low,
        knoboncolorlow: indicator.low,
        knoboncolorhigh: indicator.high,
        needlecolor: needle.low,
        needlecolorlow: needle.low,
        needlecolorhigh: needle.high,
    };
}

/**
 * @typedef {"tone" | "ambience" | "motion" | "voice" | "harmony" | "pulse" | "matter"} HUDControlFamily
 */

/**
 * @typedef {{
 *   accent: string;
 *   accentSoft: string;
 *   border: string;
 *   grid: string;
 *   panelTop: string;
 *   panelGlow: string;
 *   label: string;
 *   meta: string;
 *   value: string;
 *   barActive: string;
 *   barTip: string;
 *   sparkBase: string;
 *   sparkLine: string;
 *   indicatorLow: string;
 *   indicatorHigh: string;
 *   needleLow: string;
 *   needleHigh: string;
 * }} HUDControlPalette
 */

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeHUDControlKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^.*\//, "")
        .replace(/\[[^\]]+\]/g, "")
        .replace(/[^a-z0-9]+/g, "");
}

/**
 * @param {any} component
 * @param {number} index
 * @returns {string}
 */
function getHUDControlKey(component, index) {
    const state = component && component.state && typeof component.state === "object"
        ? component.state
        : {};
    const candidates = [
        state.address,
        state.shortname,
        state.label,
        `control_${index + 1}`,
    ];
    for (const candidate of candidates) {
        const normalized = normalizeHUDControlKey(candidate);
        if (normalized) return normalized;
    }
    return `control${index + 1}`;
}

/**
 * @param {string} controlKey
 * @returns {HUDControlFamily}
 */
function getHUDControlFamily(controlKey) {
    if (/^(ambi|cathedral)/.test(controlKey)) return "ambience";
    if (/^(cameraorbit|mobilerot|motion|zoomin|zoomout|proximityctl|lockctl|stagectl|objectspinctl)/.test(controlKey)) return "motion";
    if (/^(chant|organum|attune|boadicea)/.test(controlKey)) return "voice";
    if (/^(poly|root)/.test(controlKey)) return "harmony";
    if (/^(ritual|percussion|phaser)/.test(controlKey)) return "pulse";
    if (/^(material|invisible|transmute|ascend)/.test(controlKey)) return "matter";
    return "tone";
}

/**
 * @param {HUDTheme} theme
 * @param {HUDControlFamily} family
 * @returns {HUDControlPalette}
 */
function createHUDControlPalette(theme, family) {
    const seed = HUD_CONTROL_FAMILY_SEEDS[family] || theme.borderActive;
    const accentCore = mixColorStrings(seed, theme.borderActive, 0.26);
    const accent = mixColorStrings(accentCore, theme.on, 0.08);
    const accentSoft = setColorAlpha(mixColorStrings(theme.accentSoft, accentCore, 0.82), 0.24);
    const border = setColorAlpha(mixColorStrings(theme.border, accentCore, 0.52), 0.3);
    const grid = setColorAlpha(mixColorStrings(theme.grid, accentCore, 0.48), 0.18);
    const panelTop = setColorAlpha(mixColorStrings(theme.accentSoft, accentCore, 0.84), 0.34);
    const panelGlow = setColorAlpha(mixColorStrings(accentCore, theme.panelBg, 0.14), 0.24);
    const label = mixColorStrings(theme.ink, accentCore, 0.16);
    const meta = mixColorStrings(theme.inkSoft, accentCore, 0.24);
    const value = mixColorStrings(theme.on, accentCore, 0.34);
    const barActive = setColorAlpha(mixColorStrings(accentCore, theme.on, 0.12), 0.92);
    const barTip = mixColorStrings(theme.on, accentCore, 0.68);
    const sparkBase = setColorAlpha(mixColorStrings(theme.grid, accentCore, 0.3), 0.24);
    const sparkLine = mixColorStrings(accentCore, theme.on, 0.24);
    const indicatorLow = setColorAlpha(accentCore, theme.id === "noir" ? 0.84 : 0.78);
    const indicatorHigh = mixColorStrings(accentCore, theme.on, 0.12);
    const needleLow = setColorAlpha(mixColorStrings(accentCore, theme.on, 0.08), 0.98);
    const needleHigh = mixColorStrings(accentCore, theme.on, 0.18);
    return {
        accent,
        accentSoft,
        border,
        grid,
        panelTop,
        panelGlow,
        label,
        meta,
        value,
        barActive,
        barTip,
        sparkBase,
        sparkLine,
        indicatorLow,
        indicatorHigh,
        needleLow,
        needleHigh,
    };
}

/**
 * @param {unknown} faustUIModule
 * @returns {any | null}
 */
function getFaustUIConstructor(faustUIModule) {
    if (!faustUIModule || typeof faustUIModule !== "object") return null;
    if (typeof faustUIModule.FaustUI === "function") return faustUIModule.FaustUI;
    if (typeof faustUIModule.default === "function") return faustUIModule.default;
    return null;
}

/**
 * @returns {Promise<any>}
 */
async function loadFaustUIConstructor() {
    /** @type {string[]} */
    const diagnostics = [];
    /** @type {unknown} */
    let lastImportError = null;

    for (const spec of FAUST_UI_MODULE_SPECS) {
        try {
            const faustUIModule = await import(spec);
            const FaustUI = getFaustUIConstructor(faustUIModule);
            const keys = Object.keys(faustUIModule || {});
            diagnostics.push(`${spec}: exports [${keys.join(", ")}]`);
            if (FaustUI) return FaustUI;
        } catch (error) {
            lastImportError = error;
            diagnostics.push(`${spec}: import failed (${error instanceof Error ? error.message : String(error)})`);
        }
    }

    let byteDiagnostic = "";
    try {
        const response = await fetch(`./faust-ui/index.js?v=${Date.now()}`, { cache: "no-store" });
        const source = await response.text();
        byteDiagnostic = ` index.js bytes=${source.length}`;
    } catch (error) {
        byteDiagnostic = ` index.js fetch failed (${error instanceof Error ? error.message : String(error)})`;
    }

    const message = [
        "UI failed to load: faust-ui/index.js did not export a FaustUI constructor.",
        `Attempted: ${FAUST_UI_MODULE_SPECS.join(", ")}.`,
        diagnostics.join(" | "),
        byteDiagnostic,
        lastImportError ? `Last import error: ${lastImportError instanceof Error ? lastImportError.message : String(lastImportError)}` : "",
    ].filter(Boolean).join(" ");
    throw new TypeError(message);
}

/**
 * @param {number} width
 * @param {number} totalControls
 * @returns {number}
 */
function getKnobColumnCount(width, totalControls) {
    const estimatedColumns = Math.max(1, Math.floor(width / KNOB_TARGET_SIZE));
    return Math.max(
        KNOB_MIN_COLUMNS,
        Math.min(KNOB_MAX_COLUMNS, Math.min(totalControls, estimatedColumns))
    );
}

/**
 * @param {number} width
 * @param {number} totalControls
 * @returns {number}
 */
function getKnobMaxColumnsForWidth(width, totalControls) {
    const widthBound = Math.max(1, Math.floor(width / KNOB_MIN_COLUMN_PIXEL_WIDTH));
    return Math.max(
        KNOB_MANUAL_MIN_COLUMNS,
        Math.min(KNOB_MAX_COLUMNS, Math.min(totalControls, widthBound))
    );
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function normalize(value, min, max) {
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
    const range = max - min;
    if (!Number.isFinite(range) || range === 0) return 0;
    return Math.max(0, Math.min(1, (value - min) / range));
}

/**
 * @param {number} normalized
 * @returns {string}
 */
function getSignalState(normalized) {
    if (normalized < 0.2) return "IDLE";
    if (normalized < 0.4) return "SCAN";
    if (normalized < 0.6) return "SYNC";
    if (normalized < 0.8) return "PULSE";
    return "PEAK";
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatValue(value) {
    if (!Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    if (abs >= 10) return value.toFixed(1);
    if (abs >= 1) return value.toFixed(2);
    return value.toFixed(3);
}

/**
 * @returns {boolean}
 */
function canUseTouchHaptics() {
    if (hasNativeVibrationSupport()) return true;
    return typeof document !== "undefined";
}

/**
 * @returns {boolean}
 */
function hasNativeVibrationSupport() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * @returns {boolean}
 */
function isLikelyIOSTouchDevice() {
    if (typeof navigator === "undefined") return false;
    const ua = String(navigator.userAgent || "");
    const platform = String(navigator.platform || "");
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    return platform === "MacIntel" && touchPoints > 1;
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
    const fallbackSwitch = ensureIOSHapticFallbackSwitch();
    if (!fallbackSwitch) return false;
    fallbackSwitch.label.click();
    fallbackSwitch.input.click();
    return true;
}

/**
 * @param {number} durationMs
 * @returns {boolean}
 */
function triggerTouchHapticTick(durationMs) {
    let fired = false;
    if (hasNativeVibrationSupport()) {
        navigator.vibrate(Math.max(1, Math.floor(durationMs)));
        fired = true;
    }
    const fallbackSwitch = ensureIOSHapticFallbackSwitch();
    if (fallbackSwitch) {
        for (let i = 0; i < HAPTIC_FALLBACK_TICK_BURST_COUNT; i += 1) {
            fallbackSwitch.label.click();
            fallbackSwitch.input.click();
        }
        fired = true;
    }
    return fired;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} history
 * @param {string} baselineColor
 * @param {string} strokeColor
 */
function paintSparkline(canvas, history, baselineColor, strokeColor) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(60, Math.floor(canvas.clientWidth || 72));
    const height = Math.max(10, Math.floor(canvas.clientHeight || 14));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = baselineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height - 0.5);
    ctx.lineTo(width, height - 0.5);
    ctx.stroke();

    if (history.length < 2) return;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    history.forEach((sample, i) => {
        const x = (i / (history.length - 1)) * (width - 1);
        const y = (1 - sample) * (height - 2) + 1;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

/**
 * @param {Array<Record<string, unknown>> | undefined} metaIn
 * @returns {Array<Record<string, unknown>>}
 */
function appendKnobMeta(metaIn) {
    const cleanedMeta = [];
    if (Array.isArray(metaIn)) {
        metaIn.forEach((meta) => {
            if (!meta || typeof meta !== "object") return;
            if ("style" in meta) {
                const { style, ...rest } = meta;
                if (Object.keys(rest).length > 0) cleanedMeta.push(rest);
                return;
            }
            cleanedMeta.push({ ...meta });
        });
    }
    return [{ style: "knob" }, ...cleanedMeta];
}

/**
 * @param {any[]} items
 * @param {any[]} out
 * @returns {any[]}
 */
function collectControlItems(items, out = []) {
    items.forEach((item) => {
        if (item && typeof item === "object" && "items" in item && Array.isArray(item.items)) {
            collectControlItems(item.items, out);
            return;
        }
        out.push(item);
    });
    return out;
}

const HUD_GLOBAL_ONLY_KEYS = new Set(["gain"]);

/**
 * @param {any} item
 * @returns {string}
 */
function controlKeyForItem(item) {
    const address = item && typeof item === "object" ? item.address : "";
    if (typeof address !== "string") return "";
    const parts = address.split("/").filter(Boolean);
    return (parts.at(-1) || "").toLowerCase();
}

/**
 * @param {any[]} items
 * @returns {any[]}
 */
function collectGridControlItems(items) {
    return collectControlItems(items, []).filter((item) => !HUD_GLOBAL_ONLY_KEYS.has(controlKeyForItem(item)));
}

/**
 * @param {any} item
 * @returns {any}
 */
function toKnobControl(item) {
    if (!item || typeof item !== "object") return item;
    if (item.type === "hslider" || item.type === "vslider" || item.type === "nentry") {
        return {
            ...item,
            type: "knob",
            meta: appendKnobMeta(item.meta),
        };
    }
    return { ...item };
}

/**
 * Keep the default Faust order, but promote key controls when needed.
 *
 * @param {any[]} controls
 * @returns {any[]}
 */
function orderKnobControls(controls) {
    if (!Array.isArray(controls) || controls.length < 2) return Array.isArray(controls) ? controls.slice() : [];

    const prioritizedKeys = ["gain"];

    const remaining = controls.slice();
    const ordered = [];

    prioritizedKeys.forEach((key) => {
        const index = remaining.findIndex((item) => controlKeyForItem(item) === key);
        if (index >= 0) {
            ordered.push(remaining.splice(index, 1)[0]);
        }
    });

    return [...ordered, ...remaining];
}

/**
 * Build a vertical stack of horizontal rows to create a knob grid.
 *
 * @param {any[]} sourceUI
 * @param {number} columns
 * @returns {{ ui: any[]; paths: string[] }}
 */
function buildKnobGridUI(sourceUI, columns) {
    const controls = orderKnobControls(collectGridControlItems(sourceUI).map(toKnobControl));
    const rows = [];
    for (let i = 0; i < controls.length; i += columns) {
        rows.push({
            type: "hgroup",
            label: "",
            items: controls.slice(i, i + columns),
        });
    }
    return {
        ui: [{
            type: "vgroup",
            label: "",
            items: rows,
        }],
        paths: controls
            .map((item) => item && typeof item === "object" ? item.address : undefined)
            .filter((address) => typeof address === "string"),
    };
}

/**
 * Render a visible error in the UI container instead of a blank screen.
 *
 * @param {HTMLElement} divFaustUI
 * @param {string} message
 */
function renderUIError(divFaustUI, message) {
    const $error = document.createElement("div");
    $error.style.padding = "16px";
    $error.style.color = "rgba(232, 236, 240, 0.92)";
    $error.style.background = "rgba(8, 9, 11, 0.94)";
    $error.style.border = "1px solid rgba(71, 229, 186, 1)";
    $error.style.fontFamily = HUD_FONT_FAMILY;
    $error.style.fontWeight = "700";
    $error.style.fontSize = "14px";
    $error.style.whiteSpace = "pre-wrap";
    $error.textContent = message;
    divFaustUI.replaceChildren($error);
}

/**
 * Apply HUD styles to knob components.
 *
 * @param {any} faustUI
 * @param {HUDTheme} theme
 */
function applyHUDStyles(faustUI, theme) {
    const $root = faustUI && faustUI.faustUIRoot && faustUI.faustUIRoot.container;
    if ($root instanceof HTMLElement) {
        Object.assign($root.style, {
            position: "relative",
            background: "transparent",
            border: "none",
            margin: "0",
        });
        $root.querySelectorAll(".faust-ui-group").forEach(($group) => {
            if (!($group instanceof HTMLElement)) return;
            Object.assign($group.style, {
                position: "absolute",
                overflow: "hidden",
                background: "transparent",
                border: "none",
                borderRadius: "0",
            });
        });
        $root.querySelectorAll(".faust-ui-component").forEach(($item) => {
            if (!($item instanceof HTMLElement)) return;
            Object.assign($item.style, {
                position: "absolute",
                overflow: "hidden",
            });
        });
    }

    const components = [];
    Object.values(faustUI.componentMap).forEach((items) => components.push(...items));
    components.forEach((component, index) => {
        if (component.className === "knob") {
            const controlKey = getHUDControlKey(component, index);
            const controlFamily = getHUDControlFamily(controlKey);
            const controlPalette = createHUDControlPalette(theme, controlFamily);
            const knobStyle = createKnobStyle(theme, controlPalette);
            if (component.state && component.state.style && typeof component.state.style === "object") {
                Object.assign(component.state.style, knobStyle);
                if (typeof component.emitSync === "function") {
                    component.emitSync("style", component.state.style);
                }
            } else {
                component.setState({ style: knobStyle });
            }
            if (!component.container) return;
            Object.assign(component.container.style, {
                boxSizing: "border-box",
                padding: "4px",
                background: `linear-gradient(180deg, ${controlPalette.panelTop} 0%, ${controlPalette.grid} 12%, rgba(0, 0, 0, 0.16) 14%, rgba(0, 0, 0, 0.68) 100%), radial-gradient(circle at 50% 0%, ${controlPalette.panelGlow}, rgba(0, 0, 0, 0) 58%), ${theme.panelBg}`,
                border: `1px solid ${controlPalette.border}`,
                borderRadius: "0",
                position: "absolute",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                aspectRatio: "1 / 1",
                touchAction: "pan-y",
                boxShadow: `inset 0 0 0 1px ${controlPalette.grid}`,
            });
            component.container.dataset.knobGestureActive = "0";
            component.container.dataset.hudFamily = controlFamily;
            const $canvas = component.container.querySelector("canvas");
            if ($canvas instanceof HTMLCanvasElement) {
                Object.assign($canvas.style, {
                    width: "100%",
                    minHeight: "0",
                    flex: "1 1 auto",
                    height: "calc(100% - 64px)",
                    margin: "20px auto",
                    touchAction: "pan-y",
                    filter: "contrast(1.06) brightness(1.01)",
                });
            }
            if (component.container.dataset.hudTouchGuard !== "1") {
                const blockTouchScroll = (event) => {
                    if (component.container?.dataset.knobGestureActive !== "1") return;
                    if (event.cancelable) event.preventDefault();
                };
                component.container.addEventListener("touchmove", blockTouchScroll, { passive: false });
                component.container.dataset.hudTouchGuard = "1";
            }
            const $label = component.container.querySelector(".faust-ui-component-label");
            if ($label instanceof HTMLElement) {
                $label.style.display = "none";
            }
            const $input = component.container.querySelector("input");
            if ($input instanceof HTMLInputElement) {
                $input.style.display = "none";
            }
            if (component.container.dataset.hudWidget === "1") return;
            component.container.dataset.hudWidget = "1";

            const $overlay = document.createElement("div");
            $overlay.className = "faust-hud-overlay";
            Object.assign($overlay.style, {
                position: "absolute",
                inset: "0",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                padding: "3px 4px",
                pointerEvents: "none",
                zIndex: "2",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
                fontFamily: HUD_FONT_FAMILY,
                fontWeight: "700",
                color: controlPalette.meta,
            });

            const $header = document.createElement("div");
            $header.className = "faust-hud-header";
            Object.assign($header.style, {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                minHeight: "13px",
            });
            const $name = document.createElement("span");
            $name.className = "faust-hud-name";
            Object.assign($name.style, {
                color: controlPalette.label,
                fontSize: HUD_TEXT_SIZES.name,
                fontWeight: "700",
                lineHeight: "1.05",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "74%",
            });
            const $index = document.createElement("span");
            $index.className = "faust-hud-index";
            Object.assign($index.style, {
                color: controlPalette.accent,
                fontSize: HUD_TEXT_SIZES.index,
                lineHeight: "1.05",
            });
            $header.append($name, $index);

            const $meta = document.createElement("div");
            $meta.className = "faust-hud-meta";
            Object.assign($meta.style, {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                minHeight: "12px",
                color: controlPalette.meta,
                fontSize: HUD_TEXT_SIZES.meta,
                lineHeight: "1.05",
            });
            const $value = document.createElement("span");
            $value.className = "faust-hud-value";
            Object.assign($value.style, {
                color: controlPalette.value,
                fontWeight: "700",
            });
            const $state = document.createElement("span");
            $state.className = "faust-hud-state";
            $state.style.color = controlPalette.meta;
            $meta.append($value, $state);

            const $bars = document.createElement("div");
            $bars.className = "faust-hud-bars";
            Object.assign($bars.style, {
                display: "grid",
                gridTemplateColumns: `repeat(${HUD_BAR_COUNT}, 1fr)`,
                gap: "1px",
                height: "6px",
            });
            /** @type {HTMLSpanElement[]} */
            const barNodes = [];
            for (let i = 0; i < HUD_BAR_COUNT; i++) {
                const $bar = document.createElement("span");
                $bar.className = "faust-hud-bar";
                Object.assign($bar.style, {
                    background: theme.off,
                    border: `1px solid ${controlPalette.grid}`,
                });
                $bars.appendChild($bar);
                barNodes.push($bar);
            }

            const $spark = document.createElement("canvas");
            $spark.className = "faust-hud-spark";
            Object.assign($spark.style, {
                width: "100%",
                height: "12px",
                display: "block",
            });

            const $range = document.createElement("div");
            $range.className = "faust-hud-range";
            Object.assign($range.style, {
                marginTop: "auto",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                minHeight: "12px",
                color: controlPalette.meta,
                fontSize: HUD_TEXT_SIZES.range,
                lineHeight: "1.05",
            });
            const $min = document.createElement("span");
            $min.className = "faust-hud-min";
            const $max = document.createElement("span");
            $max.className = "faust-hud-max";
            $range.append($min, $max);

            $overlay.append($header, $meta, $bars, $spark, $range);
            component.container.appendChild($overlay);

            // SEQ toggle button (per-knob)
            if (component.container.dataset.hudSeqToggle !== "1") {
                component.container.dataset.hudSeqToggle = "1";
                const $seqToggle = document.createElement("button");
                $seqToggle.className = "hud-knob-seq-toggle";
                $seqToggle.dataset.paramAddress = (component.state && component.state.address) || "";
                $seqToggle.dataset.seqLinked = "0";
                $seqToggle.textContent = "S";
                Object.assign($seqToggle.style, {
                    position: "absolute",
                    bottom: "4px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "20px",
                    height: "18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0",
                    margin: "0",
                    fontSize: "10px",
                    lineHeight: "1",
                    fontFamily: HUD_FONT_FAMILY,
                    fontWeight: "700",
                    cursor: "pointer",
                    pointerEvents: "auto",
                    zIndex: "3",
                    textTransform: "uppercase",
                });
                $seqToggle.addEventListener("click", (event) => {
                    event.stopPropagation();
                });
                component.container.appendChild($seqToggle);
            }

            const baseNameSize = Number.parseFloat(HUD_TEXT_SIZES.name) || 8.4;
            const baseIndexSize = Number.parseFloat(HUD_TEXT_SIZES.index) || 7.8;
            const baseMetaSize = Number.parseFloat(HUD_TEXT_SIZES.meta) || 7.3;
            const baseRangeSize = Number.parseFloat(HUD_TEXT_SIZES.range) || 6.9;
            let scaleFrame = 0;
            const px = (value) => `${Math.max(0, value).toFixed(2)}px`;
            const applyHUDScale = () => {
                if (!component.container) return;
                const width = Math.max(48, component.container.clientWidth || KNOB_TARGET_SIZE);
                const scale = Math.max(0.92, Math.min(1.95, Math.sqrt(width / KNOB_TARGET_SIZE)));
                $overlay.style.gap = px(2 * scale);
                $overlay.style.padding = `${px(3 * scale)} ${px(4 * scale)}`;
                $header.style.minHeight = px(13 * scale);
                $meta.style.minHeight = px(12 * scale);
                $range.style.minHeight = px(12 * scale);
                $name.style.fontSize = px(baseNameSize * scale);
                $index.style.fontSize = px(baseIndexSize * scale);
                $meta.style.fontSize = px(baseMetaSize * scale);
                $range.style.fontSize = px(baseRangeSize * scale);
                $bars.style.height = px(6 * scale);
                $spark.style.height = px(12 * scale);
                if ($canvas instanceof HTMLCanvasElement) {
                    const reserved = Math.round(64 * scale);
                    const canvasMargin = px(20 * scale);
                    $canvas.style.height = `calc(100% - ${reserved}px)`;
                    $canvas.style.margin = `${canvasMargin} auto`;
                }
            };
            const scheduleHUDScale = () => {
                if (scaleFrame) return;
                scaleFrame = requestAnimationFrame(() => {
                    scaleFrame = 0;
                    applyHUDScale();
                });
            };

            const history = [];
            let hudFrame = 0;
            let lastSparkPaint = 0;
            let changeClearTimer = 0;
            const hapticState = {
                touchActive: false,
                touchPointerId: -1,
                lastTickAt: 0,
                lastBucket: -1,
            };
            const eventHitsKnobDial = (event) => {
                const $dialCanvas = component.canvas instanceof HTMLCanvasElement
                    ? component.canvas
                    : component.container?.querySelector("canvas");
                if (!($dialCanvas instanceof HTMLCanvasElement)) return false;
                const point = ("touches" in event)
                    ? (event.touches[0] || event.changedTouches[0] || null)
                    : event;
                if (!point || typeof point.clientX !== "number" || typeof point.clientY !== "number") return false;
                const rect = $dialCanvas.getBoundingClientRect();
                const x = point.clientX - rect.left;
                const y = point.clientY - rect.top;
                if (typeof component.canStartInteraction === "function") {
                    return component.canStartInteraction({
                        pointerId: "pointerId" in event ? event.pointerId : -1,
                        x,
                        y,
                        rect,
                        originalEvent: event,
                    });
                }
                return x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
            };
            const markKnobChanging = () => {
                if (!component.container) return;
                component.container.dataset.changing = "1";
                if (changeClearTimer) {
                    window.clearTimeout(changeClearTimer);
                }
                changeClearTimer = window.setTimeout(() => {
                    changeClearTimer = 0;
                    if (component.container) component.container.dataset.changing = "0";
                }, 180);
            };
            const maybeHapticTick = () => {
                if (!hapticState.touchActive) return;
                if (!canUseTouchHaptics()) return;
                const { value, min, max } = component.state;
                const normalized = normalize(value, min, max);
                const bucket = Math.round(normalized * HAPTIC_TICK_BUCKET_COUNT);
                const now = performance.now();
                if (hapticState.lastBucket < 0) {
                    hapticState.lastBucket = bucket;
                    return;
                }
                if (bucket === hapticState.lastBucket) return;
                hapticState.lastBucket = bucket;
                if (now - hapticState.lastTickAt < HAPTIC_TICK_MIN_INTERVAL_MS) return;
                hapticState.lastTickAt = now;
                triggerTouchHapticTick(HAPTIC_TICK_DURATION_MS);
            };
            const beginTouchHaptics = (pointerId = -1) => {
                hapticState.touchActive = true;
                hapticState.touchPointerId = pointerId;
                hapticState.lastTickAt = 0;
                hapticState.lastBucket = -1;
                primeIOSHapticFallback();
            };
            const endTouchHaptics = (pointerId = -1) => {
                if (pointerId !== -1 && hapticState.touchPointerId !== -1 && pointerId !== hapticState.touchPointerId) return;
                hapticState.touchActive = false;
                hapticState.touchPointerId = -1;
                hapticState.lastTickAt = 0;
                hapticState.lastBucket = -1;
            };
            component.container.dataset.changing = "0";
            if (component.container.dataset.hudHapticBound !== "1") {
                component.container.dataset.hudHapticBound = "1";
                component.container.addEventListener("pointerdown", (event) => {
                    if (event.pointerType !== "touch") return;
                    if (!eventHitsKnobDial(event)) return;
                    beginTouchHaptics(event.pointerId);
                }, { passive: false, capture: true });
                component.container.addEventListener("pointermove", (event) => {
                    if (event.pointerType !== "touch") return;
                    if (hapticState.touchPointerId !== -1 && event.pointerId !== hapticState.touchPointerId) return;
                    maybeHapticTick();
                }, { passive: false, capture: true });
                component.container.addEventListener("pointerup", (event) => {
                    endTouchHaptics(event.pointerId);
                }, { passive: true, capture: true });
                component.container.addEventListener("pointercancel", (event) => {
                    endTouchHaptics(event.pointerId);
                }, { passive: true, capture: true });
                component.container.addEventListener("lostpointercapture", () => {
                    endTouchHaptics(-1);
                }, { passive: true });
                component.container.addEventListener("touchstart", (event) => {
                    if (!eventHitsKnobDial(event)) return;
                    beginTouchHaptics(-1);
                }, { passive: false, capture: true });
                component.container.addEventListener("touchmove", () => {
                    maybeHapticTick();
                }, { passive: false, capture: true });
                component.container.addEventListener("touchend", () => {
                    endTouchHaptics(-1);
                }, { passive: true, capture: true });
                component.container.addEventListener("touchcancel", () => {
                    endTouchHaptics(-1);
                }, { passive: true, capture: true });
            }
            const updateHUD = () => {
                applyHUDScale();
                const { label, address, value, min, max } = component.state;
                const normalized = normalize(value, min, max);
                const signalState = getSignalState(normalized);
                history.push(normalized);
                if (history.length > HUD_SPARK_HISTORY) history.shift();
                const shortLabel = (label || address || `control_${index + 1}`).replace(/\s+/g, "_");
                $name.textContent = shortLabel;
                $index.textContent = `P${String(index + 1).padStart(2, "0")}`;
                $value.textContent = formatValue(value);
                $state.textContent = signalState;
                component.container.dataset.signalState = signalState;
                $min.textContent = `MIN ${formatValue(min)}`;
                $max.textContent = `MAX ${formatValue(max)}`;
                const activeBars = Math.round(normalized * (HUD_BAR_COUNT - 1));
                barNodes.forEach(($bar, i) => {
                    $bar.classList.toggle("active", i <= activeBars);
                    $bar.classList.toggle("tip", i === activeBars);
                    $bar.style.background = i === activeBars
                        ? controlPalette.barTip
                        : i <= activeBars
                            ? controlPalette.barActive
                            : theme.off;
                    $bar.style.borderColor = i <= activeBars ? controlPalette.accentSoft : controlPalette.grid;
                });
                const now = performance.now();
                if (now - lastSparkPaint > 66 || history.length < 3) {
                    paintSparkline($spark, history, controlPalette.sparkBase, controlPalette.sparkLine);
                    lastSparkPaint = now;
                }
            };

            const scheduleHUDUpdate = () => {
                if (hudFrame) return;
                hudFrame = requestAnimationFrame(() => {
                    hudFrame = 0;
                    updateHUD();
                });
            };

            component.on("value", () => {
                markKnobChanging();
                scheduleHUDUpdate();
            });
            component.on("min", scheduleHUDUpdate);
            component.on("max", scheduleHUDUpdate);
            component.on("label", scheduleHUDUpdate);
            updateHUD();
            scheduleHUDScale();
            requestAnimationFrame(scheduleHUDScale);
        }
    });
}

/**
 * Creates a Faust UI for a Faust audio node.
 * 
 * @param {FaustAudioWorkletNode} faustNode 
 */
async function createFaustUI(divFaustUI, faustNode) {
    let FaustUI = null;
    try {
        FaustUI = await loadFaustUIConstructor();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        renderUIError(divFaustUI, message);
        throw error;
    }
    let hudTheme = readActiveHUDTheme();
    const sourceUI = faustNode.getUI();
    const totalControls = collectGridControlItems(sourceUI).length;
    const $container = document.createElement("div");
    $container.style.margin = "0";
    $container.style.position = "absolute";
    $container.style.overflowY = "auto";
    $container.style.overflowX = "hidden";
    $container.style.touchAction = "pan-y";
    $container.style.overscrollBehaviorX = "none";
    $container.style.display = "flex";
    $container.style.flexDirection = "column";
    $container.style.width = "100%";
    $container.style.height = "100%";
    $container.style.paddingTop = `calc(var(--hud-panel-reserve, ${HUD_CONTROL_STRIP_HEIGHT_FALLBACK}px) + 4px)`;
    $container.style.paddingRight = "4px";
    $container.style.paddingBottom = "4px";
    $container.style.paddingLeft = "4px";
    $container.style.boxSizing = "border-box";
    $container.style.zIndex = "1";
    $container.dataset.faustGrid = "1";
    divFaustUI.appendChild($container);

    /** @type {InstanceType<typeof FaustUI> | null} */
    let faustUI = null;
    /** @type {string[]} */
    let controlPaths = [];
    let currentColumns = 0;
    let resizeFrame = 0;
    /** @type {number | null} */
    let manualColumns = null;

    const getElementContentWidth = (element, fallback = 1024) => {
        const baseWidth = element instanceof HTMLElement
            ? (element.clientWidth || fallback)
            : fallback;
        if (!(element instanceof HTMLElement) || typeof window === "undefined") return baseWidth;
        const computed = window.getComputedStyle(element);
        const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
        const paddingRight = Number.parseFloat(computed.paddingRight) || 0;
        return Math.max(0, baseWidth - paddingLeft - paddingRight);
    };

    const getContainerWidth = () => getElementContentWidth($container, window.innerWidth || 1024);
    const getColumnRangeForWidth = (width) => ({
        min: KNOB_MANUAL_MIN_COLUMNS,
        max: getKnobMaxColumnsForWidth(width, totalControls),
    });
    const getCurrentColumnRange = () => getColumnRangeForWidth(getContainerWidth());
    const paramObservers = new Set();

    /**
     * @param {string} path
     * @param {number} value
     */
    const notifyParamObservers = (path, value) => {
        paramObservers.forEach((observer) => {
            try {
                observer(path, value);
            } catch (error) {
                console.warn("HUD param observer failed:", error);
            }
        });
    };

    const setParamValueWithUI = (path, value) => {
        if (!Number.isFinite(value)) return;
        faustNode.setParamValue(path, value);
        if (faustUI) faustUI.paramChangeByDSP(path, value);
        notifyParamObservers(path, value);
    };

    const syncValuesFromDSP = () => {
        if (!faustUI) return;
        if (typeof faustNode.getParamValue !== "function") return;
        controlPaths.forEach((path) => {
            const value = faustNode.getParamValue(path);
            if (Number.isFinite(value)) {
                faustUI.paramChangeByDSP(path, value);
                notifyParamObservers(path, value);
            }
        });
    };

    const renderKnobGrid = (force = false) => {
        hudTheme = readActiveHUDTheme();
        $container.style.paddingTop = `calc(var(--hud-panel-reserve, ${HUD_CONTROL_STRIP_HEIGHT_FALLBACK}px) + 4px)`;
        const width = getContainerWidth();
        const range = getColumnRangeForWidth(width);
        const autoColumns = getKnobColumnCount(width, totalControls);
        if (manualColumns !== null) {
            manualColumns = Math.max(range.min, Math.min(range.max, manualColumns));
        }
        const columns = manualColumns === null
            ? Math.max(range.min, Math.min(range.max, autoColumns))
            : manualColumns;
        if (!force && faustUI && columns === currentColumns) {
            faustUI.resize();
            return;
        }
        currentColumns = columns;
        const { ui, paths } = buildKnobGridUI(sourceUI, currentColumns);
        controlPaths = paths;
        $container.replaceChildren();
        faustUI = new FaustUI({
            ui,
            root: $container,
            listenWindowMessage: false,
            listenWindowResize: true,
        });
        faustUI.calcGrid = function () {
            const rootWidth = getElementContentWidth(this.DOMroot, this.DOMroot?.getBoundingClientRect().width || FAUST_UI_MIN_GRID);
            const grid = Math.max(FAUST_UI_MIN_GRID, rootWidth / this._layout.width);
            this.grid = grid;
            return grid;
        };
        faustUI.paramChangeByUI = (path, value) => setParamValueWithUI(path, value);
        faustNode.setOutputParamHandler((path, value) => {
            faustUI.paramChangeByDSP(path, value);
            notifyParamObservers(path, value);
        });
        applyHUDStyles(faustUI, hudTheme);
        syncValuesFromDSP();
        $container.style.minWidth = "100%";
        $container.style.minHeight = `${faustUI.layout.height * FAUST_UI_MIN_GRID + 1}px`;
        $container.scrollLeft = 0;
        faustUI.resize();
    };

    renderKnobGrid();

    $container.addEventListener("scroll", () => {
        if ($container.scrollLeft !== 0) {
            $container.scrollLeft = 0;
        }
    }, { passive: true });

    window.addEventListener("resize", () => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(renderKnobGrid);
    });

    return {
        setParamValue: setParamValueWithUI,
        setParamValues: (entries) => {
            if (!Array.isArray(entries)) return;
            entries.forEach((entry) => {
                if (!entry || typeof entry !== "object") return;
                if (typeof entry.path !== "string") return;
                setParamValueWithUI(entry.path, entry.value);
            });
        },
        setColumns: (columns) => {
            const range = getCurrentColumnRange();
            const parsed = Number(columns);
            if (!Number.isFinite(parsed)) return currentColumns;
            manualColumns = Math.max(range.min, Math.min(range.max, Math.round(parsed)));
            renderKnobGrid();
            return currentColumns;
        },
        zoomIn: () => {
            const range = getCurrentColumnRange();
            const base = manualColumns === null
                ? Math.max(range.min, Math.min(range.max, getKnobColumnCount(getContainerWidth(), totalControls)))
                : manualColumns;
            manualColumns = Math.max(range.min, base - 1);
            renderKnobGrid();
            return currentColumns;
        },
        zoomOut: () => {
            const range = getCurrentColumnRange();
            const base = manualColumns === null
                ? Math.max(range.min, Math.min(range.max, getKnobColumnCount(getContainerWidth(), totalControls)))
                : manualColumns;
            manualColumns = Math.min(range.max, base + 1);
            renderKnobGrid();
            return currentColumns;
        },
        getColumns: () => currentColumns,
        getColumnRange: getCurrentColumnRange,
        clearColumnOverride: () => {
            manualColumns = null;
            renderKnobGrid();
            return currentColumns;
        },
        setTheme: (themeId) => {
            hudTheme = readActiveHUDTheme(themeId);
            renderKnobGrid(true);
            return hudTheme.id || DEFAULT_HUD_THEME_ID;
        },
        subscribeToParamChanges: (observer) => {
            if (typeof observer !== "function") return () => {};
            paramObservers.add(observer);
            return () => {
                paramObservers.delete(observer);
            };
        },
        syncFromDSP: syncValuesFromDSP,
        getControlPaths: () => controlPaths.slice(),
    };
};

/**
 * Request permission to use motion and orientation sensors.
 */
async function requestPermissions() {
    let granted = true;
    let requested = false;

    // Explicitly request permission on iOS before using motion-driven controls.
    if (typeof window.DeviceMotionEvent !== "undefined" && typeof window.DeviceMotionEvent.requestPermission === "function") {
        requested = true;
        try {
            const permissionState = await window.DeviceMotionEvent.requestPermission();
            if (permissionState !== "granted") {
                console.warn("Motion sensor permission denied.");
                granted = false;
            } else {
                console.log("Motion sensor permission granted.");
            }
        } catch (error) {
            console.error("Error requesting motion sensor permission:", error);
            granted = false;
        }
    }

    if (typeof window.DeviceOrientationEvent !== "undefined" && typeof window.DeviceOrientationEvent.requestPermission === "function") {
        requested = true;
        try {
            const permissionState = await window.DeviceOrientationEvent.requestPermission();
            if (permissionState !== "granted") {
                console.warn("Orientation sensor permission denied.");
                granted = false;
            } else {
                console.log("Orientation sensor permission granted.");
            }
        } catch (error) {
            console.error("Error requesting orientation sensor permission:", error);
            granted = false;
        }
    }

    return requested ? granted : true;
}

// Export the functions
export { createFaustNode, createFaustUI, connectToAudioInput, requestPermissions };

