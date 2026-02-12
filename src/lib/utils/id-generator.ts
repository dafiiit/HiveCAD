let counter = 0;
let testSeed = 'mock-id';

function isTestEnv(): boolean {
    return typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
}

function fallbackRandomId(): string {
    counter += 1;
    return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export const ID = {
    generate(): string {
        if (isTestEnv()) {
            counter += 1;
            return `${testSeed}-${counter}`;
        }

        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        return fallbackRandomId();
    },

    generatePrefixed(prefix: string): string {
        return `${prefix}_${this.generate()}`;
    },

    reset(seed = 'mock-id'): void {
        counter = 0;
        testSeed = seed;
    },
};
