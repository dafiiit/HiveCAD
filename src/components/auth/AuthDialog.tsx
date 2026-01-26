import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useCADStore } from '@/hooks/useCADStore';
import { toast } from 'sonner';
import { Github, Mail, Key, LogIn, UserPlus, ArrowRight } from 'lucide-react';

export function AuthDialog() {
    const { login, signup, authLoaded } = useCADStore();
    const [step, setStep] = useState<'welcome' | 'auth'>('welcome');
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    if (!authLoaded) return null;

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === 'signup') {
                await signup(email, password);
            } else {
                await login(email, password);
            }
            toast.success(mode === 'signup' ? 'Account created!' : 'Logged in!');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-6 overflow-y-auto">
            <div className="w-full max-w-md">
                {step === 'welcome' && (
                    <div className="space-y-12 animate-in fade-in zoom-in-95 duration-500">
                        <div className="text-center space-y-6">
                            <div className="mx-auto w-48 h-48 relative flex items-center justify-center">
                                <div className="absolute inset-0 bg-primary/40 rounded-full blur-3xl animate-pulse" />
                                <div className="relative z-10 w-44 h-44 flex items-center justify-center animate-bounce-slow">
                                    <img src="/favicon.ico" alt="HiveCAD Logo" className="w-40 h-40 object-contain drop-shadow-[0_0_35px_#1565c0]" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-4xl font-bold tracking-tighter text-white">HiveCAD</h2>
                                <p className="text-zinc-500 text-lg">The federated architecture for engineers.</p>
                            </div>
                        </div>
                        <div className="grid gap-4 max-w-xs mx-auto">
                            <Button className="h-12 text-base bg-primary hover:bg-primary/90 text-white border-none shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all hover:scale-105" onClick={() => { setMode('signup'); setStep('auth'); }}>
                                <UserPlus className="mr-2 w-5 h-5" /> Create Account
                            </Button>
                            <Button variant="ghost" className="h-12 text-base text-zinc-400 hover:text-white hover:bg-white/5 transition-colors" onClick={() => { setMode('login'); setStep('auth'); }}>
                                <LogIn className="mr-2 w-5 h-5" /> Sign In
                            </Button>
                        </div>
                    </div>
                )}

                {step === 'auth' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
                        <div className="text-center space-y-2">
                            <div className="mx-auto w-16 h-16 mb-4">
                                <img src="/favicon.ico" alt="HiveCAD Logo" className="w-full h-full object-contain" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-white">{mode === 'signup' ? 'Create Account' : 'Welcome Back'}</h2>
                            <p className="text-zinc-500">{mode === 'signup' ? 'Join the federated engineering community.' : 'Enter your credentials to continue.'}</p>
                        </div>

                        <div className="flex justify-center">
                            <Button
                                variant="outline"
                                className="w-full h-12 bg-white/5 border-zinc-800 hover:bg-white/10 text-white flex items-center justify-center gap-3"
                                onClick={() => useCADStore.getState().signInWithOAuth('github')}
                            >
                                <Github className="w-5 h-5" />
                                <span>Continue with GitHub</span>
                            </Button>
                        </div>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-zinc-800" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-black px-2 text-zinc-500">Or continue with email</span>
                            </div>
                        </div>

                        <form onSubmit={handleAuth} className="space-y-4">
                            <div className="space-y-4">
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                                    <Input
                                        type="email"
                                        placeholder="Email"
                                        className="h-12 pl-12 bg-white/5 border-zinc-800 text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary transition-all"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="relative">
                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                                    <Input
                                        type="password"
                                        placeholder="Password"
                                        className="h-12 pl-12 bg-white/5 border-zinc-800 text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary transition-all"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <Button className="w-full h-12 text-lg font-medium shadow-[0_0_20px_rgba(var(--primary),0.2)]" type="submit" disabled={loading}>
                                {loading ? 'Processing...' : (mode === 'signup' ? 'Sign Up' : 'Sign In')}
                                <ArrowRight className="ml-2 w-5 h-5" />
                            </Button>
                        </form>

                        <div className="text-center">
                            <button type="button" className="text-sm text-zinc-500 hover:text-primary transition-colors hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
                                {mode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
