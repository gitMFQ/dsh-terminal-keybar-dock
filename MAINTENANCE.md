# Maintenance

This plugin deliberately copies no terminal code: it is a thin Client-half bundle
that talks to documented DSH services, derived from `dsh-terminal-keybar` (MIT).
Everything it depends on is listed here, together with what breaks when upstream
changes it — that table plus the diff procedure below is the whole adaptation
guide.

## What it depends on

| Dependency | Upstream location | Symptom when it changes |
|---|---|---|
| `window.__ModuleLoader__.load({ id, factory })`, `id` equal to the package name | Web client module loader (`packages/client/modules`) | the Client half never activates |
| `ctx.slots.inject` / `ctx.slots.register({ name, id, locale, inject }, C)` | `packages/client/ui-slots` (registry types) mounted by `packages/client/ui-renderer` (the `slots` service) | fails at load (undeclared slot / invalid options) |
| slot name `shell.overlay` (list, root scope) | `packages/client/ui-layout` | fails at load |
| `inject` face `hooks: { <name>: observable }` → component prop `use<Name>` | `packages/client/ui-slots` renderer | component renders without the hook and throws |
| `locale: '<ns>'` injecting `t`; `ctx.locale.register(ns, { zh, en })` | `packages/client/locale` | button labels degrade to raw keys or blank |
| `ctx.sidebarRight.mounted` (`ObservableSnapshot<SessionId \| undefined>`) | `packages/client/ui-sidebar-right` | service never arrives → Client half stays PENDING (**no bar and no error**) |
| `ctx.sidebarRight.openTabs.subscribe` | same | the bar stops updating after a tab switch |
| `ctx.sidebarRight.active()` → `TabRecord` fields `.id` `.kind` `.contentId` | same | the bar shows but presses do nothing |
| `ctx.sidebarRight.isExpanded()` | same | diagnosis badge only (`probe().expanded`); the gate itself reads the body's visibility |
| tab body markers `div[data-sidebar-right-tab="<TabRecord.id>"]` holding a `[data-sidebar-terminal]` body, `visibility: hidden` while the right panel is collapsed | `packages/client/ui-sidebar-right` (`TabSlot`), `packages/client/ui-sidebar-terminal` (`TerminalBody`) | the gate cannot tell a mounted-but-hidden body from a visible one → the bar appears over the chat on a collapsed panel and its keys write into a terminal nobody sees |
| tab body box `.P3OORG_tabBody` `height: 100%`, `display: flex`, `overflow: hidden`, and the terminal body's own `ResizeObserver` → `FitAddon.fit()` / `model.resize()` | `ui-sidebar-right`, `ui-sidebar-terminal` | the reserve stops shrinking the terminal: the bar covers the last rows (prompt, `[y/N]`, `vim` status line) instead of reserving room for them |
| CSS `:has()` (reserve selector) | browser | the reserve never applies (the bar floats over the terminal again); the gate still works |
| `ctx.webTerminals.view(sessionId, key, contentId)` → `TerminalView` (the optional 4th/5th arguments, `terminalId` and `shellPath`, are omitted on purpose) | `packages/api/terminal-controller` | fails at load; if `key` semantics change, a second view is created that fights for the attachment (the terminal turns read-only and asks to "take control") |
| `TerminalView.write(data)` (ignores input while the attachment is not writable, queues it within the attachment's byte budgets) | same | keys do nothing |
| `react-dom` `createPortal` is a baseline module | `packages/client/web/src/platform.ts` (`PLATFORM_MODULES`) | fails at load |
| Mobile breakpoint: a viewport narrower than **768px** presents the right panel fullscreen (`MOBILE_WIDTH` in `client.js`) | `packages/client/ui-sidebar-right` / shell layout CSS | the bar shows where the panel is not fullscreen (covers the chat) or hides on phones; keep `MOBILE_WIDTH` in step with the shell |
| `window.visualViewport` `height`/`offsetTop` + `resize`/`scroll` events; keyboard inset = `innerHeight − offsetTop − height` | browser API | the bar no longer rides the keyboard on iOS / modern Android; falls back to plain bottom docking |
| Layer order: `shell.overlay` = 20, fullscreen right panel = 40 (`--dsh-dockkit-dock-layer`), dockkit float = 60, tab strip = 70 | `AppFrame.module.css`, `SidebarRight.module.css` | if upstream lifts the overlay above 40, the portal can go; if the panel goes higher, raise the bar's `zIndex` (1000) |
| `dsh.client.inject`: an informational package list, not a Cordis service injection and not a module-graph edge | `packages/client/modules/src/client/manifest.ts` | naming a package that is not a Client row (e.g. `dsh-client-ui-slots`) is silently inert; keep the list to the rows that provide the services and the seat |
| Theme tokens `--dsw-alias-bg-layer-1`, `-bg-layer-2`, `-border-l1`, `-border-l2`, `-label-primary` | `packages/client/ui-theme` | cosmetic only; renamed tokens never break rendering |
| Safe-area insets `env(safe-area-inset-left/right/bottom)` need `viewport-fit=cover` to report values; without it they are 0 and the bar just docks flush | shell `index.html` / browser | cosmetic on notched devices only |

**The one hard constraint**: `key` must equal the occurrence key the terminal body
registered its model under — that is `TabRecord.id` from `ctx.sidebarRight.active()`.
`webTerminals.view()` caches by `(sessionId, key)` and returns the **same**
`TerminalView`; a different key creates a second view that steals the attachment.

**Why the portal**: the bar registers on the `shell.overlay` seat but renders into
`document.body`. On a viewport narrower than 768px the right sidebar presents
fullscreen and raises the dockkit dock layer to z-index 40, above the overlay
layer's 20 — an element painted inside that layer is covered by the very
terminal it serves. Menus, modals and toasts in this shell portal for the same
reason. The panel's `overflow: clip` does not affect the bar: a body child is
not clipped, and even a `fixed` child of the panel is not, because its
containing block is the viewport.

**Why the terminal reserves a band** (`RESERVE_CSS` + `RESERVE_VAR`): a floating
bar hides whatever it covers, which for a terminal is the bottom rows — the
prompt and the cursor. No seat places anything *inside* a tab body: a body is
one keyed registration that a plugin either owns whole (`sidebar.right.pane.tab`)
or does not touch, and the frame's `shell.bottom` row holds a single entry that
the shipped inspector page already claims. So the bar reserves its own height in
the terminal's body box, which is `height: 100%`: a border-box bottom padding
there shortens the terminal, and the terminal's `ResizeObserver` re-fits xterm
(`FitAddon` → `model.resize`, which skips no-op sizes). While the keyboard is
open the padding grows by the same `visualViewport` inset the bar's `bottom`
uses, so the terminal's last row always lands on the bar's top edge instead of
behind it. The rule matches every mounted terminal body, so a split pane beside
the active one stops at the same edge.

**Why the gate reads the DOM** (`onScreen`): `sidebarRight.active()` keeps naming
a terminal while the panel is collapsed — the docked body stays mounted, the kit
only moves it out of the frame with `visibility: hidden` — so a service-only
gate leaves the bar painted over the chat and its presses writing into an
off-screen terminal. The check is "the body box for this tab exists, is not
`visibility: hidden` and still has client rects", which is also true for a
floating pane (floats survive collapse) and false again as soon as the panel or
the session goes away.

**Why `bottom: calc(max(inset, env(safe-area-inset-bottom)))`**: on iOS and
modern Android the soft keyboard covers the bottom of the *layout* viewport,
which is where `position: fixed` anchors; the visual-viewport inset computed in
`useKeyboardInset` is the exact keyboard extent, so the bar sits on the keyboard.
When the keyboard is closed the inset is 0 and the safe-area term keeps the bar
above the home indicator. On browsers that resize the layout viewport for the
keyboard the inset reads 0 and `bottom: 0` is already above the keyboard.

## After upgrading DSH

```sh
# 1. See what upstream moved (other files are irrelevant to this plugin)
git -C <dsh-checkout> log --oneline <old>..<new> -- \
  packages/client/ui-sidebar-right/src/client/service.ts \
  packages/client/ui-sidebar-right/src/client/shell/SidebarRight.module.css \
  packages/client/ui-sidebar-right/src/client/shell/SidebarRight.tsx \
  packages/client/ui-sidebar-terminal/src/client/TerminalBody.tsx \
  packages/client/ui-sidebar-terminal/src/client/terminal.module.css \
  packages/client/ui-slots/src/index.ts \
  packages/client/ui-slots/src/renderer.ts \
  packages/api/terminal-controller/src/client/index.ts \
  packages/api/terminal-controller/src/client/model.ts \
  packages/client/ui-layout/src/client/AppFrame.module.css \
  packages/client/ui-layout/src/client/index.ts \
  packages/client/modules/src/client/manifest.ts \
  packages/client/web/src/platform.ts

# 2. Fix the matching few lines in client.js against the table above

# 3. Self-check
node --check client.js && node --check index.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"

# 4. Reinstall, then reload the page; if a replaced package does not hot-reload,
#    restart dsh web to load a fresh JavaScript module generation
#    plugin_manager: install_bundle, target = this directory
```

## Smoke test

On the phone (portrait): open a terminal → a solid key bar is docked along the
bottom of the screen, and the terminal stops above it — the prompt line and the
cursor stay visible → tap `↑` → the previous history entry appears; tap `^C` →
the running command is interrupted; tap `↵` → the command runs. Tap into the
terminal so the soft keyboard opens → the bar rides up and sits on top of the
keyboard while the terminal re-fits into what is left → tap `Esc` in vim or `↑`
for history with the keyboard still open. Collapse the panel: the bar goes with
it. Rotate to landscape (side-by-side layout): the bar hides.

If the bar is missing, turn on the `DEBUG` switch at the top of `client.js`:

- **no badge at all** → the Client half did not load or activate (a service or
  slot name changed, or the page is old); check that the `terminal-keybar-dock`
  seat is live
- **badge present** → it prints `touch`, `tp` (maxTouchPoints), `mounted`
  (a Session on screen), `expanded` (`isExpanded()`), `body` (the tab body is
  mounted and visible), `kind` (the active tab's type), `w` (viewport width) and
  `inset` (keyboard inset); whichever value is 0/`none`/`body=0`/`w` ≥ 768 is the
  failing condition

Turn `DEBUG` back off when done — it is off by default.
