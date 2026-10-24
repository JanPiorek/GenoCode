// The app's frame: the code and blocks dock on the left, the gene panel on the right, the menus that
// drop down from buttons and, on a phone, the sheet that slides up from the bottom with the mode's
// tools, the genes, the code and the blocks. It only shows and hides; main.ts does the work.

export type Mode = "view" | "breed" | "morph" | "dance" | "patterns" | "library";
/** What the dock shows on a wide screen. */
export type DockView = "code" | "blocks" | "both";
/** What the sheet shows under the mode's tools on a phone, in View. */
export type SheetTab = "genes" | "code" | "blocks";

/** The sheet's heights on a phone: just the tools, about half the screen, nearly all of it. */
const SHEET_STATES = ["peek", "half", "full"] as const;
type SheetState = (typeof SHEET_STATES)[number];

/** Modes whose tools go in the bar over the creature (and in the phone's sheet). */
const TOOL_MODES: readonly Mode[] = ["view", "breed", "morph", "dance"];
/** Modes that show the gene panel beside the creature. */
const PANEL_MODES: readonly Mode[] = ["view", "breed", "morph"];

const DOCK_MIN = 340;
const DOCK_MAX = 900;

function remembered(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered, then.
  }
}

// ---------- menus ----------

let openMenu: { button: HTMLElement; menu: HTMLElement } | undefined;

function closeMenu(focusButton = false): void {
  if (!openMenu) return;
  const { button, menu } = openMenu;
  openMenu = undefined;
  menu.hidden = true;
  button.setAttribute("aria-expanded", "false");
  if (focusButton) button.focus();
}

document.addEventListener("pointerdown", (e) => {
  if (!openMenu) return;
  const target = e.target as Node;
  if (!openMenu.menu.contains(target) && !openMenu.button.contains(target)) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openMenu) {
    e.stopPropagation();
    closeMenu(true);
  }
});

/**
 * Makes `button` open and close `menu`. Choosing one of the menu's items closes it. `onOpen` runs
 * first, to fill the menu.
 */
export function dropdown(button: HTMLElement, menu: HTMLElement, onOpen?: () => void): void {
  button.addEventListener("click", () => {
    if (openMenu?.menu === menu) {
      closeMenu();
      return;
    }
    closeMenu();
    onOpen?.();
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    openMenu = { button, menu };
    menu.querySelector<HTMLElement>("button:not(:disabled), a, [tabindex]")?.focus();
  });
  menu.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest("[role=menuitem], .picks");
    if (item && menu.contains(item)) closeMenu();
  });
}

// ---------- the frame ----------

export interface ShellEvents {
  /** What's shown changed: main.ts shows or hides the code and blocks to match. */
  changed(): void;
  /** The Code button was pressed outside View, which shows the code. */
  wantView(): void;
}

export class Shell {
  /** A phone-sized screen, where the panes go in the sheet. */
  readonly narrow = matchMedia("(max-width: 760px)");
  private mode: Mode = "view";
  private dockOpen = remembered("genocode.dock") !== "closed";
  private dockView: DockView = (remembered("genocode.dockView") as DockView | null) ?? "code";
  private panelOpen = remembered("genocode.panel") !== "closed";
  private sheetTab: SheetTab = "genes";
  private sheet: SheetState = "peek";

  constructor(
    private readonly app: HTMLElement,
    private readonly events: ShellEvents,
  ) {
    if (!["code", "blocks", "both"].includes(this.dockView)) this.dockView = "code";
    const width = Number(remembered("genocode.dockWidth"));
    if (width >= DOCK_MIN && width <= DOCK_MAX) app.style.setProperty("--dock-w", `${width}px`);

    $("code-toggle").addEventListener("click", () => {
      if (this.mode !== "view") {
        this.dockOpen = true;
        this.sheetTab = "code";
        this.events.wantView();
        return;
      }
      this.setDock(!this.dockOpen);
    });
    $("dock-close").addEventListener("click", () => this.setDock(false));
    for (const b of app.querySelectorAll<HTMLButtonElement>("[data-dock]")) {
      b.addEventListener("click", () => {
        this.dockView = b.dataset["dock"] as DockView;
        remember("genocode.dockView", this.dockView);
        this.apply();
      });
    }
    $("panel-toggle").addEventListener("click", () => {
      this.panelOpen = !this.panelOpen;
      remember("genocode.panel", this.panelOpen ? "open" : "closed");
      this.apply();
    });
    for (const b of app.querySelectorAll<HTMLButtonElement>("[data-sheet]")) {
      b.addEventListener("click", () => {
        this.sheetTab = b.dataset["sheet"] as SheetTab;
        // Choosing what to see while the sheet is down brings it up to show it.
        if (this.sheet === "peek") this.sheet = "half";
        this.apply();
      });
    }
    this.dragSheet();
    this.dragDock();
    this.narrow.addEventListener("change", () => this.apply());
    // On a phone the creature's picture ends where the sheet begins, so it isn't hidden behind it.
    const sheet = $("sheet");
    new ResizeObserver(() => {
      const cover = this.narrow.matches && !sheet.hidden ? sheet.offsetHeight : 0;
      app.style.setProperty("--sheet-cover", `${cover}px`);
    }).observe(sheet);
    // Nothing is told yet: main.ts is still being set up, and shows the panes with its first mode.
    this.apply(false);
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    this.apply();
  }

  /** Whether the code editor is on show. */
  get codeShown(): boolean {
    if (this.mode !== "view") return false;
    if (this.narrow.matches) return this.sheetTab === "code";
    return this.dockOpen && this.dockView !== "blocks";
  }

  /** Whether the blocks are on show. */
  get blocksShown(): boolean {
    if (this.mode !== "view") return false;
    if (this.narrow.matches) return this.sheetTab === "blocks";
    return this.dockOpen && this.dockView !== "code";
  }

  private setDock(open: boolean): void {
    this.dockOpen = open;
    remember("genocode.dock", open ? "open" : "closed");
    this.apply();
  }

  private apply(notify = true): void {
    const app = this.app;
    const narrow = this.narrow.matches;
    for (const m of ["view", "breed", "morph", "dance", "patterns", "library"]) {
      app.classList.toggle(`mode-${m}`, m === this.mode);
    }
    const dock = this.mode === "view" && (narrow ? this.sheetTab !== "genes" : this.dockOpen);
    app.classList.toggle("dock-open", dock);
    app.classList.toggle("dock-both", !narrow && this.dockView === "both");
    app.classList.toggle(
      "panel-open",
      PANEL_MODES.includes(this.mode) && (narrow ? this.sheetTab === "genes" : this.panelOpen),
    );
    const tools = TOOL_MODES.includes(this.mode);
    $("sheet").classList.toggle("no-tools", !tools);
    $("modebar").hidden = !tools;
    for (const s of SHEET_STATES) app.classList.toggle(`sheet-${s}`, s === this.sheet);
    for (const t of ["genes", "code", "blocks"])
      app.classList.toggle(`tab-${t}`, t === this.sheetTab);
    $("sheet-handle").setAttribute(
      "aria-label",
      this.sheet === "full" ? "Show less" : this.sheet === "half" ? "Show all" : "Show more",
    );

    $("code-toggle").setAttribute("aria-pressed", String(this.mode === "view" && this.dockOpen));
    $("panel-toggle").setAttribute("aria-pressed", String(this.panelOpen));
    ($("panel-toggle") as HTMLButtonElement).disabled = !PANEL_MODES.includes(this.mode);
    for (const b of app.querySelectorAll<HTMLButtonElement>("[data-dock]")) {
      b.setAttribute("aria-pressed", String(b.dataset["dock"] === this.dockView));
    }
    for (const b of app.querySelectorAll<HTMLButtonElement>("[data-sheet]")) {
      b.setAttribute("aria-pressed", String(b.dataset["sheet"] === this.sheetTab));
    }
    if (notify) this.events.changed();
  }

  /** The sheet's handle: tap it to go a step up (and from the top, back down), or drag it. */
  private dragSheet(): void {
    const handle = $("sheet-handle");
    const sheet = $("sheet");
    let start: { y: number; height: number; moved: boolean } | undefined;
    const bodyHeight = () =>
      [...sheet.querySelectorAll<HTMLElement>(".dock, .panel")]
        .filter((e) => e.offsetParent !== null)
        .reduce((h, e) => Math.max(h, e.offsetHeight), 0);
    handle.addEventListener("pointerdown", (e) => {
      start = { y: e.clientY, height: bodyHeight(), moved: false };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dy = start.y - e.clientY;
      if (Math.abs(dy) > 6) start.moved = true;
      if (!start.moved) return;
      this.app.classList.add("sheet-dragging");
      this.app.style.setProperty("--sheet-body", `${Math.max(0, start.height + dy)}px`);
    });
    const end = (e: PointerEvent) => {
      if (!start) return;
      const { moved, height, y } = start;
      start = undefined;
      this.app.classList.remove("sheet-dragging");
      this.app.style.removeProperty("--sheet-body");
      if (!moved) {
        const at = SHEET_STATES.indexOf(this.sheet);
        this.sheet = at === SHEET_STATES.length - 1 ? "peek" : SHEET_STATES[at + 1]!;
      } else {
        // Settle at the nearest height: none, half the screen, or all of it.
        const h = height + (y - e.clientY);
        const half = innerHeight * 0.42;
        const full = innerHeight - 200;
        const nearest = [0, half, full].reduce((a, b) =>
          Math.abs(b - h) < Math.abs(a - h) ? b : a,
        );
        this.sheet = nearest === 0 ? "peek" : nearest === half ? "half" : "full";
      }
      // A tab other than the genes needs a sheet that's up to be seen.
      this.apply();
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  /** The dock's right edge: drag it to make the code wider or narrower. */
  private dragDock(): void {
    const grip = $("dock-resize");
    const dock = $("dock");
    let start: { x: number; width: number } | undefined;
    grip.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, width: dock.offsetWidth };
      grip.setPointerCapture(e.pointerId);
      this.app.classList.add("dock-dragging");
    });
    grip.addEventListener("pointermove", (e) => {
      if (!start) return;
      const width = Math.min(DOCK_MAX, Math.max(DOCK_MIN, start.width + e.clientX - start.x));
      this.app.style.setProperty("--dock-w", `${width}px`);
    });
    const end = () => {
      if (!start) return;
      start = undefined;
      this.app.classList.remove("dock-dragging");
      remember("genocode.dockWidth", String(dock.offsetWidth));
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  }
}

const $ = (id: string) => document.getElementById(id)!;
