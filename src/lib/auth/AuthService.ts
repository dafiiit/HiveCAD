/**
 * Mock AuthService to simulate server-side authentication and storage.
 * In a real application, this would interact with a secure backend.
 */
export class AuthService {
    private static USER_STORAGE_KEY = 'hivecad_users';
    private static SESSION_KEY = 'hivecad_current_user';

    static async signup(email: string, password: string): Promise<any> {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));

        const users = this.getUsers();
        if (users[email]) {
            throw new Error('User already exists');
        }

        // In a real app, hash the password!
        users[email] = { email, password, pat: null };
        this.saveUsers(users);

        const userData = { email };
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(userData));
        return userData;
    }

    static async login(email: string, password: string): Promise<any> {
        await new Promise(resolve => setTimeout(resolve, 800));

        const users = this.getUsers();
        const user = users[email];

        if (!user || user.password !== password) {
            throw new Error('Invalid email or password');
        }

        const userData = { email, pat: user.pat };
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(userData));
        return userData;
    }

    static async updatePAT(email: string, pat: string | null): Promise<void> {
        const users = this.getUsers();
        if (users[email]) {
            users[email].pat = pat;
            this.saveUsers(users);
        }
    }

    static getCurrentUser(): any | null {
        const data = localStorage.getItem(this.SESSION_KEY);
        return data ? JSON.parse(data) : null;
    }

    static logout(): void {
        localStorage.removeItem(this.SESSION_KEY);
    }

    private static getUsers(): Record<string, any> {
        const data = localStorage.getItem(this.USER_STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    }

    private static saveUsers(users: Record<string, any>): void {
        localStorage.setItem(this.USER_STORAGE_KEY, JSON.stringify(users));
    }
}
