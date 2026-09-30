export interface GameUiUpdate {
  health?: number;
  stamina?: number;
  battery?: number;
  noise?: number;
  room?: string;
  objective?: string;
  item?: string;
  dev?: Record<string, string | number | boolean | null | undefined>;
}

export type UiHandler = () => void;

export class GameUI {
  onStart?: UiHandler;
  onContinue?: UiHandler;
  onSettings?: UiHandler;
  onDevToggle?: UiHandler;
  onUseItem?: UiHandler;
  onDropItem?: UiHandler;
  onLure?: UiHandler;
  onSave?: UiHandler;
  onReset?: UiHandler;

  readonly root: HTMLElement;
  readonly hud: HTMLElement;
  readonly menu: HTMLElement;
  readonly devOverlay: HTMLElement;

  private messageTimer = 0;
  private hasSave = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.classList.add("moura-ui-root");

    this.hud = this.buildHud();
    this.menu = this.buildMenu();
    this.devOverlay = this.buildDevOverlay();
    this.root.append(this.hud, this.menu, this.devOverlay);

    this.bindKeyboard();
    this.showMenu(false);
  }

  showMenu(hasSave = this.hasSave): void {
    this.hasSave = hasSave;
    this.root.classList.add("moura-ui-root--menu");
    this.root.classList.remove("moura-ui-root--hud");
    this.menu.hidden = false;
    this.hud.hidden = true;
    this.setButtonEnabled("continue", hasSave);
    this.focusButton("start");
  }

  showHud(): void {
    this.root.classList.add("moura-ui-root--hud");
    this.root.classList.remove("moura-ui-root--menu");
    this.menu.hidden = true;
    this.hud.hidden = false;
  }

  update(data: GameUiUpdate): void {
    this.setMeter("health", data.health);
    this.setMeter("stamina", data.stamina);
    this.setMeter("battery", data.battery);
    this.setMeter("noise", data.noise);
    this.setText("room", data.room);
    this.setText("objective", data.objective);
    this.setText("item", data.item ?? "Empty");

    if (data.noise !== undefined) {
      const noiseLevel = clamp01(data.noise);
      this.hud.dataset.noise = noiseLevel > 0.72 ? "danger" : noiseLevel > 0.42 ? "heard" : "quiet";
    }

    if (data.dev) {
      this.renderDev(data.dev);
    }
  }

  pushMessage(text: string, ttlMs = 2600): void {
    const message = this.query("message");
    window.clearTimeout(this.messageTimer);
    message.textContent = text;
    message.hidden = text.length === 0;

    if (text && ttlMs > 0) {
      this.messageTimer = window.setTimeout(() => {
        message.textContent = "";
        message.hidden = true;
      }, ttlMs);
    }
  }

  setDevVisible(visible: boolean): void {
    this.devOverlay.hidden = !visible;
    this.root.classList.toggle("moura-ui-root--dev", visible);
  }

  destroy(): void {
    window.clearTimeout(this.messageTimer);
    this.root.replaceChildren();
  }

  private buildHud(): HTMLElement {
    const hud = el("section", "moura-hud");
    hud.setAttribute("aria-live", "polite");
    hud.hidden = true;

    const vitals = el("div", "moura-hud__vitals");
    vitals.append(this.meter("health", "Health"), this.meter("stamina", "Stamina"), this.meter("battery", "Battery"));

    const center = el("div", "moura-hud__center");
    center.append(el("strong", "moura-hud__room", "St. Moura Hospital"), el("span", "moura-hud__objective", "Find a way out"));

    const inventory = el("div", "moura-hud__inventory");
    inventory.append(el("span", "moura-hud__item-label", "Item"), el("strong", "moura-hud__item", "Empty"));

    const actions = el("div", "moura-hud__actions");
    actions.append(
      this.actionButton("Use", "use", () => this.onUseItem?.()),
      this.actionButton("Drop", "drop", () => this.onDropItem?.()),
      this.actionButton("Lure", "lure", () => this.onLure?.()),
      this.actionButton("Save", "save", () => this.onSave?.()),
    );

    const noise = this.meter("noise", "Noise");
    const message = el("div", "moura-hud__message");
    message.hidden = true;

    hud.append(vitals, center, inventory, actions, noise, message);
    return hud;
  }

  private buildMenu(): HTMLElement {
    const menu = el("section", "moura-menu");
    const panel = el("div", "moura-menu__panel");
    panel.append(
      el("h1", "moura-menu__title", "St. Moura Hospital"),
      el("p", "moura-menu__subtitle", "Listen carefully. Stay quieter than whatever is listening back."),
      this.menuButton("Start", "start", () => this.onStart?.()),
      this.menuButton("Continue", "continue", () => this.onContinue?.()),
      this.menuButton("Settings", "settings", () => this.onSettings?.()),
      this.menuButton("Reset", "reset", () => this.onReset?.()),
    );
    menu.append(panel);
    return menu;
  }

  private buildDevOverlay(): HTMLElement {
    const overlay = el("aside", "moura-dev-overlay");
    overlay.hidden = true;
    return overlay;
  }

  private bindKeyboard(): void {
    window.addEventListener("keydown", (event) => {
      if (event.repeat) {
        return;
      }

      if (event.key === "`") {
        this.onDevToggle?.();
        return;
      }
      if (event.key.toLowerCase() === "e") {
        this.onUseItem?.();
        return;
      }
      if (event.key.toLowerCase() === "q") {
        this.onDropItem?.();
        return;
      }
      if (event.key.toLowerCase() === "f") {
        this.onLure?.();
      }
    });
  }

  private meter(name: string, label: string): HTMLElement {
    const root = el("div", `moura-meter moura-meter--${name}`);
    root.dataset.ui = `${name}-meter`;
    root.append(
      el("span", "moura-meter__label", label),
      child("span", "moura-meter__track", child("span", "moura-meter__bar")),
    );
    return root;
  }

  private menuButton(label: string, action: string, handler: UiHandler): HTMLButtonElement {
    return this.button(label, `moura-menu__button moura-menu__button--${action}`, action, handler);
  }

  private actionButton(label: string, action: string, handler: UiHandler): HTMLButtonElement {
    return this.button(label, `moura-hud__button moura-hud__button--${action}`, action, handler);
  }

  private button(label: string, className: string, action: string, handler: UiHandler): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.action = action;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  private setMeter(name: string, value: number | undefined): void {
    if (value === undefined) {
      return;
    }

    const meter = this.root.querySelector<HTMLElement>(`[data-ui="${name}-meter"]`);
    const bar = meter?.querySelector<HTMLElement>(".moura-meter__bar");
    const percent = clamp01(value);
    if (bar) {
      bar.style.transform = `scaleX(${percent})`;
    }
    meter?.setAttribute("aria-label", `${name}: ${Math.round(percent * 100)} percent`);
  }

  private setText(name: string, value: string | undefined): void {
    if (value === undefined) {
      return;
    }
    this.query(name).textContent = value;
  }

  private setButtonEnabled(action: string, enabled: boolean): void {
    const button = this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
    if (button) {
      button.disabled = !enabled;
      button.setAttribute("aria-disabled", String(!enabled));
    }
  }

  private focusButton(action: string): void {
    window.setTimeout(() => this.root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.focus(), 0);
  }

  private renderDev(lines: NonNullable<GameUiUpdate["dev"]>): void {
    this.devOverlay.replaceChildren(
      ...Object.entries(lines).map(([key, value]) => {
        const row = el("div", "moura-dev-overlay__row");
        row.append(el("span", "moura-dev-overlay__key", key), el("span", "moura-dev-overlay__value", formatValue(value)));
        return row;
      }),
    );
  }

  private query(name: string): HTMLElement {
    const node = this.root.querySelector<HTMLElement>(`.moura-hud__${name}`);
    if (!node) {
      throw new Error(`Missing UI node: ${name}`);
    }
    return node;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function child<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className: string,
  nested?: Node,
): HTMLElementTagNameMap[K] {
  const node = el(tagName, className);
  if (nested) {
    node.append(nested);
  }
  return node;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function formatValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return typeof value === "number" && !Number.isInteger(value) ? value.toFixed(3) : String(value);
}

