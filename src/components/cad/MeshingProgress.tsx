import React from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

export const MeshingProgress = () => {
    const meshingProgress = useCADStore(state => state.meshingProgress);

    if (!meshingProgress) return null;

    const { stage, progress, id } = meshingProgress;

    return (
        <div className="absolute top-24 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
            <div className="bg-background/90 backdrop-blur-md border border-border/50 rounded-xl p-4 shadow-2xl w-64 border-l-4 border-l-primary">
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 leading-none mb-1">
                            {stage === 'faces' ? 'Calculating Faces' : 'Extracting Edges'}
                        </h4>
                        <p className="text-xs font-semibold truncate text-foreground">
                            {id}
                        </p>
                    </div>
                </div>

                <Progress value={progress} className="h-1.5 mb-2 bg-primary/20" />

                <div className="flex justify-end items-center">
                    <span className="text-xs font-bold text-primary tabular-nums">
                        {progress}%
                    </span>
                </div>
            </div>
        </div>
    );
};
