const { MarkdownView, Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");
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
  mutedLineOpacityPercent: 28,
  colors: {
    light: { bg: "#ffffff", text: "#2f2a22", mutedText: "#6f6657" },
    dark:  { bg: "#242629", text: "#f1ede6", mutedText: "#d2c9bd" },
    green: { bg: "#edf4ea", text: "#1f3328", mutedText: "#52695d" },
  },
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
    const saved = await this.loadData();
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      colors: {
        light: { ...DEFAULT_SETTINGS.colors.light, ...saved?.colors?.light },
        dark:  { ...DEFAULT_SETTINGS.colors.dark,  ...saved?.colors?.dark  },
        green: { ...DEFAULT_SETTINGS.colors.green, ...saved?.colors?.green },
      },
    };
    if (!THEMES.some((theme) => theme.id === this.settings.theme)) {
      this.settings.theme = DEFAULT_SETTINGS.theme;
    }
    this.settings.mutedLineOpacityPercent = normalizeOpacityPercent(
      this.settings.mutedLineOpacityPercent
    );

    this.isActive = false;
    this.targetViewEl = null;
    this.targetLeafEl = null;
    this.targetTabsEl = null;
    this.menuZoneEl = null;
    this.themeButtons = new Map();
    this.pendingCenterFrames = new WeakMap();

    document.body.classList.remove(BODY_CLASS);
    this.applyThemeClass();
    this.applyCustomColors();
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

    this.addSettingTab(new ZenModeSettingTab(this.app, this));

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
    document.getElementById("zen-custom-colors")?.remove();
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

  applyCustomColors() {
    const c = this.settings.colors;
    const mutedOpacity = this.settings.mutedLineOpacityPercent / 100;
    const hex = (v) => v || "#000000";
    const menuBg = (bg) => {
      const r = parseInt(bg.slice(1, 3), 16);
      const g = parseInt(bg.slice(3, 5), 16);
      const b = parseInt(bg.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, 0.94)`;
    };
    const css = `
body.zen-mode-active:not(.zen-theme-dark):not(.zen-theme-green) {
  --zen-muted-line-opacity: ${mutedOpacity};
  --zen-bg: ${hex(c.light.bg)};
  --zen-text: ${hex(c.light.text)};
  --zen-muted-text: ${hex(c.light.mutedText)};
  --zen-menu-bg: ${menuBg(hex(c.light.bg))};
}
body.zen-mode-active.zen-theme-dark {
  --zen-muted-line-opacity: ${mutedOpacity};
  --zen-bg: ${hex(c.dark.bg)};
  --zen-text: ${hex(c.dark.text)};
  --zen-muted-text: ${hex(c.dark.mutedText)};
  --zen-menu-bg: ${menuBg(hex(c.dark.bg))};
}
body.zen-mode-active.zen-theme-green {
  --zen-muted-line-opacity: ${mutedOpacity};
  --zen-bg: ${hex(c.green.bg)};
  --zen-text: ${hex(c.green.text)};
  --zen-muted-text: ${hex(c.green.mutedText)};
  --zen-menu-bg: ${menuBg(hex(c.green.bg))};
}`;
    let el = document.getElementById("zen-custom-colors");
    if (!el) {
      el = document.createElement("style");
      el.id = "zen-custom-colors";
      document.head.appendChild(el);
    }
    el.textContent = css;
  }
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const OPACITY_MIN = 0;
const OPACITY_MAX = 100;

function normalizeOpacityPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS.mutedLineOpacityPercent;
  return Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.round(number)));
}

class ZenModeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    const themeConfigs = [
      { id: "light", label: "Light Theme" },
      { id: "dark",  label: "Dark Theme"  },
      { id: "green", label: "Green Theme" },
    ];

    const defaults = DEFAULT_SETTINGS.colors;

    this.addMutedOpacitySetting(containerEl);

    for (const { id, label } of themeConfigs) {
      containerEl.createEl("h3", { text: label });

      this.addColorSetting(containerEl, id, "bg",       "Background color",       "Background color in hex (e.g. #ffffff)", defaults[id].bg);
      this.addColorSetting(containerEl, id, "text",     "Focused text color",     "Color of the active line text in hex",   defaults[id].text);
      this.addColorSetting(containerEl, id, "mutedText","Unfocused text color",   "Color of inactive lines in hex",         defaults[id].mutedText);

      new Setting(containerEl)
        .setName("Reset " + label.toLowerCase() + " to defaults")
        .addButton((btn) => {
          btn.setButtonText("Reset").onClick(async () => {
            this.plugin.settings.colors[id] = { ...defaults[id] };
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyCustomColors();
            this.display();
          });
        });
    }
  }

  addMutedOpacitySetting(containerEl) {
    let valueEl;
    const setting = new Setting(containerEl)
      .setName("Unfocused text opacity")
      .setDesc("Opacity percentage for non-focused text lines.")
      .addSlider((slider) => {
        slider
          .setLimits(OPACITY_MIN, OPACITY_MAX, 1)
          .setValue(this.plugin.settings.mutedLineOpacityPercent)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.mutedLineOpacityPercent = normalizeOpacityPercent(value);
            if (valueEl) valueEl.setText(`${this.plugin.settings.mutedLineOpacityPercent}%`);
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyCustomColors();
          });
      })
      .addButton((button) => {
        button
          .setButtonText("Reset")
          .onClick(async () => {
            this.plugin.settings.mutedLineOpacityPercent = DEFAULT_SETTINGS.mutedLineOpacityPercent;
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyCustomColors();
            this.display();
          });
      });

    valueEl = setting.controlEl.createSpan({
      cls: "zen-opacity-value",
      text: `${this.plugin.settings.mutedLineOpacityPercent}%`,
    });
  }

  addColorSetting(containerEl, themeId, key, name, desc, defaultVal) {
    let inputEl;
    const setting = new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        inputEl = text.inputEl;
        text
          .setPlaceholder(defaultVal)
          .setValue(this.plugin.settings.colors[themeId][key])
          .onChange(async (value) => {
            if (!HEX_RE.test(value)) {
              inputEl.style.borderColor = "red";
              return;
            }
            inputEl.style.borderColor = "";
            this.plugin.settings.colors[themeId][key] = value;
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyCustomColors();
          });
      });
    return setting;
  }
}
