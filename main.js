const { MarkdownView, Notice, Plugin } = require("obsidian");
const { Decoration, EditorView, ViewPlugin } = require("@codemirror/view");

const BODY_CLASS = "zen-mode-active";
const THEME_CLASS_PREFIX = "zen-theme-";
const TARGET_VIEW_CLASS = "zen-target-view";
const TARGET_LEAF_CLASS = "zen-target-leaf";
const TARGET_TABS_CLASS = "zen-target-tabs";
const CURRENT_LINE_CLASS = "zen-current-line";
const ROLE_DROPDOWN_SELECTOR = ".rsp-role-dropdown";

const DEFAULT_SETTINGS = {
  theme: "light",
};

const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "green", label: "Green" },
];

const activeLineDecoration = Decoration.line({ class: CURRENT_LINE_CLASS });

function isZenActive() {
  return document.body.classList.contains(BODY_CLASS);
}

function buildActiveLineDecorations(view) {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return Decoration.set([activeLineDecoration.range(line.from)], true);
}

function centerActiveLine(view) {
  if (!view || !isZenActive()) return;

  try {
    const head = view.state.selection.main.head;
    view.dispatch({
      effects: EditorView.scrollIntoView(head, {
        x: "nearest",
        y: "center",
        yMargin: 0,
      }),
    });
  } catch (error) {
    console.warn("zen-mode: unable to center the active line", error);
  }
}

function scheduleCenterActiveLine(view, pendingFrames) {
  if (!view || !isZenActive()) return;

  const pendingFrame = pendingFrames.get(view);
  if (pendingFrame) window.cancelAnimationFrame(pendingFrame);

  const frame = window.requestAnimationFrame(() => {
    pendingFrames.delete(view);
    centerActiveLine(view);
  });
  pendingFrames.set(view, frame);
}

function makeActiveLinePlugin(pendingFrames) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildActiveLineDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildActiveLineDecorations(update.view);
      }

      if (isZenActive() && (update.selectionSet || update.focusChanged)) {
        scheduleCenterActiveLine(update.view, pendingFrames);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations,
  });
}

module.exports = class FocusZenModePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!THEMES.some((theme) => theme.id === this.settings.theme)) {
      this.settings.theme = DEFAULT_SETTINGS.theme;
    }

    this.isActive = false;
    this.targetViewEl = null;
    this.targetLeafEl = null;
    this.targetTabsEl = null;
    this.menuZoneEl = null;
    this.themeButtons = new Map();
    this.pendingCenterFrames = new WeakMap();

    document.body.classList.remove(BODY_CLASS);
    this.applyThemeClass();
    this.createThemeMenu();

    this.ribbonIconEl = this.addRibbonIcon("focus", "Focus Zen Mode", () => {
      this.toggleZenMode();
    });
    this.ribbonIconEl?.classList.add("zen-ribbon-button");

    this.addCommand({
      id: "toggle-zen-mode",
      name: "Toggle zen mode",
      callback: () => this.toggleZenMode(),
    });

    this.addCommand({
      id: "enter-zen-mode",
      name: "Enter zen mode",
      callback: () => this.enableZenMode(),
    });

    this.addCommand({
      id: "exit-zen-mode",
      name: "Exit zen mode",
      callback: () => this.disableZenMode(),
    });

    this.registerEditorExtension([makeActiveLinePlugin(this.pendingCenterFrames)]);

    this.registerDomEvent(document, "keydown", (event) => {
      this.handleKeydown(event);
    }, { capture: true });

    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      if (!this.isActive) return;

      const view = this.getEditableMarkdownView();
      if (!view) return;

      this.setTargetView(view);
      this.focusAndCenterSoon();
    }));

    this.registerEvent(this.app.workspace.on("layout-change", () => {
      if (this.isActive) this.focusAndCenterSoon();
    }));

    this.register(() => {
      this.disableZenMode();
    });
  }

  onunload() {
    this.disableZenMode();
    this.menuZoneEl?.remove();
    this.menuZoneEl = null;
    this.clearThemeClasses();
  }

  toggleZenMode() {
    if (this.isActive) {
      this.disableZenMode();
      return;
    }

    this.enableZenMode();
  }

  enableZenMode() {
    const view = this.getEditableMarkdownView();
    if (!view) {
      new Notice("Open a Markdown note in editing mode before entering Zen mode.");
      return false;
    }

    this.isActive = true;
    document.body.classList.add(BODY_CLASS);
    this.ribbonIconEl?.classList.add("is-active");
    this.setTargetView(view);
    this.focusAndCenterSoon();
    return true;
  }

  disableZenMode() {
    this.isActive = false;
    document.body.classList.remove(BODY_CLASS);
    this.ribbonIconEl?.classList.remove("is-active");
    this.clearTargetView();
  }

  handleKeydown(event) {
    if (!this.isActive) return;
    if (event.key !== "Escape") return;

    // red-screen-play uses Escape to close its Shift-triggered role picker.
    // Leave that flow alone so role insertion keeps working inside Zen mode.
    if (document.querySelector(ROLE_DROPDOWN_SELECTOR)) return;
    if (event.defaultPrevented) return;

    event.preventDefault();
    event.stopPropagation();
    this.disableZenMode();
  }

  getEditableMarkdownView() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) return null;
    if (typeof view.getMode === "function" && view.getMode() !== "source") return null;
    return view;
  }

  setTargetView(view) {
    this.clearTargetView();

    const viewEl = view.containerEl ?? view.contentEl;
    const leafEl = viewEl?.closest?.(".workspace-leaf");
    const tabsEl = viewEl?.closest?.(".workspace-tabs");

    viewEl?.classList.add(TARGET_VIEW_CLASS);
    leafEl?.classList.add(TARGET_LEAF_CLASS);
    tabsEl?.classList.add(TARGET_TABS_CLASS);

    this.targetViewEl = viewEl ?? null;
    this.targetLeafEl = leafEl ?? null;
    this.targetTabsEl = tabsEl ?? null;
  }

  clearTargetView() {
    this.targetViewEl?.classList.remove(TARGET_VIEW_CLASS);
    this.targetLeafEl?.classList.remove(TARGET_LEAF_CLASS);
    this.targetTabsEl?.classList.remove(TARGET_TABS_CLASS);
    this.targetViewEl = null;
    this.targetLeafEl = null;
    this.targetTabsEl = null;
  }

  createThemeMenu() {
    this.menuZoneEl?.remove();
    this.themeButtons = new Map();

    const zoneEl = document.createElement("div");
    zoneEl.className = "zen-menu-zone";

    const menuEl = document.createElement("div");
    menuEl.className = "zen-theme-menu";
    menuEl.setAttribute("role", "toolbar");
    menuEl.setAttribute("aria-label", "Zen mode theme");

    for (const theme of THEMES) {
      const buttonEl = document.createElement("button");
      buttonEl.type = "button";
      buttonEl.className = "zen-theme-button";
      buttonEl.dataset.theme = theme.id;
      buttonEl.textContent = theme.label;
      buttonEl.addEventListener("click", () => {
        this.setTheme(theme.id);
      });

      this.themeButtons.set(theme.id, buttonEl);
      menuEl.appendChild(buttonEl);
    }

    zoneEl.appendChild(menuEl);
    document.body.appendChild(zoneEl);
    this.menuZoneEl = zoneEl;
    this.updateThemeButtons();
  }

  async setTheme(themeId) {
    if (!THEMES.some((theme) => theme.id === themeId)) return;

    this.settings.theme = themeId;
    this.applyThemeClass();
    this.updateThemeButtons();
    await this.saveData(this.settings);

    if (this.isActive) this.focusAndCenterSoon();
  }

  applyThemeClass() {
    this.clearThemeClasses();
    if (this.settings.theme !== DEFAULT_SETTINGS.theme) {
      document.body.classList.add(`${THEME_CLASS_PREFIX}${this.settings.theme}`);
    }
  }

  clearThemeClasses() {
    for (const theme of THEMES) {
      document.body.classList.remove(`${THEME_CLASS_PREFIX}${theme.id}`);
    }
  }

  updateThemeButtons() {
    for (const [themeId, buttonEl] of this.themeButtons.entries()) {
      const isActive = themeId === this.settings.theme;
      buttonEl.classList.toggle("is-active", isActive);
      buttonEl.setAttribute("aria-pressed", String(isActive));
    }
  }

  focusAndCenterSoon() {
    const view = this.getEditableMarkdownView();
    if (!view?.editor) return;

    view.editor.focus?.();

    const cm = view.editor.cm;
    if (!cm) return;

    cm.focus?.();
    scheduleCenterActiveLine(cm, this.pendingCenterFrames);
    window.setTimeout(() => scheduleCenterActiveLine(cm, this.pendingCenterFrames), 40);
    window.setTimeout(() => scheduleCenterActiveLine(cm, this.pendingCenterFrames), 140);
  }
};
