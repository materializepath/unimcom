import("stdfaust.lib");

declare name "ambient_m7_3.0";

// MIDI-mapped parameters (also work as manual sliders)
midiRoot  = hslider("midiRoot[midi:ctrl 1]", 110, 55, 220, 0.1);
midiGain  = hslider("midiGain[midi:ctrl 7]", -12, -36, -3, 0.1);
midiTone  = hslider("midiTone[midi:ctrl 74]", 0.75, 0.20, 0.98, 0.01);

// Live audio input control
inputGain = hslider("inputGain", 0.0, 0.0, 1.0, 0.001);

// Original parameters (all 57 preserved)
root      = hslider("root[unit:Hz]", 110, 55, 220, 0.1);
motion    = hslider("motion", 0.20, 0.02, 0.80, 0.01);
detuneAmt = hslider("detune", 0.0025, 0.0, 0.02, 0.0001);
airLevel  = hslider("air", 0.02, 0.0, 0.08, 0.001);
sparkleLevel = hslider("sparkle", 0.14, 0.0, 0.80, 0.001);
sparkleRate  = hslider("sparkleRate", 0.25, 0.05, 1.50, 0.01);
sparkleTone  = hslider("sparkleTone", 0.75, 0.20, 0.98, 0.01);
invisibleAmt = hslider("invisibleAmt", 0.0, 0.0, 1.0, 0.001);
materialAmt = hslider("materialAmt", 0.0, 0.0, 1.0, 0.001);
transmuteAmt = hslider("transmuteAmt", 0.0, 0.0, 1.0, 0.001);
ascendAmt = hslider("ascendAmt", 0.0, 0.0, 1.0, 0.001);
attuneHit = hslider("attuneHit", 0.0, 0.0, 1.0, 0.001);
attuneBuild = hslider("attuneBuild", 0.0, 0.0, 1.0, 0.001);

chantAmt = hslider("chantAmt", 0.12, 0.0, 1.0, 0.001);
chantMode = hslider("chantMode", 0.35, 0.0, 1.0, 0.001);
chantFormant = hslider("chantFormant", 0.58, 0.0, 1.0, 0.001);
chantMotion = hslider("chantMotion", 0.24, 0.02, 1.6, 0.01);
chantReciteMix = hslider("chantReciteMix", 0.55, 0.0, 1.0, 0.001);
organumAmt = hslider("organumAmt", 0.22, 0.0, 1.0, 0.001);
cathedralAmt = hslider("cathedralAmt", 0.30, 0.0, 1.0, 0.001);
cathedralTime = hslider("cathedralTime", 2.8, 0.8, 6.0, 0.01);
boadiceaAmt = hslider("boadiceaAmt", 0.14, 0.0, 1.0, 0.001);
boadiceaContour = hslider("boadiceaContour", 0.48, 0.0, 1.0, 0.001);
boadiceaRate = hslider("boadiceaRate", 0.22, 0.03, 1.2, 0.01);
ritualPercAmt = hslider("ritualPercAmt", 0.08, 0.0, 1.0, 0.001);
ritualPulseRate = hslider("ritualPulseRate", 0.72, 0.2, 3.0, 0.01);
ritualTone = hslider("ritualTone", 96, 40, 240, 0.1);
ritualDecay = hslider("ritualDecay", 0.42, 0.05, 1.2, 0.001);
percussionDrive = hslider("percussionDrive", 0.46, 0.0, 1.0, 0.001);
percussionDensity = hslider("percussionDensity", 0.38, 0.0, 1.0, 0.001);

cameraOrbitX = hslider("cameraOrbitX", 0.5, 0.0, 1.0, 0.001);
cameraOrbitY = hslider("cameraOrbitY", 0.5, 0.0, 1.0, 0.001);
mobileRotX = hslider("mobileRotX", 0.5, 0.0, 1.0, 0.001);
mobileRotY = hslider("mobileRotY", 0.5, 0.0, 1.0, 0.001);
zoomIn = hslider("zoomIn", 0.0, 0.0, 1.0, 0.001);
zoomOut = hslider("zoomOut", 0.0, 0.0, 1.0, 0.001);
proximityCtl = hslider("proximityCtl", 0.0, 0.0, 1.0, 0.001);
lockCtl = hslider("lockCtl", 0.0, 0.0, 1.0, 0.001);
stageCtl = hslider("stageCtl", 0.0, 0.0, 1.0, 0.001);
objectSpinCtl = hslider("objectSpinCtl", 0.0, 0.0, 1.0, 0.001);

polyAmt = hslider("polyAmt", 0.25, 0.0, 1.0, 0.001);
polySpread = hslider("polySpread", 0.22, 0.0, 1.0, 0.001);
polyChord = hslider("polyChord", 0.35, 0.0, 1.0, 0.001);
polyMotion = hslider("polyMotion", 0.28, 0.0, 1.0, 0.001);
polyWarp = hslider("polyWarp", 0.18, 0.0, 1.0, 0.001);

ambiAmt = hslider("ambiAmt", 0.26, 0.0, 1.0, 0.001);
ambiRotate = hslider("ambiRotate", 0.5, 0.0, 1.0, 0.001);
ambiElev = hslider("ambiElev", 0.5, 0.0, 1.0, 0.001);
ambiWidth = hslider("ambiWidth", 0.35, 0.0, 1.0, 0.001);
ambiFocus = hslider("ambiFocus", 0.4, 0.0, 1.0, 0.001);
ambiSpin = hslider("ambiSpin", 0.22, 0.0, 1.0, 0.001);
ambiDepth = hslider("ambiDepth", 0.35, 0.0, 1.0, 0.001);

smoothCtl(c) = si.smooth(c);
phaserRate = hslider("phaserRate", 0.18, 0.05, 2.5, 0.01) : smoothCtl(0.9993);
phaserDepth = hslider("phaserDepth", 1.0, 0.0, 1.0, 0.001) : smoothCtl(0.9995);
phaserFeedback = hslider("phaserFeedback", 0.85, -0.85, 0.85, 0.001) : smoothCtl(0.9997);
phaserMix = hslider("phaserMix", 0.22, 0.0, 1.0, 0.001) : smoothCtl(0.9994);
outGain = hslider("gain[dB]", -12, -36, -3, 0.1) : ba.db2linear;

// Effective values: blend manual + MIDI
effectiveRoot = root * (midiRoot / 110);
effectiveGain = outGain * ba.db2linear(midiGain) / ba.db2linear(-12);
effectiveTone = sparkleTone * 0.5 + midiTone * 0.5;

clamp01(x) = min(1.0, max(0.0, x));
sat(x) = ma.tanh(x);
semi(x) = ba.semi2ratio(x);
lpSimple(x) = 0.74 * x + 0.26 * (x @ 1);
hpSimple(x) = x - lpSimple(x);
mix(m, a, b) = a * (1 - m) + b * m;
safeDelay(n, d, x) = de.delay(n, max(0, min(n, d)), x);

MAX_DELAY = 96000;
phasor_phase(dtime, phase) = ((os.lf_rawsaw(dtime) + phase) % dtime) : int;
indexphasor(dtime, phase) = phasor_phase(dtime * 2, phase) <: <=(dtime), (*(-1) + dtime * 2), _ : select2;
delay_module(dtime, phase) = rwtable(MAX_DELAY, 0.0, indexphasor(dtime, phase) : int, _, indexphasor(dtime, phase + 1) : int) : window
with { window = *(sin(0.5 * ma.PI * phasor_phase(dtime, phase) / dtime)); };
reversedelay_mono(dtime) = _ <: delay_module(dtime, 0), delay_module(dtime, dtime / 2) :> _;
reversedelay_pingpong(dtime, spread, fb) = (si.bus(2), pingpong_premix :> reversedelay_mono(dtime), reversedelay_mono(dtime)) ~ distribute
with {
  distribute = _, _ <: *(1 - spread), *(spread), *(spread), *(1 - spread) : +, + : fbgain;
  pingpong_premix = _, _ <: _, *(spread), *(0), *(1 - spread) :> +, +;
  fbgain = *(fb), *(fb * si.interpolate(spread, 1, 0.5));
};
reversedelay_pingpong_mix(dtime, spread, fb, mixv) = _, _ <: _, _, reversedelay_pingpong(dtime, spread, fb) : ro.cross2 : si.interpolate(mixv), si.interpolate(mixv);

// ═══════════════════════════════════════════════════════════════════════════
// Top-level synthesis (identical to ambient_m7_2.0, with feedback loops)
// ═══════════════════════════════════════════════════════════════════════════

masterRate = 0.18 + ritualPulseRate * (0.45 + 0.30 * percussionDensity) + motion * 0.22 + boadiceaRate * 0.14;
stepPhase = os.lf_sawpos(masterRate);
attuneBuildEnv = attuneBuild : smoothCtl(0.9978);
buildImpact = clamp01(attuneBuildEnv * (0.82 + proximityCtl * 0.48 + stageCtl * 0.36));
attuneEnv = attuneHit : smoothCtl(0.9988);
attuneImpact = clamp01(attuneEnv * (1.1 + lockCtl * 0.35 + stageCtl * 0.25));
attuneEnergy = clamp01(buildImpact * 0.78 + attuneImpact * 1.22);
hitExcite = clamp01(attuneImpact * (1.0 + buildImpact * 0.45));
stutterGate = stepPhase > (0.74 - ritualPercAmt * 0.42 - buildImpact * 0.22 - hitExcite * 0.34);

detune = detuneAmt * (0.6 + motion * 1.4);
f0 = effectiveRoot * semi((chantMode - 0.5) * 0.9 + (boadiceaContour - 0.5) * 1.2 + (cameraOrbitX - 0.5) * 0.6);
df = 14 + sparkleRate * 240 + chantMotion * 96 + transmuteAmt * 140;
dsfA = clamp01(0.30 + effectiveTone * 0.38 + transmuteAmt * 0.14);
dsfN = 42 + int(organumAmt * 26 + chantMotion * 12);
sparkleDrive = 0.30 + sparkleLevel * 0.54;
dsfL = os.dsf.osccN(f0 * (1 - detune), df, dsfA, dsfN) * sparkleDrive;
dsfR = os.dsf.oscsN(f0 * (1 + detune), df * (1 + detune * 2.5), dsfA, dsfN) * sparkleDrive;

pulseA = os.lf_imptrain(masterRate * (0.5 + chantReciteMix * 1.2) + 0.001) > 0;
pulseB = os.lf_imptrain(masterRate * (0.76 + organumAmt * 1.4) + 0.001) > 0;
pulseC = os.lf_imptrain(masterRate * (1.03 + chantMotion * 0.9) + 0.001) > 0;
hitPulse = attuneHit > 0.05;
stringGate1 = pulseA | hitPulse;
stringGate2 = pulseB | hitPulse;
stringGate3 = pulseC | hitPulse;
stringGate4 = (pulseA & pulseB) | hitPulse;
reso = 2.8 + chantFormant * 4.5 + organumAmt * 2.5;
str1 = sy.combString(f0 * semi(0), reso, stringGate1);
str2 = sy.combString(f0 * semi(4 + chantMode * 0.9), reso * 0.9, stringGate2);
str3 = sy.combString(f0 * semi(6 + boadiceaContour * 0.9), reso * 0.84, stringGate3);
str4 = sy.combString(f0 * semi(11 + chantFormant * 0.8), reso * 0.78, stringGate4);
chantDrive = 0.28 + chantAmt * 0.96;
stringsL = (0.42 * str1 + 0.26 * str2 + 0.22 * str3 + 0.18 * str4) * chantDrive;
stringsR = (0.28 * str1 + 0.34 * str2 + 0.24 * str3 + 0.20 * str4) * chantDrive;

polyDet = detune * (0.35 + polySpread * 0.9);
polyLyd3 = 4 + int(polyChord * 1);
polyLydSharp11 = 18 + int(polyChord * 1);
polyLyd7 = 11 + int(polyChord * 1);
polyLyd9 = 14 + int(polyChord * 1);
polyBase = f0 * semi((mobileRotX - 0.5) * 1.2 + (cameraOrbitX - 0.5) * 0.6);
polyRate = 0.04 + polyMotion * 1.1 + objectSpinCtl * 0.38 + motion * 0.12;
polyWaverA = os.osc(polyRate);
polyWaverB = os.osc(polyRate * 0.73 + 0.13);
polyWaverC = os.osc(polyRate * 1.19 + 0.21);
lydDriftFast = os.osc(polyRate * 0.41 + 0.07);
lydDriftSlow = os.osc(0.011 + polyMotion * 0.06 + stageCtl * 0.02);
lydDrift = (0.035 + polyWarp * 0.11 + attuneBuild * 0.06) * (0.62 * lydDriftFast + 0.38 * lydDriftSlow);
wholeBlend = clamp01(0.03 + sparkleLevel * 0.1 + zoomIn * 0.08 + attuneHit * 0.06);
polyColorStep = polyLydSharp11 + wholeBlend * 1.7;

polyV1 = os.osc(polyBase * semi(polyWaverA * 0.018));
polyV2 = os.osc(polyBase * semi(polyLyd3 + polyDet * 1.8 + polyWaverB * (0.032 + polyWarp * 0.022)));
polyV3 = os.osc(polyBase * semi(polyColorStep + polyDet * 1.3 + lydDrift + polyWaverC * (0.028 + polyWarp * 0.02)));
polyV4 = os.osc(polyBase * semi(polyLyd7 + polyDet * 1.5 - lydDrift * 0.8 + polyWaverA * (0.03 + polyWarp * 0.022)));
polyV5 = os.osc(polyBase * semi(polyLyd9 + polyDet * 1.1 + lydDrift * 0.65 + polyWaverB * (0.026 + polyWarp * 0.02)));

polyMono = sat((0.30 * polyV1 + 0.18 * polyV2 + 0.19 * polyV3 + 0.17 * polyV4 + 0.16 * polyV5) * (0.48 + polyAmt * 0.62 + polyWarp * 0.14 + proximityCtl * 0.09 + lockCtl * 0.06));
polyPan = (mobileRotY - 0.5) * 0.95 + (cameraOrbitY - 0.5) * 0.35;
polyWide = clamp01(0.18 + polySpread * 0.72 + ambiWidth * 0.18);
polyL = (polyMono * (1 - 0.42 * polyPan)) + (polyMono @ int(ma.SR * (0.004 + polyWide * 0.011))) * (0.24 + polyWide * 0.22);
polyR = (polyMono * (1 + 0.42 * polyPan)) + (polyMono @ int(ma.SR * (0.005 + polyWide * 0.013))) * (0.24 + polyWide * 0.22);

combTime = int(70 + ritualTone * 6 + chantMotion * 420 + motion * 380);
combB0 = clamp01(0.45 + boadiceaAmt * 0.35 + materialAmt * 0.20);
combAN = clamp01(0.36 + boadiceaContour * 0.45 + percussionDrive * 0.16);
toneMono = 0.5 * (dsfL + dsfR) + 0.72 * (stringsL + stringsR);
combed = toneMono : fi.fb_comb_common(@, combTime, combB0, combAN);
svfFreq = 220 + effectiveTone * 9200 + motion * 3200 + chantFormant * 2600;
svfQ = 0.5 + chantMode * 3.4 + boadiceaRate * 2.2;
svfBlend = clamp01(boadiceaContour * 1.4 + transmuteAmt * 0.7) * 2;
filtered = combed : fi.svf_notch_morph(svfFreq, svfQ, svfBlend);

grainBurst = attuneEnergy * (9.4 + stageCtl * 8.8 + zoomOut * 5.2);
grainRate = 1.6 + chantMotion * 18 + sparkleRate * 10 + invisibleAmt * 12 + transmuteAmt * 6 + ritualPercAmt * 4 + grainBurst;
grainPos = os.lf_sawpos(grainRate);
grainWin = sin(ma.PI * grainPos) ^ 2;
tapA = safeDelay(MAX_DELAY, int(220 + grainPos * 7800 + ritualPercAmt * 1500 + attuneEnergy * 4200 + buildImpact * 1600 + lockCtl * 700), filtered);
tapB = safeDelay(MAX_DELAY, int(840 + (1 - grainPos) * 9300 + ritualDecay * 1700 + attuneEnergy * 4600 + hitExcite * 2000 + zoomOut * 1200), filtered);
grainCloudRaw = tapA * grainWin + tapB * (1 - grainWin);
grainCloud = sat(grainCloudRaw * (1 + attuneEnergy * 0.84 + zoomOut * 0.38 + transmuteAmt * 0.24 + cathedralAmt * 0.18 + hitExcite * 0.34));

shockRate = 5 + buildImpact * 22 + hitExcite * 52 + ritualPulseRate * 4;
shockPos = os.lf_sawpos(shockRate);
shockWin = sin(ma.PI * shockPos) ^ 2;
shockTapL = safeDelay(MAX_DELAY, int(120 + shockPos * 2600 + hitExcite * 5400 + buildImpact * 1900 + zoomOut * 800), filtered + 0.30 * stringsL);
shockTapR = safeDelay(MAX_DELAY, int(180 + (1 - shockPos) * 3100 + hitExcite * 5900 + buildImpact * 1700 + zoomOut * 900), filtered + 0.30 * stringsR);
shockGrainL = sat(shockTapL * shockWin * (0.18 + buildImpact * 0.75 + hitExcite * 1.35));
shockGrainR = sat(shockTapR * (1 - shockWin) * (0.18 + buildImpact * 0.75 + hitExcite * 1.35));
airNoise = hpSimple(no.noise) * (airLevel * (0.35 + 0.65 * os.osc(0.05 + sparkleRate * 0.2)));

transCore = hpSimple((dsfL - dsfR) + 0.5 * filtered + 0.35 * os.osc(f0 * semi(12 + transmuteAmt * 8)));
transRawL = transCore + 0.46 * grainCloud + 0.44 * shockGrainL;
transRawR = (transCore @ 17) + 0.46 * (grainCloud @ 11) + 0.44 * shockGrainR;
revTime = min(MAX_DELAY - 8, int(3400 + ritualPulseRate * 16800 + chantMotion * 4600 + cathedralTime * 4200 + attuneEnergy * 26000 + hitExcite * 21000 + zoomOut * 7400));
revSpread = clamp01(0.30 + transmuteAmt * 0.56 + boadiceaRate * 0.3 + attuneEnergy * 0.44 + hitExcite * 0.25 + zoomOut * 0.16);
revFb = min(0.94, clamp01(0.30 + ritualDecay * 0.46 + percussionDrive * 0.24 + attuneEnergy * 0.38 + hitExcite * 0.26 + cathedralAmt * 0.08));
revMix = clamp01(0.30 + transmuteAmt * 0.62 + ascendAmt * 0.28 + attuneEnergy * 0.54 + hitExcite * 0.3 + cathedralAmt * 0.1);
revPair = transRawL, transRawR : reversedelay_pingpong_mix(revTime, revSpread, revFb, revMix);
transL = revPair : _, !;
transR = revPair : !, _;
transmuteL = transmuteAmt * transL;
transmuteR = transmuteAmt * transR;

repSamples = int(900 + ritualTone * 10 + ritualDecay * ma.SR * 0.09);
repBlend = clamp01(0.16 + ritualPercAmt * 0.56 + attuneEnergy * 0.74 + hitExcite * 0.34 + percussionDrive * 0.24 + zoomOut * 0.12);
stutterSig(x) = mix(repBlend, x, select2(stutterGate, x, safeDelay(MAX_DELAY, repSamples, x)));

baseL = 0.22 * dsfL + 0.25 * stringsL + 0.14 * filtered + 0.19 * grainCloud + 0.13 * shockGrainL + (0.17 + polyAmt * 0.2) * polyL;
baseR = 0.22 * dsfR + 0.25 * stringsR + 0.14 * (filtered @ 7) + 0.19 * (grainCloud @ 9) + 0.13 * shockGrainR + (0.17 + polyAmt * 0.2) * polyR;
warmMix = clamp01(0.34 + materialAmt * 0.18 + attuneBuild * 0.12 - effectiveTone * 0.1);
baseToneL = mix(warmMix, baseL, lpSimple(lpSimple(baseL)));
baseToneR = mix(warmMix, baseR, lpSimple(lpSimple(baseR)));

invisibleL = invisibleAmt * (0.62 * airNoise + 0.38 * hpSimple(grainCloud));
invisibleR = invisibleAmt * (0.62 * (airNoise @ 13) + 0.38 * hpSimple(grainCloud @ 5));
materialL = materialAmt * (0.58 * lpSimple(filtered) + 0.42 * lpSimple(stringsL));
materialR = materialAmt * (0.58 * lpSimple(filtered @ 11) + 0.42 * lpSimple(stringsR));

ascSeed = 0.34 * (baseToneL + baseToneR) + 0.28 * (transL + transR) + 0.18 * (grainCloud + filtered) + 0.20 * (polyL + polyR);
catNorm = clamp01((cathedralTime - 0.8) / 5.2);
ascendL = ascendAmt * cathedralAmt * ((0.34 + 0.3 * catNorm) * (ascSeed @ int(ma.SR * 0.19)) + (0.28 + 0.24 * catNorm) * (ascSeed @ int(ma.SR * 0.31)));
ascendR = ascendAmt * cathedralAmt * ((0.34 + 0.3 * catNorm) * (ascSeed @ int(ma.SR * 0.23)) + (0.28 + 0.24 * catNorm) * (ascSeed @ int(ma.SR * 0.37)));

hitBurst = hitExcite * (0.58 * hpSimple(no.noise) + 0.22 * os.osc(f0 * semi(24 + chantMode * 4)) + 0.20 * (shockGrainL + shockGrainR));
dropSweep = clamp01(attuneEnergy * (1.02 + stageCtl * 0.30));
dropFreq = 34 + dropSweep * (72 + zoomOut * 26) + transmuteAmt * 8;
dropTone = os.osc(dropFreq) + 0.35 * os.osc(dropFreq * 0.5);
dropSub = lpSimple(sat(dropTone * (0.95 + dropSweep * 0.45)));
dropAmp = dropSweep * (0.30 + transmuteAmt * 0.22 + zoomOut * 0.28 + percussionDrive * 0.15);
dropL = dropSub * dropAmp;
dropR = (dropSub @ int(8 + stageCtl * 22)) * dropAmp;
dryL = baseToneL + invisibleL + materialL + transmuteL + ascendL + 0.42 * hitBurst + dropL;
dryR = baseToneR + invisibleR + materialR + transmuteR + ascendR + 0.42 * (hitBurst @ 5) + dropR;

// ═══════════════════════════════════════════════════════════════════════════
// Process: 1 audio input → 2 audio outputs (using Faust's standard 1→2 split)
// Live input gained/filtered and mixed at the dry bus output.
// When inputGain=0, behaves identically to v2.0.
// ALL feedback loops stay at top level — no function with-block needed.
// ═══════════════════════════════════════════════════════════════════════════

stutterL = stutterSig(dryL);
stutterR = stutterSig(dryR);

pML = sat((stutterL * effectiveGain) * 1.9);
pMR = sat((stutterR * effectiveGain) * 1.9);

ph = (pML * 1.25), (pMR * 1.25) : pf.phaser2_stereo(4, 80, 260, 1.65, 5200, phaserRate, phaserDepth, phaserFeedback, 0);
phL = ph : _, !;
phR = ph : !, _;

poL = mix(phaserMix, pML, 0.8 * phL);
poR = mix(phaserMix, pMR, 0.8 * phR);

aAB = (ambiRotate * 2 - 1) * ma.PI + (cameraOrbitY - 0.5) * ma.PI * 1.2;
aEB = (ambiElev * 2 - 1) * 0.72 + (cameraOrbitX - 0.5) * 0.42 + (mobileRotX - 0.5) * 0.35;
aSP = os.osc(0.08 + ambiSpin * 2.6 + objectSpinCtl * 1.4 + stageCtl * 0.7) * ma.PI;
azL = aAB + aSP * 0.62; azR = aAB + ma.PI * 0.52 - aSP * 0.48;
eL = aEB + (zoomIn - zoomOut) * 0.22; eR = (-aEB * 0.7) + (mobileRotY - 0.5) * 0.26;
wL = poL * 0.7071; xL = poL * cos(azL) * cos(eL); yL = poL * sin(azL) * cos(eL); zL = poL * sin(eL);
wR = poR * 0.7071; xR = poR * cos(azR) * cos(eR); yR = poR * sin(azR) * cos(eR); zR = poR * sin(eR);
w = 0.5 * (wL + wR); x = 0.5 * (xL + xR); y = 0.5 * (yL + yR); z = 0.5 * (zL + zR);
xA = x * (0.35 + ambiWidth * 0.95); yA = y * (0.24 + ambiWidth * 1.05); zA = z * (0.22 + ambiDepth * 0.98);
aFG = 0.78 + ambiFocus * 0.58 + proximityCtl * 0.28 + lockCtl * 0.16;
aDL = sat((0.74 * w + 0.68 * xA + 0.42 * yA + 0.36 * zA) * aFG);
aDR = sat((0.74 * w - 0.68 * xA + 0.42 * yA - 0.36 * zA) * aFG);
sBlend = clamp01(ambiAmt);
spatialL = mix(sBlend, poL, aDL);
spatialR = mix(sBlend, poR, aDR);

mastered = spatialL, spatialR : co.compressor_stereo(4.2, -21, 0.007, 0.24) : *(1.9), *(1.9) : sat, sat : *(0.92), *(0.92);

// Extract individual channels from mastered stereo pair
masterL = mastered : _, !;
masterR = mastered : !, _;

// Input processing function: live mic/line gain + gentle bandpass
inputGainFilt(x) = x * inputGain : hpSimple : lpSimple : *(0.25 + inputGain * 0.45);

// 1 audio input → 2 audio outputs via Faust's standard bus split
process = _ <: masterL + inputGainFilt(_), masterR + (inputGainFilt(_) @ 3);
