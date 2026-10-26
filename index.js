/**
 * Host half of the docked terminal key bar.
 *
 * The feature is browser-only: it renders into the Client `shell.overlay` seat
 * and writes to the Client terminal service. This half exists so the bundle row
 * has a Host activation; it owns nothing.
 */

/** Activate the Host row; no Host resources are registered. */
export function apply() {}
