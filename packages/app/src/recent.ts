// The songs danced to lately, so they can be played again from the Music menu without looking for
// them. A browser can't open a file again by its path, so a file is kept as a copy in the browser's
// own storage (IndexedDB), on this computer only. A web address is kept as the address.

/** A song in the list: a file, kept whole, or a web address. */
export interface RecentSong {
  /** What makes it the same song when it's played again: a file's name and size, or the address. */
  key: string;
  /** The file's name, or the address. */
  name: string;
  kind: "file" | "url";
  /** The file itself, for a file. */
  file?: Blob;
  /** When it was last played, in milliseconds since 1970. */
  at: number;
}

/** How many songs the list keeps. */
export const MOST = 6;

/** Files bigger than this are played but not kept: the browser's storage is for small things. */
export const BIGGEST = 100 * 1024 * 1024;

/** The key of a file or an address. */
export function songKey(song: File | string): string {
  return typeof song === "string" ? `url:${song}` : `file:${song.name}:${song.size}`;
}

/** How a song is shown in the list: a file's name without its ending, an address's last part. */
export function songLabel(song: Pick<RecentSong, "kind" | "name">): string {
  if (song.kind === "file") return song.name.replace(/\.[a-z0-9]{1,5}$/i, "");
  try {
    const last = new URL(song.name).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).replace(/\.[a-z0-9]{1,5}$/i, "") : song.name;
  } catch {
    return song.name;
  }
}

/** The list after `song` is played: it at the top, not also further down, and at most MOST songs. */
export function afterPlaying(
  list: readonly RecentSong[],
  song: RecentSong,
): { list: RecentSong[]; dropped: RecentSong[] } {
  const rest = list.filter((s) => s.key !== song.key);
  return { list: [song, ...rest].slice(0, MOST), dropped: rest.slice(MOST - 1) };
}

const DB = "genocode-music";
const STORE = "recent";

/** Runs a request and gives its result. */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The browser's storage failed."));
  });
}

/**
 * The recent songs, newest first. `songs` is always ready to show; the storage behind it may be
 * missing (a private window, storage turned off), and then the list lasts only while the page is open.
 */
export class RecentSongs {
  songs: RecentSong[] = [];
  private db: Promise<IDBDatabase | undefined>;

  constructor() {
    this.db = new Promise<IDBDatabase | undefined>((resolve) => {
      try {
        const open = indexedDB.open(DB, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "key" });
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => resolve(undefined);
        open.onblocked = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  /** Reads the list from storage. */
  async load(): Promise<void> {
    const db = await this.db;
    if (!db) return;
    try {
      const all = await done(db.transaction(STORE).objectStore(STORE).getAll());
      this.songs = (all as RecentSong[]).sort((a, b) => b.at - a.at).slice(0, MOST);
    } catch {
      // Nothing to show, then.
    }
  }

  /** Puts a file or address that has just started playing at the top of the list. */
  async played(song: File | string): Promise<void> {
    if (typeof song !== "string" && song.size > BIGGEST) return;
    const entry: RecentSong =
      typeof song === "string"
        ? { key: songKey(song), name: song, kind: "url", at: Date.now() }
        : { key: songKey(song), name: song.name, kind: "file", file: song, at: Date.now() };
    const { list, dropped } = afterPlaying(this.songs, entry);
    this.songs = list;
    await this.write((store) => {
      store.put(entry);
      for (const d of dropped) store.delete(d.key);
    });
  }

  /** Takes a song off the list, and its copy out of storage. */
  async forget(key: string): Promise<void> {
    this.songs = this.songs.filter((s) => s.key !== key);
    await this.write((store) => store.delete(key));
  }

  private async write(change: (store: IDBObjectStore) => void): Promise<void> {
    const db = await this.db;
    if (!db) return;
    try {
      const t = db.transaction(STORE, "readwrite");
      change(t.objectStore(STORE));
      await new Promise<void>((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error("The browser's storage failed."));
        t.onabort = () => reject(t.error ?? new Error("The browser's storage is full."));
      });
    } catch {
      // Kept for this visit only, then.
    }
  }
}
