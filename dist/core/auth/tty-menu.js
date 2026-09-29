/**
 * Minimal, dependency-free interactive TTY helpers for auth account management.
 *
 * Ported (in spirit) from opencode-antigravity-auth's ui/{select,confirm,ansi}.js.
 * Kept small on purpose: raw-mode stdin, ANSI cursor control, arrow/enter/esc,
 * ctrl-c to cancel. No external deps. All rendering is self-drawn so it never
 * routes through OpenCode's prompt system (which would force a key prompt).
 */
/** ANSI escape codes used by the interactive menu. */
const ANSI = {
    hide: '\x1b[?25l',
    show: '\x1b[?25h',
    up: (n = 1) => `\x1b[${n}A`,
    clearLine: '\x1b[2K',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    dim: '\x1b[2m',
    reset: '\x1b[0m'
};
/**
 * Parse a raw keyboard input buffer into a key action.
 * Handles Windows/Mac/Linux differences in arrow-key sequences.
 */
function parseKey(data) {
    const s = data.toString();
    if (s === '\x1b[A' || s === '\x1bOA')
        return 'up';
    if (s === '\x1b[B' || s === '\x1bOB')
        return 'down';
    if (s === '\r' || s === '\n')
        return 'enter';
    if (s === '\x03')
        return 'cancel'; // ctrl-c
    if (s === '\x1b')
        return 'escape-start'; // bare esc
    return null;
}
/** True only when both stdin and stdout are interactive terminals. */
export function isInteractiveTty() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}
/** Wrap an index into [0, length) — exported for pure unit testing. */
export function wrapIndex(index, length) {
    if (length <= 0)
        return 0;
    return ((index % length) + length) % length;
}
const ESCAPE_TIMEOUT_MS = 50;
/**
 * Render an interactive single-select menu on the TTY.
 * Resolves with the chosen item's value, or `null` if the user cancels
 * (esc / ctrl-c) or raw mode cannot be enabled.
 *
 * Requires an interactive TTY; callers must gate with {@link isInteractiveTty}.
 */
export async function ttySelect(items, options) {
    if (items.length === 0)
        return null;
    const { message } = options;
    const { stdin, stdout } = process;
    let cursor = 0;
    let renderedLines = 0;
    let escapeTimeout = null;
    let isCleanedUp = false;
    const render = () => {
        if (renderedLines > 0) {
            stdout.write(ANSI.up(renderedLines));
        }
        let linesWritten = 0;
        const writeLine = (line) => {
            stdout.write(`${ANSI.clearLine}${line}\n`);
            linesWritten += 1;
        };
        writeLine(`${ANSI.dim}?${ANSI.reset} ${message}`);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item)
                continue;
            const isSelected = i === cursor;
            if (isSelected) {
                writeLine(`${ANSI.cyan}│${ANSI.reset}  ${ANSI.green}●${ANSI.reset} ${item.label}`);
            }
            else {
                writeLine(`${ANSI.cyan}│${ANSI.reset}  ${ANSI.dim}○ ${item.label}${ANSI.reset}`);
            }
        }
        writeLine(`${ANSI.cyan}└${ANSI.reset}  ${ANSI.dim}Up/Down: move | Enter: confirm | Esc: cancel${ANSI.reset}`);
        renderedLines = linesWritten;
    };
    return new Promise((resolve) => {
        const wasRaw = stdin.isRaw ?? false;
        const cleanup = () => {
            if (isCleanedUp)
                return;
            isCleanedUp = true;
            if (escapeTimeout) {
                clearTimeout(escapeTimeout);
                escapeTimeout = null;
            }
            try {
                stdin.removeListener('data', onKey);
                stdin.setRawMode(wasRaw);
                stdin.pause();
                stdout.write(ANSI.show);
            }
            catch {
                // best-effort cleanup
            }
            process.removeListener('SIGINT', onSignal);
            process.removeListener('SIGTERM', onSignal);
        };
        const finish = (value) => {
            cleanup();
            resolve(value);
        };
        const onSignal = () => finish(null);
        const onKey = (data) => {
            if (escapeTimeout) {
                clearTimeout(escapeTimeout);
                escapeTimeout = null;
            }
            const action = parseKey(data);
            switch (action) {
                case 'up':
                    cursor = wrapIndex(cursor - 1, items.length);
                    render();
                    return;
                case 'down':
                    cursor = wrapIndex(cursor + 1, items.length);
                    render();
                    return;
                case 'enter':
                    finish(items[cursor]?.value ?? null);
                    return;
                case 'cancel':
                    finish(null);
                    return;
                case 'escape-start':
                    // Bare escape byte — wait briefly to see if it's an arrow sequence.
                    escapeTimeout = setTimeout(() => finish(null), ESCAPE_TIMEOUT_MS);
                    return;
                default:
                    return;
            }
        };
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
        try {
            stdin.setRawMode(true);
        }
        catch {
            cleanup();
            resolve(null);
            return;
        }
        stdin.resume();
        stdout.write(ANSI.hide);
        render();
        stdin.on('data', onKey);
    });
}
/**
 * Interactive yes/no confirmation built on {@link ttySelect}.
 * Defaults the cursor to "No" for safety. Cancel (esc/ctrl-c) resolves false.
 */
export async function ttyConfirm(message) {
    const result = await ttySelect([
        { label: 'No', value: false },
        { label: 'Yes', value: true }
    ], { message });
    return result ?? false;
}
