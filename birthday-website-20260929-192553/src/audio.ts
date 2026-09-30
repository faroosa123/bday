export type MonsterAudioState = "idle" | "searching" | "chasing" | "stunned" | "hidden";

export interface AudioSettings {
  masterVolume: number;
  volume: number;
  effectsVolume: number;
  ambienceVolume: number;
  monsterVolume: number;
  micSensitivity: number;
  flashlightBrightness: number;
  quality: "low" | "medium" | "high";
  micEnabled: boolean;
  muted: boolean;
}

export type GameSettings = AudioSettings;

export interface AudioUpdateState {
  paused?: boolean;
  danger?: number;
  alert?: "green" | "yellow" | "red";
  monsterDistance?: number;
  flashlight?: boolean;
  floor?: string;
  player?: { x: number; y: number };
  monster?: { x: number; y: number; distance?: number; state?: MonsterAudioState };
}

export const SETTINGS_KEY = "st-moura.audio";

export const DEFAULT_SETTINGS: AudioSettings = {
  masterVolume: 0.85,
  volume: 0.85,
  effectsVolume: 0.82,
  ambienceVolume: 0.4,
  monsterVolume: 0.76,
  micSensitivity: 1,
  flashlightBrightness: 1,
  quality: "high",
  micEnabled: false,
  muted: false,
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export function loadSettings(keyOrStorage: string | Storage | null = SETTINGS_KEY): GameSettings {
  const storage = typeof keyOrStorage === "string" ? getStorage() : keyOrStorage;
  const key = typeof keyOrStorage === "string" ? keyOrStorage : SETTINGS_KEY;
  if (!storage) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const raw = storage.getItem(key);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  keyOrSettings: string | Partial<GameSettings>,
  settingsOrStorage: Partial<GameSettings> | Storage | null = getStorage(),
): GameSettings {
  const key = typeof keyOrSettings === "string" ? keyOrSettings : SETTINGS_KEY;
  const storage =
    typeof keyOrSettings === "string"
      ? getStorage()
      : settingsOrStorage && "getItem" in settingsOrStorage
        ? settingsOrStorage
        : getStorage();
  const settings = typeof keyOrSettings === "string" ? (settingsOrStorage as Partial<GameSettings>) : keyOrSettings;
  const next = normalizeSettings(settings);
  if (storage) {
    storage.setItem(key, JSON.stringify(next));
  }
  return next;
}

export function mapNoiseLevel(rms: number, sensitivity = 1): number {
  const floor = 0.012;
  const ceiling = 0.2;
  const scaled = (Math.max(0, rms - floor) * clamp(sensitivity, 0.2, 3)) / (ceiling - floor);
  return Math.round(clamp(scaled) * 100);
}

export class GameAudio {
  private context: AudioContext;
  private master: GainNode;
  private effects: GainNode;
  private ambience: GainNode;
  private monster: GainNode;
  private monsterPanner: PannerNode;
  private settings: GameSettings;
  private ambienceOscillators: OscillatorNode[] = [];
  private pulseTimer = 0;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micSamples: Float32Array<ArrayBuffer> | null = null;
  private micRms = 0;
  private smoothedMicRms = 0;

  constructor(settings: Partial<GameSettings> = {}) {
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("Web Audio is not available in this browser.");
    }

    this.context = new AudioContextCtor();
    this.master = this.context.createGain();
    this.effects = this.context.createGain();
    this.ambience = this.context.createGain();
    this.monster = this.context.createGain();
    this.monsterPanner = this.createPanner();
    this.settings = normalizeSettings({ ...loadSettings(), ...settings });

    this.effects.connect(this.master);
    this.ambience.connect(this.master);
    this.monster.connect(this.monsterPanner);
    this.monsterPanner.connect(this.master);
    this.master.connect(this.context.destination);
    this.applySettings();
    this.startAmbience();
  }

  async initMic(): Promise<void> {
    if (this.micStream) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not available in this browser.");
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
      },
    });
    this.micAnalyser = this.context.createAnalyser();
    this.micAnalyser.fftSize = 1024;
    this.micAnalyser.smoothingTimeConstant = 0;
    this.micSamples = new Float32Array(
      new ArrayBuffer(this.micAnalyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
    );
    this.micSource = this.context.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.micAnalyser);
    this.settings = saveSettings({ ...this.settings, micEnabled: true });
  }

  async resume(): Promise<void> {
    if (this.context.state !== "running") {
      await this.context.resume();
    }
  }

  update(dt: number, state: AudioUpdateState = {}): void {
    this.sampleMic();

    const alertDanger = state.alert === "red" ? 0.94 : state.alert === "yellow" ? 0.48 : state.alert === "green" ? 0.08 : undefined;
    const distanceDanger = state.monsterDistance === undefined ? undefined : 1 - clamp(state.monsterDistance / 18);
    const danger = clamp(state.danger ?? alertDanger ?? distanceDanger ?? this.monsterDangerFromState(state.monster));
    const pausedFactor = state.paused ? 0.35 : 1;
    this.setGain(this.ambience, this.settings.ambienceVolume * (0.65 + danger * 0.45) * pausedFactor, 0.12);
    this.setGain(this.monster, this.settings.monsterVolume * pausedFactor, 0.08);

    if (state.player) {
      this.setListenerPosition(state.player.x, state.player.y);
    }
    if (state.monster) {
      this.setMonsterPosition(state.monster.x, state.monster.y);
    }

    this.pulseTimer -= Math.max(0, dt);
    if (danger > 0.72 && this.pulseTimer <= 0) {
      this.playThump(54 + danger * 24, 0.12 + danger * 0.08, 0.18, this.monster);
      this.pulseTimer = Math.max(0.34, 1.05 - danger * 0.55);
    }
  }

  emitDoor(quiet = false): void {
    this.playThump(quiet ? 58 : 92, quiet ? 0.08 : 0.2, 0.22, this.effects);
    this.playNoiseBurst(quiet ? 0.035 : 0.12, quiet ? 0.1 : 0.18, 850, this.effects);
  }

  emitDrop(): void {
    this.playThump(74, 0.18, 0.18, this.effects);
    this.playNoiseBurst(0.08, 0.08, 1200, this.effects);
  }

  emitPickup(): void {
    this.playTone(520, 0.08, 0.04, 0.12, "sine", this.effects);
    this.playTone(760, 0.06, 0.02, 0.14, "triangle", this.effects, 0.07);
  }

  emitMonster(distance = 1, state: MonsterAudioState | string = "searching"): void {
    const normalized = String(state).toLowerCase();
    const proximity = 1 - clamp(distance / 14);
    const stateBoost = normalized === "chase" || normalized === "chasing" ? 0.24 : normalized === "search" || normalized === "searching" ? 0.12 : 0;
    const volume = clamp(0.12 + proximity * 0.34 + stateBoost, 0, 0.62);
    this.playTone(38 + proximity * 18, volume, 0.08, 0.55, "sawtooth", this.monster);
    this.playNoiseBurst(volume * 0.35, 0.38, 320, this.monster);
  }

  playLure(): void {
    const notes = [440, 554, 659, 554, 440];
    notes.forEach((note, index) => {
      this.playTone(note, 0.07, 0.015, 0.17, "sine", this.effects, index * 0.13);
    });
  }

  setMasterVolume(v: number): void {
    this.settings = saveSettings({ ...this.settings, masterVolume: clamp(v), volume: clamp(v), muted: false });
    this.applySettings();
  }

  getMicNoise(): number {
    return mapNoiseLevel(this.smoothedMicRms, this.settings.micSensitivity);
  }

  dispose(): void {
    this.ambienceOscillators.forEach((oscillator) => {
      oscillator.stop();
      oscillator.disconnect();
    });
    this.ambienceOscillators = [];
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.master.disconnect();
    this.effects.disconnect();
    this.ambience.disconnect();
    this.monster.disconnect();
    this.monsterPanner.disconnect();
    void this.context.close();
  }

  private applySettings(): void {
    const mute = this.settings.muted ? 0 : 1;
    this.setGain(this.master, (this.settings.volume ?? this.settings.masterVolume) * mute, 0.05);
    this.setGain(this.effects, this.settings.effectsVolume, 0.03);
    this.setGain(this.ambience, this.settings.ambienceVolume, 0.08);
    this.setGain(this.monster, this.settings.monsterVolume, 0.06);
  }

  private startAmbience(): void {
    if (this.ambienceOscillators.length > 0) {
      return;
    }

    this.addAmbienceOscillator(41, "sine", 0.16);
    this.addAmbienceOscillator(86, "triangle", 0.055);
    this.addAmbienceOscillator(132, "sawtooth", 0.016);
  }

  private addAmbienceOscillator(frequency: number, type: OscillatorType, gainValue: number): void {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = gainValue;
    oscillator.connect(gain);
    gain.connect(this.ambience);
    oscillator.start();
    this.ambienceOscillators.push(oscillator);
  }

  private sampleMic(): void {
    if (!this.micAnalyser || !this.micSamples) {
      this.micRms = 0;
      this.smoothedMicRms *= 0.92;
      return;
    }

    this.micAnalyser.getFloatTimeDomainData(this.micSamples);
    let sum = 0;
    for (const sample of this.micSamples) {
      sum += sample * sample;
    }
    this.micRms = Math.sqrt(sum / this.micSamples.length);
    this.smoothedMicRms = this.smoothedMicRms * 0.76 + this.micRms * 0.24;
  }

  private monsterDangerFromState(monster?: AudioUpdateState["monster"]): number {
    if (!monster) {
      return 0;
    }

    const distance = monster.distance ?? 12;
    const proximity = 1 - clamp(distance / 16);
    const stateBoost = monster.state === "chasing" ? 0.3 : monster.state === "searching" ? 0.12 : 0;
    return clamp(proximity + stateBoost);
  }

  private setListenerPosition(x: number, y: number): void {
    const listener = this.context.listener;
    if ("positionX" in listener) {
      listener.positionX.value = x;
      listener.positionY.value = 0;
      listener.positionZ.value = y;
    } else {
      (listener as AudioListener & { setPosition(x: number, y: number, z: number): void }).setPosition(x, 0, y);
    }
  }

  private setMonsterPosition(x: number, y: number): void {
    if ("positionX" in this.monsterPanner) {
      this.monsterPanner.positionX.value = x;
      this.monsterPanner.positionY.value = 0;
      this.monsterPanner.positionZ.value = y;
    } else {
      (this.monsterPanner as PannerNode & { setPosition(x: number, y: number, z: number): void }).setPosition(x, 0, y);
    }
  }

  private createPanner(): PannerNode {
    const panner = this.context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "exponential";
    panner.refDistance = 1.4;
    panner.maxDistance = 30;
    panner.rolloffFactor = 2.2;
    return panner;
  }

  private playTone(
    frequency: number,
    volume: number,
    attack: number,
    release: number,
    type: OscillatorType,
    destination: AudioNode,
    delay = 0,
  ): void {
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(clamp(volume), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + attack + release + 0.04);
  }

  private playThump(frequency: number, volume: number, release: number, destination: AudioNode): void {
    const start = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, frequency * 0.46), start + release);
    gain.gain.setValueAtTime(clamp(volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + release);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + release + 0.04);
  }

  private playNoiseBurst(volume: number, duration: number, filterFrequency: number, destination: AudioNode): void {
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const start = this.context.currentTime;
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = filterFrequency;
    gain.gain.setValueAtTime(clamp(volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(start);
  }

  private setGain(node: GainNode, value: number, rampSeconds: number): void {
    const now = this.context.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(clamp(value), now, rampSeconds);
  }
}

function normalizeSettings(settings: Partial<GameSettings>): GameSettings {
  const volume = clamp(settings.volume ?? settings.masterVolume ?? DEFAULT_SETTINGS.volume);
  return {
    masterVolume: volume,
    volume,
    effectsVolume: clamp(settings.effectsVolume ?? DEFAULT_SETTINGS.effectsVolume),
    ambienceVolume: clamp(settings.ambienceVolume ?? DEFAULT_SETTINGS.ambienceVolume),
    monsterVolume: clamp(settings.monsterVolume ?? DEFAULT_SETTINGS.monsterVolume),
    micSensitivity: clamp(settings.micSensitivity ?? DEFAULT_SETTINGS.micSensitivity, 0.2, 3),
    flashlightBrightness: clamp(settings.flashlightBrightness ?? DEFAULT_SETTINGS.flashlightBrightness, 0.4, 1.8),
    quality: settings.quality === "low" || settings.quality === "medium" || settings.quality === "high" ? settings.quality : DEFAULT_SETTINGS.quality,
    micEnabled: Boolean(settings.micEnabled ?? DEFAULT_SETTINGS.micEnabled),
    muted: Boolean(settings.muted ?? DEFAULT_SETTINGS.muted),
  };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
