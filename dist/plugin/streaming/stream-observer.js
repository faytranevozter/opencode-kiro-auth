export const STREAM_TERMINAL_SOURCES = [
    'clean_eof_without_completion_metadata',
    'completion_metadata_received',
    'iterator_failure',
    'semantic_truncation',
    'caller_abort',
    'stream_attempt_budget_exhausted',
    'stream_processing_failure'
];
export const REQUEST_TERMINAL_SOURCES = [
    ...STREAM_TERMINAL_SOURCES,
    'http_error',
    'network_error',
    'request_error'
];
/**
 * Observes ONE stream attempt's ingestion-time signals for the recovery tier
 * decision. Observation only: the transformer never reads it back, so attaching
 * an observer cannot change a single emitted chunk.
 *
 * Read it AFTER the attempt ends — successfully or by iterator failure. The
 * whole point is that `sawToolIntent` is already true when a stream dies before
 * the transformer's end-of-stream tool flush, which is exactly the case where
 * naive replay would double-execute a tool.
 */
export class StreamObserver {
    rawToolIntentSeen = false;
    openRawToolIntents = new Set();
    anonymousRawToolIntent = false;
    dialectToolIntentSeen = false;
    dialectToolIntentOpen = false;
    phase = 'none';
    dialect = false;
    markerIndex = null;
    markerInCodeRegion = null;
    resolution = 'not_finalized';
    rawEventTypeCounts = {};
    terminal = null;
    noteRawEvent(event) {
        if (typeof event !== 'object' || event === null) {
            this.rawEventTypeCounts.unknown = (this.rawEventTypeCounts.unknown ?? 0) + 1;
            return;
        }
        const record = event;
        const eventTypes = Object.keys(record).filter((key) => key.endsWith('Event') && record[key] !== undefined);
        if (eventTypes.length === 0)
            eventTypes.push('unknown');
        for (const eventType of eventTypes) {
            this.rawEventTypeCounts[eventType] = (this.rawEventTypeCounts[eventType] ?? 0) + 1;
        }
    }
    /** A raw SDK tool sequence advanced; only `stop: true` closes that sequence. */
    noteRawToolIntent(toolUseId, closed) {
        this.rawToolIntentSeen = true;
        if (toolUseId) {
            if (closed)
                this.openRawToolIntents.delete(toolUseId);
            else
                this.openRawToolIntents.add(toolUseId);
            return;
        }
        this.anonymousRawToolIntent = !closed;
    }
    noteDialectGateActive() {
        this.dialect = true;
    }
    noteDialectMarker(index, inCodeRegion) {
        this.markerIndex = index;
        this.markerInCodeRegion = inCodeRegion;
    }
    noteTerminalSource(source) {
        // Semantic truncation is more specific than the typed iterator wrapper used
        // to propagate it through the retry machinery; do not erase that decision.
        if (this.terminal === 'semantic_truncation' && source === 'iterator_failure')
            return;
        this.terminal = source;
    }
    /** Synchronize the currently observable non-code-region dialect marker. */
    noteDialectToolIntent(present) {
        this.dialectToolIntentSeen = present;
        this.dialectToolIntentOpen = present;
    }
    /** Records whether finalization resolved every non-code-region opening marker. */
    noteDialectToolResolution(resolution) {
        this.resolution = resolution;
        switch (resolution) {
            case 'none':
                this.dialectToolIntentSeen = false;
                this.dialectToolIntentOpen = false;
                return;
            case 'complete':
                this.dialectToolIntentSeen = true;
                this.dialectToolIntentOpen = false;
                return;
            case 'incomplete':
                this.dialectToolIntentSeen = true;
                this.dialectToolIntentOpen = true;
                return;
        }
    }
    /** A reasoning/thinking block opened (native reasoning run or inline tag). */
    noteReasoningStarted() {
        this.phase = 'active';
    }
    /** The open reasoning/thinking block closed. Never downgrades `none`. */
    noteReasoningEnded() {
        if (this.phase === 'active')
            this.phase = 'ended';
    }
    get sawToolIntent() {
        return this.rawToolIntentSeen || this.dialectToolIntentSeen;
    }
    get hasOpenToolIntent() {
        return (this.openRawToolIntents.size > 0 || this.anonymousRawToolIntent || this.dialectToolIntentOpen);
    }
    get reasoningPhase() {
        return this.phase;
    }
    get dialectActive() {
        return this.dialect;
    }
    snapshot() {
        return {
            sawToolIntent: this.sawToolIntent,
            hasOpenToolIntent: this.hasOpenToolIntent,
            reasoningPhase: this.phase,
            dialectActive: this.dialect,
            dialectMarkerIndex: this.markerIndex,
            dialectMarkerInCodeRegion: this.markerInCodeRegion,
            dialectResolution: this.resolution,
            eventTypeCounts: { ...this.rawEventTypeCounts },
            terminalSource: this.terminal
        };
    }
}
