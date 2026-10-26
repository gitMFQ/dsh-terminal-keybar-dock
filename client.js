/**
 * Docked touch key bar for the DSH Web terminal.
 *
 * Derived from dsh-terminal-keybar (MIT,
 * https://github.com/miiy/dsh-terminal-keybar), which floats a translucent
 * column of keys beside the terminal. This variant docks instead: on a phone
 * the right Sidebar presents the terminal fullscreen below 768px, so a solid
 * horizontal bar fixed to the bottom of the screen IS the bottom of the
 * terminal, and while the soft keyboard is open the same bar rides on top of
 * it. The bar keeps the original's write path: bytes go through the public
 * Client terminal service of the active tab.
 *
 * The bar is portalled to `document.body`, beside `#root`, instead of being
 * painted inside the `shell.overlay` layer it registers on. That layer sits at
 * z-index 20 while a viewport narrower than 768px presents the right panel
 * with the dock layer raised to 40, so an element inside it is covered by the
 * very terminal it serves. Menus, modals and toasts in this shell portal for
 * the same reason.
 *
 * Floating over the terminal would still hide the rows it covers, so the
 * terminal gives up exactly the bar's band instead: the body box that holds it
 * reserves a bottom padding of the bar's height — plus the keyboard inset while
 * the keyboard is open — through the stylesheet this plugin installs. The
 * terminal's own resize observer re-fits xterm to the shorter screen, so the
 * prompt and the cursor stay above the bar rather than under it.
 *
 * The keyboard inset is read from `visualViewport`: iOS Safari and modern
 * Android Chrome keep the layout viewport intact and shrink the visual
 * viewport instead, so the keyboard occupies
 * `innerHeight - offsetTop - height` at the bottom of the layout viewport —
 * exactly the `bottom` a fixed element needs to sit on the keyboard. Browsers
 * that resize the layout viewport instead (older Android, Firefox) report no
 * inset, and their `bottom: 0` is already above the keyboard.
 *
 * The row also carries sticky Ctrl and Shift keys. A modifier writes nothing
 * itself: it arms for the next key — a row key or a character typed on the
 * soft keyboard — and clears after it. While a modifier is armed the terminal's
 * hidden textarea reports the next typed character as a cancelable
 * `beforeinput`; cancelling it and writing the modified byte through the same
 * service is what makes Ctrl-D, Ctrl-Z and Ctrl-R reachable on a phone at all.
 *
 * It copies no terminal code. Every upstream name it depends on is listed in
 * MAINTENANCE.md, so an upstream upgrade can be adapted from that list alone.
 */
window.__ModuleLoader__.load({
  id: 'dsh-terminal-keybar-dock',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    /**
     * Diagnosis switch, off in normal use.
     *
     * While true the seat also paints a badge with the live gate inputs, so a
     * device whose bar does not appear reports which condition failed. Turn it
     * back on when the bar stops showing after an upgrade.
     */
    const DEBUG = false

    /** Locale namespace of this plugin's copy. */
    const NS = 'terminalKeybarDock'

    /** Simplified Chinese copy. */
    const zh = {
      label: '终端按键条',
      'aria.ctrl': 'Control（组合键）',
      'aria.shift': 'Shift（组合键）',
      'aria.escape': 'Escape',
      'aria.tab': 'Tab',
      'aria.enter': '回车',
      'aria.interrupt': 'Control-C（中断）',
      'aria.up': '上方向键',
      'aria.down': '下方向键',
      'aria.left': '左方向键',
      'aria.right': '右方向键',
    }

    /** English copy. */
    const en = {
      label: 'Terminal keys',
      'aria.ctrl': 'Control (modifier)',
      'aria.shift': 'Shift (modifier)',
      'aria.escape': 'Escape',
      'aria.tab': 'Tab',
      'aria.enter': 'Enter',
      'aria.interrupt': 'Control-C (interrupt)',
      'aria.up': 'Arrow up',
      'aria.down': 'Arrow down',
      'aria.left': 'Arrow left',
      'aria.right': 'Arrow right',
    }

    /**
     * One key of the row: the glyph the user reads, the accessible name key,
     * and the bytes a terminal expects.
     *
     * The arrow sequences are the CSI forms (`ESC [ A`…). An application in
     * DECCKM would expect the SS3 forms (`ESC O A`…), which this plugin cannot
     * read; readline and vim accept both, so the row stays usable there.
     */
    const KEYS = [
      { id: 'escape', text: 'Esc', data: '\u001b' },
      { id: 'tab', text: 'Tab', data: '\t' },
      { id: 'enter', text: '\u21b5', data: '\r' },
      { id: 'interrupt', text: '^C', data: '\u0003' },
      { id: 'up', text: '\u2191', data: '\u001b[A' },
      { id: 'down', text: '\u2193', data: '\u001b[B' },
      { id: 'left', text: '\u2190', data: '\u001b[D' },
      { id: 'right', text: '\u2192', data: '\u001b[C' },
    ]

    /**
     * The sticky modifiers at the head of the row. They write no bytes
     * themselves: tapping one arms it for the next key, tapping it again
     * disarms it, and the two compose (Ctrl+Shift).
     */
    const MODIFIERS = [
      { id: 'ctrl', text: 'Ctrl' },
      { id: 'shift', text: 'Shift' },
    ]

    /** Arrow-key finals in the CSI forms this row sends. */
    const ARROW_FINALS = { up: 'A', down: 'B', right: 'C', left: 'D' }

    /**
     * The CSI arrow sequence for the armed modifiers.
     *
     * xterm's modifier parameter is `1 + Shift + 4 * Ctrl` (`2` Shift, `5`
     * Ctrl, `6` both), so Ctrl/Shift+arrow become `ESC [ 1 ; <parameter> <final>`
     * — the forms readline, vim and TUIs already understand for "word left"
     * and selection. Without a modifier the plain `ESC [ <final>` form is kept.
     * @param final - the arrow's final byte (`A` up, `B` down, `C` right, `D` left).
     * @param mods - the armed modifiers.
     * @returns the bytes to write.
     */
    function arrowSequence(final, mods) {
      const parameter = 1 + (mods.shift ? 1 : 0) + (mods.ctrl ? 4 : 0)
      return parameter === 1 ? `\u001b[${final}` : `\u001b[1;${parameter}${final}`
    }

    /**
     * The bytes for one row key with the armed modifiers folded in.
     * @param key - one entry of `KEYS`.
     * @param mods - the armed modifiers.
     * @returns the bytes to write.
     */
    function sequenceOf(key, mods) {
      // Shift+Tab is the one back-tab form every terminal reads; Ctrl+Tab has
      // no distinct byte, so it stays a tab.
      if (key.id === 'tab') return mods.shift ? '\u001b[Z' : '\t'
      const final = ARROW_FINALS[key.id]
      if (final !== undefined) return arrowSequence(final, mods)
      return key.data
    }

    /**
     * The C0 byte a terminal expects for Ctrl plus one printable character,
     * or null when the pair has no ASCII control meaning.
     * @param char - one character, as typed.
     * @returns the control byte, or null.
     */
    function controlByte(char) {
      if (/^[a-z]$/i.test(char)) return String.fromCharCode(char.toLowerCase().charCodeAt(0) - 96)
      switch (char) {
        case ' ':
        case '@': return '\u0000'
        case '[': return '\u001b'
        case '\\': return '\u001c'
        case ']': return '\u001d'
        case '^': return '\u001e'
        case '_': return '\u001f'
        case '?': return '\u007f'
        default: return null
      }
    }

    /**
     * The bytes for one character typed on the soft keyboard while modifiers
     * are armed.
     *
     * Ctrl wins over Shift, as on a physical keyboard. Ctrl only rewrites
     * characters that have a control meaning; anything else is sent as typed.
     * Shift raises ASCII letters and leaves every other character alone,
     * because the soft keyboard has already applied its own shift to those.
     * @param char - the typed character.
     * @param mods - the armed modifiers.
     * @returns the bytes to write.
     */
    function typedSequence(char, mods) {
      if (mods.ctrl) {
        const control = controlByte(char)
        if (control !== null) return control
        return char
      }
      if (mods.shift && /^[a-z]$/i.test(char)) return char.toUpperCase()
      return char
    }

    /**
     * Viewport width below which the right Sidebar presents its panel
     * fullscreen, matching the shell's own mobile breakpoint. The bar is a
     * mobile feature: below it the panel covers the viewport, so a bar along
     * the screen bottom belongs to the terminal it serves; above it the
     * terminal is a side column and a full-width bar would cover the chat, so
     * the bar stays off.
     */
    const MOBILE_WIDTH = 768

    /**
     * Height of the bar in pixels: a 40px key, 5px of padding above and below
     * it and the 1px top border, boxed. The reserve the terminal gives up is
     * this same number, so the last terminal row lands exactly on the bar's top
     * edge.
     */
    const BAR_HEIGHT = 51

    /**
     * Custom property that carries the bar's reserved band, set while the bar
     * shows. It is not a theme token: unset, the reserve below is zero.
     */
    const RESERVE_VAR = '--dsh-terminal-keybar-dock-reserve'

    /**
     * The reserve itself.
     *
     * The seat the bar registers on is a floating layer by contract, and a tab
     * body is extensible nowhere: a body is registered whole under its type's
     * key and never wrapped, so no seat places anything below the terminal. The
     * body's own box is therefore what gives the band up. That box is
     * `height: 100%`, so a border-box bottom padding shortens the terminal, and
     * the terminal's resize observer re-fits xterm to it.
     *
     * It targets every mounted terminal body, not only the one the bar speaks
     * to: the bar spans the panel, so a second terminal beside the active one
     * (a split pane) stops above the same edge. The frame's own bottom row
     * (`shell.bottom`) would be the seat for this, but it holds one entry and
     * the shipped inspector page registers on it.
     */
    const RESERVE_CSS = `[data-sidebar-right-tab]:has([data-sidebar-terminal])`
      + `{box-sizing:border-box;padding-bottom:var(${RESERVE_VAR},0px)}`

    /** Host theme tokens only: the bar follows light, dark and token overrides. */
    const styles = {
      bar: {
        position: 'fixed',
        boxSizing: 'border-box',
        height: BAR_HEIGHT,
        // Full-bleed to the panel edges; clear of the notch in either rotation.
        left: 'max(0px, env(safe-area-inset-left))',
        right: 'max(0px, env(safe-area-inset-right))',
        // `bottom` is computed per render: the keyboard inset when the soft
        // keyboard is open, the home-indicator safe area when it is not.
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'row',
        gap: 3,
        padding: '5px 4px',
        borderTop: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        // A docked accessory bar: solid, squared, no shadow and no translucency.
        pointerEvents: 'auto',
        userSelect: 'none',
        touchAction: 'manipulation',
      },
      key: {
        flex: '1 1 0',
        minWidth: 0,
        maxWidth: 84,
        height: 40,
        padding: 0,
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 8,
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 14,
        lineHeight: 1,
        cursor: 'pointer',
        touchAction: 'manipulation',
      },
      // Modifier labels are words rather than glyphs; a smaller face keeps
      // "Shift" inside a 30px key on a narrow phone without a second row.
      modifier: {
        fontSize: 11,
        fontWeight: 500,
      },
      // Armed state: the one place in the bar with a solid accent, so "this
      // modifier is live" reads instantly on a glance in sunlight.
      armed: {
        background: 'var(--dsw-alias-brand-primary)',
        borderColor: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-label-primary-inverted)',
      },
      badge: {
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 2147483000,
        maxWidth: '100vw',
        padding: '2px 6px',
        overflow: 'hidden',
        background: '#b00020',
        color: '#ffffff',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      },
    }

    /** Whether the device is driven by a coarse pointer: the bar is a mobile feature. */
    function touchDevice() {
      if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true
      return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
    }

    /**
     * The soft keyboard's extent at the bottom of the layout viewport, in
     * pixels: the slice `visualViewport` reports as covered. Browsers that
     * resize the layout viewport for the keyboard report zero.
     * @returns the inset, `0` without `visualViewport`.
     */
    function keyboardInset() {
      const viewport = window.visualViewport
      if (viewport === undefined) return 0
      return Math.max(0, Math.round(window.innerHeight - viewport.offsetTop - viewport.height))
    }

    /**
     * The mounted body box of one sidebar tab: the element the terminal fills.
     *
     * The box is addressed by the two markers the right Sidebar and the
     * terminal write on their own elements — the tab body keyed by the record
     * it holds, and the terminal body inside it — so the lookup survives every
     * layout the kit may build around it.
     * @param tabId - the tab's occurrence key.
     * @returns the box, or null while that body is not mounted.
     */
    function tabBody(tabId) {
      for (const node of document.querySelectorAll('div[data-sidebar-right-tab]')) {
        if (node.dataset.sidebarRightTab === tabId && node.querySelector('[data-sidebar-terminal]') !== null) return node
      }
      return null
    }

    /**
     * Whether a tab's body is on screen right now.
     *
     * A collapsed right panel keeps its docked bodies mounted and only moves
     * them out of the frame with `visibility: hidden`, so the services cannot
     * answer this: `active()` still names the terminal and its content is still
     * live. Without the check the bar paints over the chat and writes into a
     * terminal nobody can see — a floating pane, which survives collapse, is
     * still visible and keeps its bar.
     * @param tabId - the tab's occurrence key.
     * @returns `true` while the body is mounted and visible.
     */
    function onScreen(tabId) {
      const body = tabBody(tabId)
      if (body === null) return false
      return getComputedStyle(body).visibility !== 'hidden' && body.getClientRects().length > 0
    }

    /**
     * Install the reserve stylesheet, once per page: it is inert while
     * `RESERVE_VAR` is unset, so it costs nothing while the bar is off.
     * @returns the disposer that removes the stylesheet again.
     */
    function installReserveStyle() {
      const tagId = 'dsh-terminal-keybar-dock/reserve.css'
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-terminal-keybar-dock'
      tag.dataset.pluginCss = tagId
      tag.textContent = RESERVE_CSS
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }

    /**
     * The visual keyboard inset and the live viewport width.
     *
     * iOS Safari does not resize the layout viewport for the on-screen
     * keyboard, so a fixed element at `bottom: 0` would sit behind it. The
     * inset below is the slice of the layout viewport the keyboard covers,
     * which is exactly the `bottom` that puts a fixed element on the keyboard.
     * Browsers that resize the layout viewport report no inset and need none.
     * @returns the live metrics, `{ inset, width }`.
     */
    function useKeyboardInset() {
      const read = () => ({ inset: keyboardInset(), width: window.innerWidth })
      const [metrics, setMetrics] = React.useState(read)
      React.useEffect(() => {
        const viewport = window.visualViewport
        const update = () => setMetrics((current) => {
          const next = read()
          return current.inset === next.inset && current.width === next.width ? current : next
        })
        update()
        window.addEventListener('resize', update)
        if (viewport !== undefined) {
          viewport.addEventListener('resize', update)
          viewport.addEventListener('scroll', update)
        }
        return () => {
          window.removeEventListener('resize', update)
          if (viewport !== undefined) {
            viewport.removeEventListener('resize', update)
            viewport.removeEventListener('scroll', update)
          }
        }
      }, [])
      return metrics
    }

    /**
     * The docked key bar.
     * @param props - the terminal target hook, the byte sender, the diagnosis
     *   probe and the locale seat.
     * @returns the key bar on a touch device while a terminal is the active
     *   tab of the fullscreen (mobile) panel, plus the diagnosis badge while
     *   `DEBUG` is on.
     */
    function KeyBarDock({ useTerminal, press, probe, t }) {
      const target = typeof useTerminal === 'function' ? useTerminal(value => value) : null
      const [touch] = React.useState(touchDevice)
      const { inset, width } = useKeyboardInset()
      const show = touch && width < MOBILE_WIDTH && target !== null
      const tabId = target === null ? null : target.tabId
      const [ctrl, setCtrl] = React.useState(false)
      const [shift, setShift] = React.useState(false)

      /** Disarm both modifiers; the next key (or a stray tap) consumes them. */
      const clear = React.useCallback(() => {
        setCtrl(false)
        setShift(false)
      }, [])

      // A modifier armed for one tab must not fire into the next one, and a
      // hidden bar must not keep a modifier armed behind it.
      React.useEffect(clear, [show, tabId])

      // The bar floats over the frame, so the terminal has to give its band up
      // in the same commit the bar appears in, or the first frame shows the
      // bar on top of the rows it is about to displace.
      React.useLayoutEffect(() => {
        if (!show) return
        const root = document.documentElement
        root.style.setProperty(RESERVE_VAR, `calc(${BAR_HEIGHT}px + max(${inset}px, env(safe-area-inset-bottom)))`)
        return () => { root.style.removeProperty(RESERVE_VAR) }
      }, [show, inset])

      // While a modifier is armed, the next character typed on the soft
      // keyboard is rewritten instead of reaching xterm. The terminal's hidden
      // textarea reports that insertion as a cancelable `beforeinput`, so
      // cancelling it and writing the modified byte through the same service
      // keeps the terminal in charge of the byte stream. Without this the
      // modifiers would only reach the bar's own keys, and Ctrl-D, Ctrl-Z or
      // Ctrl-R — the reason a terminal has Ctrl at all — would stay unreachable
      // on a phone.
      React.useEffect(() => {
        if (!show || tabId === null || (!ctrl && !shift)) return
        const armed = { ctrl, shift }
        const intercept = (event) => {
          // Composition (an IME) and multi-character insertions are not one
          // keystroke: leave them to xterm and keep the modifiers armed.
          if (event.defaultPrevented || event.isComposing) return
          if (event.inputType !== 'insertText' || typeof event.data !== 'string') return
          if (Array.from(event.data).length !== 1) return
          const field = event.target
          if (!(field instanceof HTMLTextAreaElement)) return
          const body = tabBody(tabId)
          if (body === null || !body.contains(field)) return
          // Cancel the insertion so xterm's own input handler never sees the
          // unmodified character, then write the modified byte.
          event.preventDefault()
          press(typedSequence(event.data, armed))
          clear()
        }
        document.addEventListener('beforeinput', intercept, true)
        return () => document.removeEventListener('beforeinput', intercept, true)
      }, [show, tabId, ctrl, shift, press, clear])

      // Arming a modifier is only meaningful for the next keystroke; a tap
      // anywhere but on the bar cancels it, so a modifier tapped by accident
      // cannot silently rewrite what is typed later.
      React.useEffect(() => {
        if (!show || (!ctrl && !shift)) return
        const disarm = (event) => {
          const node = event.target
          if (node instanceof Element && node.closest('[data-terminal-keybar-dock]') !== null) return
          clear()
        }
        document.addEventListener('pointerdown', disarm, true)
        return () => document.removeEventListener('pointerdown', disarm, true)
      }, [show, ctrl, shift, clear])

      /**
       * One sticky modifier button.
       * @param modifier - one entry of `MODIFIERS`.
       * @returns the button; switching a modifier on or off writes nothing.
       */
      const modifier = (modifier) => {
        const armed = modifier.id === 'ctrl' ? ctrl : shift
        return h('button', {
          key: modifier.id,
          type: 'button',
          style: { ...styles.key, ...styles.modifier, ...(armed ? styles.armed : null) },
          'aria-label': t(`aria.${modifier.id}`),
          'aria-pressed': armed,
          'data-terminal-keybar-modifier': modifier.id,
          onPointerDown: (event) => {
            event.preventDefault()
            if (modifier.id === 'ctrl') setCtrl(value => !value)
            else setShift(value => !value)
          },
        }, modifier.text)
      }

      const bar = show
        ? h('div', {
          role: 'group',
          'aria-label': t('label'),
          'data-terminal-keybar-dock': '',
          style: { ...styles.bar, bottom: `calc(max(${inset}px, env(safe-area-inset-bottom)))` },
        }, [
          ...MODIFIERS.map(modifier),
          ...KEYS.map(key => h('button', {
            key: key.id,
            type: 'button',
            style: styles.key,
            'aria-label': t(`aria.${key.id}`),
            'data-terminal-keybar-key': key.id,
            // pointerdown, not click: the terminal's textarea keeps focus, so the
            // soft keyboard stays open and the bytes precede any blur teardown.
            onPointerDown: (event) => {
              event.preventDefault()
              press(sequenceOf(key, { ctrl, shift }))
              clear()
            },
          }, key.text)),
        ])
        : null
      if (!DEBUG || typeof probe !== 'function') return portal(bar)
      const info = probe()
      return portal(h(React.Fragment, null, bar, h('div', {
        'data-terminal-keybar-dock-debug': '',
        style: styles.badge,
      }, `kb touch=${touch ? 1 : 0} tp=${String(info.points)} mounted=${info.mounted ? 1 : 0}`
        + ` expanded=${info.expanded ? 1 : 0} body=${info.body ? 1 : 0}`
        + ` kind=${String(info.kind)} w=${String(info.width)} inset=${String(info.inset)}`)))
    }

    /**
     * Mount the bar beside `#root`, above the fullscreen right panel.
     * @param content - the rendered entries, or null while nothing shows.
     * @returns the portal, or null so an empty state adds no body child.
     */
    function portal(content) {
      return content === null ? null : createPortal(content, document.body)
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'webTerminals'],
      /**
       * Register the copy and the frame-wide seat, and keep the seat's terminal
       * target current.
       * @param ctx - Client root Context with the sidebar, terminal and slot services.
       */
      apply(ctx) {
        /** Last published target; a new object only when the target moves. */
        let published = null
        const listeners = new Set()

        /**
         * The terminal the bar speaks to: the active tab of the mounted seat,
         * carrying the same occurrence key its body used, so the service hands
         * back that body's own view instead of a second one.
         *
         * The body must be on screen as well. The seat's `isExpanded()` is not
         * the test for that: on a viewport narrower than 768px an expanded panel
         * is presented fullscreen and a collapsed one still keeps the terminal
         * mounted, and a floating pane survives collapse while staying visible,
         * so the mounted body's own visibility is what separates the two cases.
         * @returns a stable target object, or null when no terminal is active.
         */
        const read = () => {
          const sessionId = ctx.sidebarRight.mounted.getSnapshot()
          if (sessionId === undefined) return null
          const tab = ctx.sidebarRight.active()
          if (tab === undefined || tab.kind !== 'terminal') return null
          if (!onScreen(tab.id)) return null
          if (published !== null && published.sessionId === sessionId && published.tabId === tab.id) return published
          return { sessionId, tabId: tab.id, contentId: tab.contentId }
        }

        /** Re-read the layout and notify only when the target actually moved. */
        const recompute = () => {
          const next = read()
          if (next === published) return
          published = next
          for (const listener of listeners) listener()
        }
        recompute()

        /**
         * Report the live gate inputs to the diagnosis badge.
         * @returns the values the bar's visibility is decided from.
         */
        const probe = () => {
          const sessionId = ctx.sidebarRight.mounted.getSnapshot()
          const tab = sessionId === undefined ? undefined : ctx.sidebarRight.active()
          return {
            points: typeof navigator === 'undefined' ? -1 : navigator.maxTouchPoints,
            mounted: sessionId !== undefined,
            expanded: ctx.sidebarRight.isExpanded(),
            body: tab === undefined ? false : onScreen(tab.id),
            kind: tab === undefined ? 'none' : String(tab.kind),
            width: window.innerWidth,
            inset: window.visualViewport === undefined ? -1 : keyboardInset(),
          }
        }

        /**
         * Send one key sequence to the terminal the user is looking at.
         * @param data - the bytes to write; `TerminalView.write` ignores them
         *   while the attachment is not writable (another page owns input).
         */
        const press = (data) => {
          recompute()
          if (published === null) return
          ctx.webTerminals.view(published.sessionId, published.tabId, published.contentId).write(data)
        }

        /** The target observable the renderer binds to `useTerminal`. */
        const terminal = {
          getSnapshot: () => published,
          subscribe: (listener) => {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
          },
        }

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'terminal-keybar-dock: copy')
        ctx.effect(() => installReserveStyle(), 'terminal-keybar-dock: reserve stylesheet')
        ctx.effect(() => {
          const stopMounted = ctx.sidebarRight.mounted.subscribe(recompute)
          const stopTabs = ctx.sidebarRight.openTabs.subscribe(recompute)
          const root = document.documentElement
          return () => {
            stopMounted()
            stopTabs()
            root.style.removeProperty(RESERVE_VAR)
          }
        }, 'terminal-keybar-dock: layout sources')
        ctx.effect(() => {
          // Tab switches, pane focus and expand/collapse all begin with a
          // pointer gesture; re-reading once after it lands covers the layout
          // commits the services publish on no observable of their own. The
          // interval is the safety net for a change neither path reports.
          let frame = 0
          const schedule = () => {
            if (frame !== 0) return
            frame = requestAnimationFrame(() => { frame = 0; recompute() })
          }
          document.addEventListener('pointerdown', schedule, true)
          document.addEventListener('pointerup', schedule, true)
          window.addEventListener('resize', schedule)
          const interval = window.setInterval(recompute, 1000)
          return () => {
            document.removeEventListener('pointerdown', schedule, true)
            document.removeEventListener('pointerup', schedule, true)
            window.removeEventListener('resize', schedule)
            window.clearInterval(interval)
            if (frame !== 0) cancelAnimationFrame(frame)
          }
        }, 'terminal-keybar-dock: layout re-reads')
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'terminal-keybar-dock', locale: NS,
          inject: () => ({ hooks: { terminal }, press, probe }),
        }, KeyBarDock)), 'terminal-keybar-dock: seat')
        // Diagnosis marker: its presence in the live slot proves this build
        // reached the page. It renders nothing and goes away with DEBUG.
        if (DEBUG) {
          ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
            name: 'shell.overlay', id: 'terminal-keybar-dock.debug',
          }, () => null)), 'terminal-keybar-dock: debug marker')
        }
      },
    }
  },
})
