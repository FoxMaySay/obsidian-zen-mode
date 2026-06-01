# obsidian-focus-zen-mode

[中文](README_CN.md)

Focus Zen Mode is an Obsidian plugin for focused Markdown writing. It hides distracting workspace UI, centers the active editor line, and provides a compact theme switcher for light, dark, and green writing modes.

![Zen Mode light theme](screenshot/ScreenShot_01.png)

![Zen Mode dark theme](screenshot/ScreenShot_02.png)

![Zen Mode green theme](screenshot/ScreenShot_03.png)

## Features

- Enter Zen Mode via the **ribbon icon**.
- Press **ESC** to exit Zen Mode.
- Keep the current Markdown editing line centered while writing.
- Dim non-active lines to make the current line easier to follow.
- In Zen Mode, **move the mouse to the bottom** to switch between Light, Dark, and Green themes from the floating theme menu.

## Installation

### Method 1: Community Plugins (Recommended)

Once listed on the community store, you can install it directly:

1. Go to **Settings > Community plugins > Browse**.
2. Search for **Focus Zen Mode**.
3. Click **Install**, then **Enable**.

### Method 2: Manual Installation

1. Create this folder inside your vault:

   ```text
   .obsidian/plugins/focus-zen-mode/
   ```

2. Copy these files into that folder:

   ```text
   main.js
   styles.css
   manifest.json
   ```

3. Restart Obsidian.
4. Open **Settings > Community plugins** and enable **Focus Zen Mode**.

## Usage

Open a Markdown note in editing mode, click the ribbon focus icon. Move the mouse to the bottom of the screen to switch themes.

## License

MIT License. See [LICENSE](LICENSE) for details.
