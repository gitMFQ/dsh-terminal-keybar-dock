# dsh-terminal-keybar-dock（终端按键条·底部吸附版）

[DeepSeek Harness](https://github.com/deepseek-ai)（DSH）Client 插件：是
[dsh-terminal-keybar](https://github.com/miiy/dsh-terminal-keybar) 的移动端孪生版，
去掉了悬浮样式。

手机软键盘没有 Esc、Tab、Ctrl 和方向键，DSH 终端也没有屏幕替代键。上游插件把
这些键做成半透明**悬浮键列**浮在终端旁边；本版本改为**吸附**：

- **实心横向工具条**贴着活动终端的底边 —— 768px 以下手机端右侧栏全屏展示终端，
  屏幕底边就是终端底边；
- **终端为工具条让位**：承载终端的 body 盒子留出一条等于工具体高度的下内边距
  （键盘弹出时再加上键盘占高），终端随之重新排布、缩到工具条之上，最后一行
  （提示符与光标）不会被遮挡；
- **随软键盘顶起**：键盘弹出时工具条直接压在键盘上沿并实时跟随键盘高度，按键
  始终位于终端输出和键盘之间；
- **仅移动端，且只在终端确实可见时**：触屏设备且视口宽度小于 768px、右侧栏活动
  标签是终端、且该终端 body 正在显示时才出现；平板与横屏手机（左右分栏布局）下
  不显示，收起右侧栏时工具条随之消失。

按键：`Esc` · `Tab` · `↵` · `^C` · `↑` · `↓` · `←` · `→`

## 键盘高度的计算

iOS Safari 和新版 Android Chrome 不压缩布局视口、只缩小
`window.visualViewport`，纯 `position: fixed; bottom: 0` 会被键盘盖住。本插件用
`innerHeight − visualViewport.offsetTop − visualViewport.height` 得到键盘占高，
把工具条 `bottom` 设为 `max(键盘占高, env(safe-area-inset-bottom))`：键盘开着就
压在键盘上，键盘关了就停在 Home 指示条安全区之上。终端让出的那条留白用的是同一个
表达式再加上工具条自身高度，因此终端底边永远与工具条顶边对齐。旧版 Android、
Firefox 等直接压缩布局视口的浏览器测不到占高、也不需要：它们的 `bottom: 0`
天然在键盘之上。

按键用 `pointerdown` + `preventDefault`，终端文本框保持焦点、软键盘不收起。
按键字节通过公开的 Client 终端服务写入活动标签
（`webTerminals.view(...).write(...)`），不复制任何终端代码。

## 安装

在本目录作为本地 bundle 安装（DSH 插件管理页 → 安装，或 `plugin_manager` 的
`install_bundle`）。安装后**停用上游 `dsh-terminal-keybar`**，避免悬浮键列与
吸附条同时出现。安装完成后刷新页面。

## 说明

- 由 `dsh-terminal-keybar`（MIT）派生；写入通路、座位注册与诊断角标继承自上游。
  本插件涉及的全部上游 API 见 `MAINTENANCE.md`，其中包含可见性判定与留白所依赖的
  标签页 body 标记。
- 键盘跟随走的是标准 `visualViewport` 公式，桌面浏览器没有软键盘、无法完整演练；
  键盘收起时的吸附布局、留白让位与按键写入可在窄视口触屏模拟下验证，键盘弹出后的
  顶起需要真机确认。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
