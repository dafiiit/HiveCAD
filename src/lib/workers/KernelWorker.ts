/**
 * The CAD kernel worker.
 *
 * Exactly one worker, deliberately — not a pool. OpenCascade shapes are C++ heap
 * objects that cannot cross a worker boundary, and OCCT is single-threaded per
 * instance. A pool hands each task whichever worker is idle, so consecutive runs
 * land in different kernel contexts and there is nowhere to cache a shape. It
 * also pays for one full OCCT instance per core.
 *
 * Tasks run strictly FIFO against a single long-lived kernel context.
 */

/** A task is abandoned if the worker goes this long without saying anything. */
const TASK_TIMEOUT_MS = 300_000;

/** Message types that complete a task. Anything else is treated as progress. */
const TERMINAL_SUCCESS = new Set(['SUCCESS', 'EXPORT_SUCCESS', 'IMPORT_SUCCESS']);

export interface KernelTask {
    type: string;
    [key: string]: unknown;
}

interface PendingTask {
    task: KernelTask;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    onProgress?: (data: any) => void;
}

export class KernelWorker {
    private worker: Worker | null = null;
    private queue: PendingTask[] = [];
    private inFlight: PendingTask | null = null;
    private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly taskTimeoutMs: number = TASK_TIMEOUT_MS) { }

    execute(task: KernelTask, onProgress?: (data: any) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject, onProgress });
            this.pump();
        });
    }

    terminate() {
        this.disposeWorker();
        const abandoned = new Error('CAD kernel worker terminated');
        this.inFlight?.reject(abandoned);
        this.inFlight = null;
        this.queue.splice(0).forEach(t => t.reject(abandoned));
        this.clearTimeout();
    }

    // ── Worker lifecycle ────────────────────────────────────────────────────

    private ensureWorker(): Worker {
        if (this.worker) return this.worker;

        const worker = new Worker(
            new URL('../../workers/replicad-worker.ts', import.meta.url),
            { type: 'module' }
        );
        worker.addEventListener('message', this.handleMessage);
        worker.addEventListener('error', this.handleCrash);
        worker.addEventListener('messageerror', this.handleCrash);
        this.worker = worker;
        return worker;
    }

    /**
     * A trapped WASM instance cannot be reused: emscripten's abort() poisons the
     * module and every subsequent call throws. Drop the worker; the next task
     * lazily builds a fresh kernel.
     */
    private disposeWorker() {
        if (!this.worker) return;
        this.worker.removeEventListener('message', this.handleMessage);
        this.worker.removeEventListener('error', this.handleCrash);
        this.worker.removeEventListener('messageerror', this.handleCrash);
        this.worker.terminate();
        this.worker = null;
    }

    // ── Scheduling ──────────────────────────────────────────────────────────

    private pump() {
        if (this.inFlight || this.queue.length === 0) return;

        this.inFlight = this.queue.shift()!;
        this.armTimeout();
        this.ensureWorker().postMessage(this.inFlight.task);
    }

    private settle(outcome: () => void) {
        this.inFlight = null;
        this.clearTimeout();
        outcome();
        this.pump();
    }

    // ── Timeout ─────────────────────────────────────────────────────────────

    /**
     * Re-armed on every inbound message, so a long import that reports progress
     * is never killed. Only true silence — a trap, or an infinite loop in user
     * code — trips it.
     */
    private armTimeout() {
        this.clearTimeout();
        this.timeoutHandle = setTimeout(this.handleTimeout, this.taskTimeoutMs);
    }

    private clearTimeout() {
        if (this.timeoutHandle === null) return;
        clearTimeout(this.timeoutHandle);
        this.timeoutHandle = null;
    }

    private handleTimeout = () => {
        const task = this.inFlight;
        if (!task) return;
        this.disposeWorker();
        this.settle(() => task.reject(
            new Error(`CAD kernel did not respond within ${Math.round(this.taskTimeoutMs / 1000)}s`)
        ));
    };

    // ── Worker events ───────────────────────────────────────────────────────

    private handleMessage = (event: MessageEvent) => {
        const task = this.inFlight;
        if (!task) return;

        const { type } = event.data ?? {};

        if (TERMINAL_SUCCESS.has(type)) {
            this.settle(() => task.resolve(event.data));
            return;
        }

        if (type === 'ERROR') {
            // A reported error means the kernel caught it and is still healthy —
            // this is what the exceptions-enabled WASM build buys us. Keep the
            // worker; only crashes recycle it.
            this.settle(() => task.reject(new Error(event.data.error || 'Unknown kernel error')));
            return;
        }

        this.armTimeout();
        task.onProgress?.(event.data);
    };

    /**
     * An uncaught throw inside the worker, or a structured-clone failure. The
     * kernel context is not trustworthy afterward, so recycle it.
     */
    private handleCrash = (event: ErrorEvent | MessageEvent) => {
        // Keep the failure local; it is already surfaced through the task promise.
        event.preventDefault();

        const detail = (event as ErrorEvent).message || 'CAD kernel worker crashed';
        const task = this.inFlight;
        this.disposeWorker();

        if (!task) return;
        this.settle(() => task.reject(new Error(detail)));
    };
}

let kernelWorker: KernelWorker | null = null;

/** Returns null where Workers are unavailable (SSR, node test env). */
export function getKernelWorker(): KernelWorker | null {
    if (kernelWorker) return kernelWorker;
    if (typeof Worker === 'undefined') return null;

    kernelWorker = new KernelWorker();
    return kernelWorker;
}
