# dsh-terminal-keybar-dock

A [DeepSeek Harness](https://github.com/deepseek-ai) (DSH) Client plugin: the
mobile twin of
[dsh-terminal-keybar](https://github.com/miiy/dsh-terminal-keybar), without the
floating look.

A phone's soft keyboard has no Escape, Tab, Ctrl, Shift or arrow keys, and the DSH
terminal has no on-screen replacement. The upstream plugin floats a translucent
column of those keys beside the terminal; this variant **docks** them instead:

- a **solid horizontal bar** along the bottom edge of the active terminal — on
  a phone the right Sidebar presents the terminal fullscreen below 768px, so
  the screen bottom is the terminal bottom;
- **the terminal gives the bar its band**: the body box holding the terminal
  reserves a bottom padding of the bar's height (plus the keyboard inset while
  the keyboard is open), so the terminal re-fits above the bar and its last row —
  the prompt and the cursor — stays visible instead of being covered;
- **rides the soft keyboard**: while the keyboard is open the bar sits directly
  on top of it, tracking its height, so the keys you need are always between
  the terminal output and the keyboard;
- **Ctrl / Shift modifiers**: the two keys at the head of the row are sticky and
  apply to the next bar key or the next character typed on the soft keyboard, so
  Ctrl+C / Ctrl+D / Ctrl+R — the reason a terminal has Ctrl — become reachable;
- **mobile only, and only while the terminal is on screen**: it appears on touch
  devices with a viewport narrower than 768px while the right Sidebar's active
  tab is a terminal and that terminal's body is actually visible. On tablets and
  landscape phones (side-by-side layout) it stays off, and collapsing the panel
  takes the bar with it.

Keys: `Ctrl` · `Shift` · `Esc` · `Tab` · `↵` · `^C` · `↑` · `↓` · `←` · `→`

## Modifier keys (Ctrl / Shift)

The `Ctrl` and `Shift` keys are **sticky, one-shot modifiers**: tap one and it
lights up, tap it again to cancel, and the two compose (Ctrl+Shift). An armed
modifier applies to the **next key** — a bar key or one character typed on the
soft keyboard — and then clears itself.

- **Against the bar**: `Shift`+`Tab` sends `ESC [ Z` (back-tab), and `Ctrl` /
  `Shift` + an arrow sends the standard xterm modifier sequence (`ESC [ 1 ; 5 A`
  for Ctrl+↑, `1;2` for Shift, `1;6` for both), so Ctrl+←/→ moves by word in
  readline and vim. `Ctrl`+`Esc`, `Ctrl`+`↵` and `Ctrl`+`^C` send the same bytes
  as the unmodified keys — terminals draw no further distinction.
- **Against the soft keyboard**: while a modifier is armed, the next typed
  character is intercepted from the terminal's hidden textarea as a cancelable
  `beforeinput`, the insertion is cancelled, and the rewritten byte goes through
  the same terminal service. Ctrl+A…Z become the C0 control bytes (Ctrl+C
  interrupt, Ctrl+D EOF, Ctrl+Z suspend, Ctrl+R reverse search, Ctrl+L clear,
  Ctrl+W kill word); Ctrl+`[ \ ] ^ _`, space and `?` map to their ASCII control
  codes; Shift uppercases ASCII letters. Input that is not one keystroke — an IME
  composition, a paste — is left alone and the modifiers stay armed.
- Tapping anywhere outside the bar, switching tabs or the bar disappearing clears
  the armed state, so a modifier tapped by accident cannot rewrite a later
  keystroke.

Shift only changes the case of ASCII letters; digits and symbols keep whatever
the soft keyboard's own Shift produced (layouts differ, and the plugin does not
guess). Ctrl sends a character with no control meaning exactly as typed.

## How the keyboard inset works

iOS Safari and modern Android Chrome keep the layout viewport intact and shrink
`window.visualViewport` instead, so a plain `position: fixed; bottom: 0` bar
would sit behind the keyboard. The bar reads the keyboard inset as
`innerHeight − visualViewport.offsetTop − visualViewport.height` and sets its own
`bottom` to `max(inset, env(safe-area-inset-bottom))` — on the keyboard while it
is open, above the home indicator while it is closed. The reserved band the
terminal gives up is the same expression plus the bar's height, so the terminal's
bottom edge always meets the bar's top edge. Browsers that resize the layout
viewport instead (older Android, Firefox) report no inset and need none: their
`bottom: 0` is already above the keyboard.

Presses use `pointerdown` with `preventDefault`, so the terminal's textarea keeps
focus and the soft keyboard stays open. Bytes go through the public Client
terminal service of the active tab (`webTerminals.view(...).write(...)`); no
terminal code is copied.

## Install

Install as a local bundle from this directory (DeepSeek Harness, Plugins →
Install, or the `plugin_manager` tool with `install_bundle`). Then **disable the
upstream `dsh-terminal-keybar`** so the floating column does not appear beside
the docked bar. Reload the page after installation.

## Notes

- Derived from `dsh-terminal-keybar` (MIT); the write path, seat registration
  and diagnosis badge are inherited from it, while the sticky Ctrl/Shift
  modifiers and typed-character interception are new here. See `MAINTENANCE.md`
  for every upstream API this plugin touches — including the tab-body markers the
  visibility gate and the reserved band are built on, and the hidden textarea the
  modifiers intercept.
- The keyboard-inset path follows the standard `visualViewport` formula, which
  desktop browsers cannot fully exercise (no soft keyboard); the closed-keyboard
  docked layout, the reserved band and key delivery are verifiable in a narrow
  touch-emulated viewport, the open-keyboard ride-up needs a real phone. The
  modifier interception listens for `beforeinput`, which a touch-emulated page
  can dispatch; the real soft-keyboard timing still deserves a pass on a phone.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
