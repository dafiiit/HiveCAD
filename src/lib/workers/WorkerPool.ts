export class WorkerPool {
    private workers: { worker: Worker; busy: boolean }[] = [];
    private queue: Array<{
        task: any;
        resolve: (value: any) => void;
        reject: (error: any) => void;
        onProgress?: (data: any) => void;
    }> = [];

    constructor(private maxWorkers = navigator.hardwareConcurrency || 4) {
        for (let i = 0; i < maxWorkers; i++) {
            this.workers.push({
                worker: this.createWorker(),
                busy: false
            });
        }
    }

    private createWorker(): Worker {
        return new Worker(
            new URL('../../workers/replicad-worker.ts', import.meta.url),
            { type: 'module' }
        );
    }

    async execute(task: any, onProgress?: (data: any) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject, onProgress });
            this.processQueue();
        });
    }

    private processQueue() {
        if (this.queue.length === 0) return;

        const idleWorkerItem = this.workers.find(w => !w.busy);
        if (!idleWorkerItem) return;

        const { task, resolve, reject, onProgress } = this.queue.shift()!;
        idleWorkerItem.busy = true;
        const worker = idleWorkerItem.worker;

        const handler = (e: MessageEvent) => {
            const { type } = e.data;

            if (type === 'SUCCESS' || type === 'EXPORT_SUCCESS' || type === 'IMPORT_SUCCESS') {
                worker.removeEventListener('message', handler);
                idleWorkerItem.busy = false;
                resolve(e.data);
                this.processQueue();
            } else if (type === 'ERROR') {
                worker.removeEventListener('message', handler);
                idleWorkerItem.busy = false;
                reject(new Error(e.data.error || 'Unknown worker error'));
                this.processQueue();
            } else if (onProgress) {
                // Handle progress or other non-terminal messages
                onProgress(e.data);
            }
        };

        worker.addEventListener('message', handler);
        worker.postMessage(task);
    }

    terminate() {
        this.workers.forEach(w => w.worker.terminate());
        this.workers = [];
    }
}

// Singleton instance for the application
export const replicadWorkerPool = new WorkerPool();
