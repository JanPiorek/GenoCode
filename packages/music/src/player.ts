// Plays music in the browser and listens to it: from a file, a web address or the microphone. The
// sound passes through a small audio worklet that hands every sample to a MusicAnalyser.

import { silence, type MusicInputs } from "@genocode/core";
import { MusicAnalyser } from "./analyser.js";

/** The rate DancerDNA analysed at, so the octaves land where they did. */
const RATE = 44100;

// The worklet passes the sound through unchanged and posts each block of samples to the page.
const WORKLET = `
class Listen extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const l = inputs[0][0];
    const r = inputs[0][1] ?? l;
    if (l) {
      outputs[0].forEach((ch, i) => ch.set(i === 0 ? l : r));
      this.port.postMessage([l.slice(), r.slice()]);
    }
    return true;
  }
}
registerProcessor("genocode-listen", Listen);
`;

export type MusicSource = "file" | "url" | "microphone";

export class MusicPlayer {
  /** The music being listened to, or undefined when there's none. */
  private analyser: MusicAnalyser | undefined;
  private context: AudioContext | undefined;
  private node: AudioWorkletNode | undefined;
  /** The audio element's way into the graph: a browser allows only one, so it's kept. */
  private element: MediaElementAudioSourceNode | undefined;
  private microphone: MediaStreamAudioSourceNode | undefined;
  private stream: MediaStream | undefined;
  readonly audio = new Audio();
  /** What's playing: the file's name, the address, or "Microphone". */
  name = "";
  source: MusicSource | undefined;

  constructor() {
    this.audio.crossOrigin = "anonymous";
    this.audio.loop = true;
  }

  /** Plays a music file. */
  async playFile(file: File): Promise<void> {
    await this.playAddress(URL.createObjectURL(file), file.name, "file");
  }

  /** Plays music from a web address. The site must allow it to be played from other sites. */
  async playUrl(url: string): Promise<void> {
    await this.playAddress(url, url, "url");
  }

  /** Listens to the microphone (the browser asks the user first). */
  async listen(): Promise<void> {
    this.stop();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = await this.connect();
    this.stream = stream;
    this.microphone = ctx.createMediaStreamSource(stream);
    this.microphone.connect(this.node!);
    // The microphone isn't played back, which would howl; the worklet still runs.
    this.node!.disconnect();
    this.node!.connect(silentOutput(ctx));
    this.begin("Microphone", "microphone");
  }

  get paused(): boolean {
    return this.source !== "microphone" && this.audio.paused;
  }

  /** Pauses or carries on playing. The microphone can't be paused, only stopped. */
  async togglePause(): Promise<void> {
    if (this.source === "microphone" || this.source === undefined) return;
    if (this.audio.paused) {
      await this.context?.resume();
      await this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  /** Stops the music and forgets it. */
  stop(): void {
    this.audio.pause();
    if (this.audio.src.startsWith("blob:")) URL.revokeObjectURL(this.audio.src);
    this.audio.removeAttribute("src");
    this.audio.load();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.microphone?.disconnect();
    this.microphone = undefined;
    this.element?.disconnect();
    this.analyser = undefined;
    this.source = undefined;
    this.name = "";
  }

  /** Whether there's music to listen to. */
  get active(): boolean {
    return this.analyser !== undefined;
  }

  /** Beats a minute, once there's a beat to follow. */
  get tempo(): number | undefined {
    return this.analyser?.tempo;
  }

  /** The inputs for building a frame now: silence when there's no music or it's paused. */
  inputs(): { beat: number; music: MusicInputs } {
    if (this.analyser === undefined || this.paused) return { beat: 0, music: silence() };
    return { beat: this.analyser.beat(), music: this.analyser.music };
  }

  private async playAddress(src: string, name: string, source: MusicSource): Promise<void> {
    this.stop();
    const ctx = await this.connect();
    this.element ??= ctx.createMediaElementSource(this.audio);
    this.element.connect(this.node!);
    this.node!.disconnect();
    this.node!.connect(ctx.destination);
    this.audio.src = src;
    this.begin(name, source);
    await this.audio.play();
  }

  private begin(name: string, source: MusicSource): void {
    this.analyser = new MusicAnalyser(this.context!.sampleRate);
    this.name = name;
    this.source = source;
  }

  /** The audio graph, made on first use (browsers only allow it after the user does something). */
  private async connect(): Promise<AudioContext> {
    if (this.context === undefined) {
      const ctx = new AudioContext({ sampleRate: RATE });
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "genocode-listen", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.port.onmessage = (e: MessageEvent<[Float32Array, Float32Array]>) => {
        this.analyser?.push(e.data[0], e.data[1]);
      };
      this.context = ctx;
      this.node = node;
    }
    await this.context.resume();
    return this.context;
  }
}

/** A way out of the graph that makes no sound, so a node is still run. */
function silentOutput(ctx: AudioContext): AudioNode {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  return gain;
}
