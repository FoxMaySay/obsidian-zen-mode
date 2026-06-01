# obsidian-focus-zen-mode

[English](README.md)

禅意模式是一款专注于 Markdown 写作的 Obsidian 插件。它会隐藏干扰性的工作区界面，将当前编辑行居中显示，并提供一个简洁的主题切换器，支持浅色、深色和绿色三种写作模式。

![禅意模式浅色主题](screenshot/ScreenShot_01.png)

![禅意模式深色主题](screenshot/ScreenShot_02.png)

![禅意模式绿色主题](screenshot/ScreenShot_03.png)

## 功能特性

- 通过 **侧边栏图标** 进入禅意模式。
- 按 **ESC** 键退出禅意模式。
- 写作时保持当前 Markdown 编辑行居中显示。
- 淡化非活动行，让当前行更易聚焦。
- 禅意模式下， **鼠标移动到底部** ，通过浮动主题菜单在浅色、深色和绿色主题之间切换。

## 安装方法

### 手动安装

1. 在你的 Obsidian 仓库中创建以下文件夹：

   ```text
   .obsidian/plugins/focus-zen-mode/
   ```

2. 将以下文件复制到该文件夹中：

   ```text
   main.js
   styles.css
   manifest.json
   ```

3. 重启 Obsidian。
4. 打开 设置 -> 第三方插件，启用 **Focus Zen Mode**。

## 使用方法

在编辑模式下打开一个 Markdown 笔记，然后在命令面板中运行 **Toggle zen mode**，或点击侧边栏中的专注图标。使用屏幕顶部附近的浮动菜单切换主题。

## 许可证

MIT 许可证。详情请参阅 [LICENSE](LICENSE)。
