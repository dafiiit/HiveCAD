import React, { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { Commit } from '@/lib/vcs/types';
import { formatDistanceToNow } from 'date-fns';
import { User, Clock, ChevronRight, Check, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VCSGraphProps {
    commits: Commit[];
    currentCommitId?: string;
    onCheckout?: (commitId: string) => void;
    compact?: boolean;
}

const LANE_WIDTH = 10;
const BRANCH_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
];

export const VCSGraph: React.FC<VCSGraphProps> = ({
    commits,
    currentCommitId,
    onCheckout,
    compact = false
}) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [paths, setPaths] = useState<{ d: string; color: string }[]>([]);

    // Process commits into nodes and lanes
    const { nodes, lanes } = useMemo(() => {
        if (commits.length === 0) return { nodes: [], lanes: new Map() };

        const sorted = [...commits].sort((a, b) => a.timestamp - b.timestamp);
        const branchToLane = new Map<string, number>();
        let nextLane = 0;

        const processedNodes = sorted.map(commit => {
            if (!branchToLane.has(commit.branchName)) {
                branchToLane.set(commit.branchName, nextLane++);
            }
            return {
                commit,
                lane: branchToLane.get(commit.branchName)!
            };
        }).reverse();

        return { nodes: processedNodes, lanes: branchToLane };
    }, [commits]);

    // Update SVG paths based on DOM positions
    useLayoutEffect(() => {
        if (!containerRef.current || nodes.length === 0) return;

        const newPaths: { d: string; color: string }[] = [];
        const dotElements = containerRef.current.querySelectorAll('[data-dot-id]');
        const dotsMap = new Map<string, { x: number; y: number; lane: number }>();

        dotElements.forEach(el => {
            const id = el.getAttribute('data-dot-id')!;
            const lane = parseInt(el.getAttribute('data-lane')!);
            const rect = el.getBoundingClientRect();
            const parentRect = containerRef.current!.getBoundingClientRect();
            dotsMap.set(id, {
                x: rect.left - parentRect.left + rect.width / 2,
                y: rect.top - parentRect.top + rect.height / 2,
                lane
            });
        });

        nodes.forEach(node => {
            if (node.commit.parentId) {
                const currentDot = dotsMap.get(node.commit.id);
                const parentDot = dotsMap.get(node.commit.parentId);

                if (currentDot && parentDot) {
                    const color = BRANCH_COLORS[node.lane % BRANCH_COLORS.length];
                    const x1 = currentDot.x;
                    const y1 = currentDot.y;
                    const x2 = parentDot.x;
                    const y2 = parentDot.y;

                    // Unified smooth connection using cubic Bezier
                    const controlY1 = y1 + (y2 - y1) * 0.4;
                    const controlY2 = y1 + (y2 - y1) * 0.6;
                    const d = `M ${x1} ${y1} C ${x1} ${controlY1}, ${x2} ${controlY2}, ${x2} ${y2}`;

                    newPaths.push({ d, color });
                }
            }
        });

        setPaths(newPaths);
    }, [nodes, expandedId]);

    const totalWidth = lanes.size * LANE_WIDTH + 40;

    return (
        <div ref={containerRef} className="relative font-sans text-zinc-300 w-full overflow-x-hidden">
            {/* SVG Layer */}
            <svg
                className="absolute left-0 top-0 pointer-events-none w-full h-full"
                style={{ zIndex: 0 }}
            >
                {paths.map((path, i) => (
                    <path
                        key={i}
                        d={path.d}
                        stroke={path.color}
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        className="opacity-40"
                    />
                ))}
            </svg>

            {/* List of nodes */}
            <div className="relative flex flex-col space-y-3 py-2">
                {nodes.map((node) => {
                    const isCurrent = node.commit.id === currentCommitId;
                    const isExpanded = expandedId === node.commit.id;
                    const color = BRANCH_COLORS[node.lane % BRANCH_COLORS.length];

                    return (
                        <div key={node.commit.id} className="relative flex items-start min-h-[28px]">
                            {/* Dot container aligned with lane */}
                            <div
                                className="absolute flex items-center justify-center p-1 cursor-pointer transition-transform hover:scale-125 z-10"
                                style={{ left: node.lane * LANE_WIDTH + 4, top: 4 }}
                                data-dot-id={node.commit.id}
                                data-lane={node.lane}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedId(isExpanded ? null : node.commit.id);
                                    if (!isExpanded) onCheckout?.(node.commit.id);
                                }}
                            >
                                <div
                                    className={cn(
                                        "w-2 h-2 rounded-full border border-background shadow-sm transition-all",
                                        isCurrent ? "scale-125 border-white ring-2 ring-white/20" : "opacity-80"
                                    )}
                                    style={{ backgroundColor: color }}
                                />
                            </div>

                            {/* Card content */}
                            <div
                                className={cn(
                                    "flex-1 transition-all cursor-pointer rounded-md border ml-20 mr-2 min-w-0",
                                    isCurrent ? "bg-zinc-800/90 border-zinc-700 shadow-md ring-1 ring-white/5" : "bg-zinc-900/40 border-transparent hover:bg-zinc-800/60 hover:border-zinc-800",
                                    isExpanded && "bg-zinc-800 border-zinc-600 shadow-xl z-20"
                                )}
                                onClick={() => setExpandedId(isExpanded ? null : node.commit.id)}
                            >
                                <div className="p-2 px-3 flex items-center justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className={cn(
                                            "text-xs font-medium text-zinc-100",
                                            !isExpanded && "truncate"
                                        )}>
                                            {node.commit.message}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {isCurrent && (
                                            <Badge variant="secondary" className="h-3.5 px-1 text-[7px] bg-blue-500/20 text-blue-400 border-blue-500/10 font-bold uppercase transition-all">
                                                Active
                                            </Badge>
                                        )}
                                        <Badge
                                            variant="outline"
                                            className="h-3.5 px-1 py-0 text-[8px] border-none rounded-sm bg-zinc-950/40 text-zinc-500 font-mono"
                                            style={{ color: isExpanded ? color : undefined }}
                                        >
                                            {node.commit.branchName}
                                        </Badge>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-3 pb-3 pt-2 border-t border-zinc-700/50 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="flex flex-col space-y-3 mb-3">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <div className="flex items-center gap-1.5 text-zinc-400">
                                                    <User className="w-3 h-3 opacity-60" />
                                                    <span className="font-semibold text-zinc-200">{node.commit.author}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-zinc-500">
                                                    <Clock className="w-3 h-3 opacity-40" />
                                                    <span>{formatDistanceToNow(node.commit.timestamp, { addSuffix: true })}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="text-[9px] font-mono text-zinc-600 bg-black/40 px-1.5 py-0.5 rounded">
                                                    {node.commit.id.substring(0, 8)}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-6 text-[10px] gap-1 px-2 hover:bg-zinc-700 hover:text-white"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onCheckout?.(node.commit.id);
                                                    }}
                                                >
                                                    <ChevronRight className="w-3 h-3" />
                                                    Checkout
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
