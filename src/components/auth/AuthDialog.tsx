import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useGlobalStore } from '@/store/useGlobalStore';
import { toast } from 'sonner';
import { Github, Mail, Key, LogIn, UserPlus, ArrowRight, ExternalLink, Info, CheckCircle2 } from 'lucide-react';

export function AuthDialog({ forcePAT = false }: { forcePAT?: boolean }) {
    const { login, signup, authLoaded, user, setPAT } = useGlobalStore();
    const [step, setStep] = useState<'welcome' | 'auth' | 'pat'>('welcome');
    const [patSubStep, setPatSubStep] = useState<'get' | 'verify'>('get');
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (forcePAT) {
            setStep('pat');
        }
    }, [forcePAT]);

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
            // After successful auth, if no PAT, move to PAT step
            if (!user?.pat) {
                setStep('pat');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyPAT = async () => {
        if (!token) return;
        setLoading(true);
        try {
            await setPAT(token);
            toast.success("GitHub PAT verified and saved!");
            // Initialize UI store to load global settings
            const { useUIStore } = await import('@/store/useUIStore');
            useUIStore.getState().initialize();
        } catch (error: any) {
            toast.error(error.message || "Failed to verify token.");
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
                                    <img src="/logo-transparent.png" alt="HiveCAD Logo" className="w-40 h-40 object-contain drop-shadow-[0_0_35px_#1565c0]" />
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
                                <img src="/logo-transparent.png" alt="HiveCAD Logo" className="w-full h-full object-contain" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-white">{mode === 'signup' ? 'Create Account' : 'Welcome Back'}</h2>
                            <p className="text-zinc-500">{mode === 'signup' ? 'Join the federated engineering community.' : 'Enter your credentials to continue.'}</p>
                        </div>

                        <div className="flex justify-center">
                            <Button
                                variant="outline"
                                className="w-full h-12 bg-white/5 border-zinc-800 hover:bg-white/10 text-white flex items-center justify-center gap-3"
                                onClick={() => useGlobalStore.getState().signInWithOAuth('github')}
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

                {step === 'pat' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
                        <div className="text-center space-y-2">
                            <div className="mx-auto w-16 h-16 mb-4">
                                <img src="/logo-transparent.png" alt="HiveCAD Logo" className="w-full h-full object-contain" />
                            </div>
                            <h2 className="text-2xl font-bold tracking-tight text-white">Link your GitHub</h2>
                            <p className="text-zinc-500">HiveCAD is decentralized. Your designs stay in your GitHub.</p>
                        </div>

                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6">
                            <div className="flex items-center justify-between px-2">
                                <div className="flex flex-col items-center gap-2">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${patSubStep === 'get' ? 'bg-primary text-white scale-110 shadow-[0_0_15px_rgba(var(--primary),0.5)]' : 'bg-zinc-800 text-zinc-500'}`}>
                                        <Key className="w-5 h-5" />
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${patSubStep === 'get' ? 'text-primary' : 'text-zinc-600'}`}>1. Get Token</span>
                                </div>
                                <div className="flex-1 h-px bg-zinc-800 mx-4" />
                                <div className="flex flex-col items-center gap-2">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${patSubStep === 'verify' ? 'bg-primary text-white scale-110 shadow-[0_0_15px_rgba(var(--primary),0.5)]' : 'bg-zinc-800 text-zinc-500'}`}>
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${patSubStep === 'verify' ? 'text-primary' : 'text-zinc-600'}`}>2. Verify</span>
                                </div>
                            </div>

                            {patSubStep === 'get' ? (
                                <div className="space-y-6">
                                    <div className="flex items-start gap-4 p-4 bg-primary/5 border border-primary/10 rounded-xl">
                                        <Info className="w-6 h-6 text-primary shrink-0" />
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            Provide your Personal Access Token (PAT) to initialize a github repository called <strong className="text-zinc-200">hivecad-projects</strong> where all your collaborative designs will be stored, ensuring they remain decentralized and under your control.
                                        </p>
                                    </div>

                                    <Button
                                        className="w-full h-14 text-lg bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(var(--primary),0.3)]"
                                        onClick={async () => {
                                            const url = "https://github.com/settings/tokens/new?description=HiveCAD%20Storage&scopes=repo,user";
                                            try {
                                                const { getPlatformApi } = await import('@/lib/platform');
                                                const platform = await getPlatformApi();
                                                await platform.openUrl(url);
                                            } catch (error) {
                                                // Fallback to window.open for web
                                                window.open(url, '_blank');
                                            }
                                            setPatSubStep('verify');
                                        }}
                                    >
                                        <Github className="mr-2 w-6 h-6" />
                                        Get GitHub Token
                                        <ExternalLink className="ml-2 w-4 h-4 opacity-50" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                                        <Input
                                            type="password"
                                            placeholder="ghp_..."
                                            className="h-14 pl-12 bg-black border-zinc-800 text-white placeholder:text-zinc-600 focus:ring-primary focus:border-primary transition-all rounded-xl"
                                            value={token}
                                            onChange={e => setToken(e.target.value)}
                                            autoFocus
                                        />
                                    </div>

                                    <div className="flex gap-3">
                                        <Button
                                            variant="ghost"
                                            className="flex-1 h-12 text-zinc-500 hover:text-white hover:bg-white/5"
                                            onClick={() => setPatSubStep('get')}
                                        >
                                            Back
                                        </Button>
                                        <Button
                                            className="flex-[2] h-12 bg-primary hover:bg-primary/90 text-white shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                                            onClick={handleVerifyPAT}
                                            disabled={!token || loading}
                                        >
                                            {loading ? 'Verifying...' : 'Verify & Continue'}
                                            <ArrowRight className="ml-2 w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!forcePAT && (
                            <div className="text-center">
                                <button
                                    className="text-sm text-zinc-500 hover:text-primary transition-colors hover:underline"
                                    onClick={() => setStep('welcome')}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
