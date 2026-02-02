import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingScreenProps {
    message?: string;
    className?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ message, className }) => {
    return (
        <div className={cn(
            "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-md transition-all animate-in fade-in duration-500",
            className
        )}>
            <div className="relative">
                {/* Outer Glow Pulse */}
                <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-2xl animate-pulse scale-150" />

                {/* Logo with scaling pulse */}
                <div className="relative animate-logo-pulse">
                    <img
                        src="/logo-transparent.png"
                        alt="HiveCAD Logo"
                        className="w-24 h-24 rounded-2xl shadow-2xl border border-primary/20"
                    />
                </div>
            </div>

            {message && (
                <p className="mt-8 text-zinc-400 font-bold uppercase tracking-widest text-xs animate-pulse">
                    {message}
                </p>
            )}

            <style>{`
                @keyframes logo-pulse {
                    0% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0 rgba(251, 191, 36, 0)); }
                    50% { transform: scale(1.05); filter: brightness(1.2) drop-shadow(0 0 20px rgba(251, 191, 36, 0.3)); }
                    100% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 0 rgba(251, 191, 36, 0)); }
                }
                .animate-logo-pulse {
                    animation: logo-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}</style>
        </div>
    );
};
