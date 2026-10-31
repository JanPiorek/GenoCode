import { describe, expect, it } from "vitest";
import { afterPlaying, MOST, songKey, songLabel, type RecentSong } from "./recent.js";

const song = (n: number): RecentSong => ({
  key: `file:song${n}.mp3:100`,
  name: `song${n}.mp3`,
  kind: "file",
  at: n,
});

describe("the recent songs", () => {
  it("puts a song played again at the top, once", () => {
    const list = [song(3), song(2), song(1)];
    const { list: after, dropped } = afterPlaying(list, { ...song(1), at: 9 });
    expect(after.map((s) => s.name)).toEqual(["song1.mp3", "song3.mp3", "song2.mp3"]);
    expect(dropped).toEqual([]);
  });

  it(`keeps at most ${MOST}, dropping the oldest`, () => {
    const list = Array.from({ length: MOST }, (_, i) => song(MOST - i));
    const { list: after, dropped } = afterPlaying(list, song(99));
    expect(after).toHaveLength(MOST);
    expect(after[0]!.name).toBe("song99.mp3");
    expect(dropped.map((s) => s.name)).toEqual(["song1.mp3"]);
  });

  it("knows a file by its name and size, and an address by itself", () => {
    const file = new File(["abc"], "a.mp3");
    expect(songKey(file)).toBe("file:a.mp3:3");
    expect(songKey("https://x.org/a.mp3")).toBe("url:https://x.org/a.mp3");
  });

  it("shows a file's name without its ending, and an address's last part", () => {
    expect(songLabel({ kind: "file", name: "octosound-chill-synthwave.mp3" })).toBe(
      "octosound-chill-synthwave",
    );
    expect(songLabel({ kind: "url", name: "https://x.org/music/My%20Song.ogg?x=1" })).toBe(
      "My Song",
    );
    expect(songLabel({ kind: "url", name: "https://x.org/" })).toBe("https://x.org/");
  });
});
