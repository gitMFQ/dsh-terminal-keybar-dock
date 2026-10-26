# dsh-terminal-keybar-dock（终端按键条·底部吸附版）

[DeepSeek Harness](https://github.com/deepseek-ai)（DSH）Client 插件：是
[dsh-terminal-keybar](https://github.com/miiy/dsh-terminal-keybar) 的移动端孪生版，
去掉了悬浮样式。

手机软键盘没有 Esc、Tab、Ctrl、Shift 和方向键，DSH 终端也没有屏幕替代键。上游
插件把这些键做成半透明**悬浮键列**浮在终端旁边；本版本改为**吸附**：

- **实心横向工具条**贴着活动终端的底边 —— 768px 以下手机端右侧栏全屏展示终端，
  屏幕底边就是终端底边；
- **终端为工具条让位**：承载终端的 body 盒子留出一条等于工具体高度的下内边距
  （键盘弹出时再加上键盘占高），终端随之重新排布、缩到工具条之上，最后一行
  （提示符与光标）不会被遮挡；
- **随软键盘顶起**：键盘弹出时工具条直接压在键盘上沿并实时跟随键盘高度，按键
  始终位于终端输出和键盘之间；
- **Ctrl / Shift 组合键**：最左侧两个修饰键是一次性粘滞键，可作用于工具条上的键，
  也可以拦下软键盘敲出的下一个字符，让 Ctrl+C / Ctrl+D / Ctrl+R 这类组合在手机上
  真正可用；
- **仅移动端，且只在终端确实可见时**：触屏设备且视口宽度小于 768px、右侧栏活动
  标签是终端、且该终端 body 正在显示时才出现；平板与横屏手机（左右分栏布局）下
  不显示，收起右侧栏时工具条随之消失。

按键：`Ctrl` · `Shift` · `Esc` · `Tab` · `↵` · `^C` · `↑` · `↓` · `←` · `→`

## 组合键（Ctrl / Shift）

最左侧的 `Ctrl` 与 `Shift` 是**一次性粘滞修饰键**：点一下点亮，再点一下取消，
两者可以叠加（Ctrl+Shift）。点亮的修饰键作用于**下一个按键**——无论是工具条上
的键，还是软键盘敲出的一个字符——发送后自动熄灭。

- **作用在工具条上**：`Shift`+`Tab` 发送 `ESC [ Z`（反向 Tab）；`Ctrl` / `Shift` +
  方向键发送 xterm 标准修饰序列（Ctrl+↑ 为 `ESC [ 1 ; 5 A`，Shift 为 `1;2`，两者为
  `1;6`），在 readline 与 vim 里 Ctrl+←/→ 即可按词移动。`Ctrl`+`Esc`、`Ctrl`+`↵`、
  `Ctrl`+`^C` 与不带修饰时发送同样的字节（终端没有另外的区别）。
- **作用在软键盘上**：修饰键点亮时，下一个键入字符会被终端隐藏 textarea 的
  `beforeinput` 拦下（取消插入），改写成对应字节后经同一服务写入——Ctrl+A…Z
  映射为 C0 控制字节（Ctrl+C 中断、Ctrl+D 结束输入、Ctrl+Z 挂起、Ctrl+R 反向
  搜索、Ctrl+L 清屏、Ctrl+W 删词），Ctrl+`[ \ ] ^ _`、空格与 `?` 映射为对应的
  ASCII 控制码，Shift 则把 ASCII 字母变成大写。输入法组词、粘贴等“一次不是单个
  按键”的输入不拦截，修饰键保持点亮。
- 点击工具条以外的任何位置、切换标签页或工具条消失时，修饰键自动熄灭，避免
  误触后改写后面的输入。

Shift 只改 ASCII 字母的大小写；数字与符号沿用软键盘自身的 Shift（键盘布局不同，
插件不做猜测）。Ctrl 对没有控制含义的字符按原样发送。

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

- 由 `dsh-terminal-keybar`（MIT）派生；写入通路、座位注册与诊断角标继承自上游，
  Ctrl/Shift 粘滞修饰键与键入字符的拦截是本版本新增。本插件涉及的全部上游 API 见
  `MAINTENANCE.md`，其中包含可见性判定、留白与组合键所依赖的标签页 body 标记与
  隐藏 textarea。
- 键盘跟随走的是标准 `visualViewport` 公式，桌面浏览器没有软键盘、无法完整演练；
  键盘收起时的吸附布局、留白让位与按键写入可在窄视口触屏模拟下验证，键盘弹出后的
  顶起需要真机确认。修饰键拦截的是 `beforeinput`，可在触屏模拟里派发同名事件验证，
  真机上的软键盘时序仍建议过一遍。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
