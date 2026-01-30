/**
 * Simple Logger utility to capture console logs for feedback reports.
 * It maintains a circular buffer of the most recent logs.
 */

type LogEntry = {
    timestamp: number;
    level: 'log' | 'warn' | 'error' | 'info';
    message: string;
};

class Logger {
    private static instance: Logger;
    private logs: LogEntry[] = [];
    private readonly maxLogs = 1000;
    private originalConsole: Partial<Console> = {};

    private constructor() {
        this.init();
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private init() {
        if (typeof window === 'undefined') return;

        const levels: Array<keyof Console & ('log' | 'warn' | 'error' | 'info')> = ['log', 'warn', 'error', 'info'];

        levels.forEach(level => {
            this.originalConsole[level] = console[level].bind(console);
            (console as any)[level] = (...args: any[]) => {
                this.addLog(level, args);
                if (this.originalConsole[level]) {
                    this.originalConsole[level]!(...args);
                }
            };
        });
    }

    private addLog(level: LogEntry['level'], args: any[]) {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        this.logs.push({
            timestamp: Date.now(),
            level,
            message
        });

        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
    }

    public getLogs(): string {
        return this.logs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            return `[${time}] [${log.level.toUpperCase()}] ${log.message}`;
        }).join('\n');
    }

    public clear() {
        this.logs = [];
    }
}

export const logger = Logger.getInstance();
