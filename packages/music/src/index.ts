// Turns music into the inputs GenoCode creatures read: music.bass, mid, high, level, hit, the
// per-band hits, and beat (docs/LANGUAGE.md section 16).

export { MusicAnalyser, HOP } from "./analyser.js";
export { BeatTracker } from "./beat.js";
export { BLOCK, OCTAVES, octaves, toInt16 } from "./octaves.js";
export { MusicPlayer, type MusicSource } from "./player.js";
