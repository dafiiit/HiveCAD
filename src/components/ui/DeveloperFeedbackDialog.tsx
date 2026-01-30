import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Github, MessageSquareWarning, Terminal, ExternalLink, Check, ChevronsUpDown, Search, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { logger } from "@/lib/utils/Logger";
import { StorageManager } from "@/lib/storage/StorageManager";
import { cn } from "@/lib/utils";
import { CloudConnectionsDialog } from "@/components/ui/CloudConnectionsDialog";

interface DeveloperFeedbackDialogProps {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const TOOL_AREAS = [
    {
        label: "General & Navigation",
        items: [
            { value: "general", label: "General UI/UX" },
            { value: "navigation", label: "Navigation (Orbit, Pan, Zoom)" },
            { value: "dashboard", label: "Dashboard & Projects" },
            { value: "github", label: "Cloud Sync & GitHub" },
            { value: "rendering", label: "Performance & Rendering" },
            { value: "extensions", label: "Extensions Store" },
        ]
    },
    {
        label: "3D Design Tools",
        items: [
            { value: "extrude", label: "Extrude" },
            { value: "revolve", label: "Revolve" },
            { value: "box", label: "Box Primitive" },
            { value: "cylinder", label: "Cylinder Primitive" },
            { value: "sphere", label: "Sphere Primitive" },
            { value: "torus", label: "Torus Primitive" },
            { value: "coil", label: "Coil Primitive" },
            { value: "move", label: "Move" },
            { value: "rotate", label: "Rotate" },
            { value: "scale", label: "Scale" },
            { value: "copy", label: "Copy / Duplicate" },
            { value: "delete", label: "Delete" },
            { value: "join", label: "Boolean Join" },
            { value: "cut", label: "Boolean Cut" },
            { value: "intersect", label: "Boolean Intersect" },
            { value: "plane", label: "Construction Planes" },
            { value: "axis", label: "Construction Axes" },
            { value: "point", label: "Construction Points" },
            { value: "measure", label: "Measure Tool" },
            { value: "analyze", label: "Analysis Tools" },
        ]
    },
    {
        label: "Sketch Tools",
        items: [
            { value: "line", label: "Line" },
            { value: "rectangle", label: "Rectangle" },
            { value: "circle", label: "Circle" },
            { value: "arc", label: "Arc (3-Point, Tangent, Sagitta)" },
            { value: "ellipse", label: "Ellipse" },
            { value: "polygon", label: "Polygon" },
            { value: "spline", label: "Spline / Bezier" },
            { value: "trim", label: "Trim Tool" },
            { value: "dimension", label: "Dimension Tool" },
            { value: "constraints", label: "Geometric Constraints" },
            { value: "finish-sketch", label: "Finish Sketch" },
        ]
    },
    {
        label: "Code & Logic",
        items: [
            { value: "editor", label: "Code Editor" },
            { value: "parameters", label: "Parameters Panel" },
            { value: "pattern", label: "Pattern Tool" },
        ]
    }
];

export const DeveloperFeedbackDialog: React.FC<DeveloperFeedbackDialogProps> = ({ children, open, onOpenChange }) => {
    const [area, setArea] = useState("general");
    const [type, setType] = useState<string>("bug");
    const [description, setDescription] = useState("");
    const [email, setEmail] = useState("");
    const [logs, setLogs] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [areaPopoverOpen, setAreaPopoverOpen] = useState(false);

    const [isConnectionOpen, setIsConnectionOpen] = useState(false);

    const handleAttachLogs = () => {
        const currentLogs = logger.getLogs();
        setLogs(currentLogs);
        toast.success("Logs Attached", {
            description: "Current session logs have been added to the report.",
        });
    };

    const findAreaLabel = (val: string) => {
        for (const group of TOOL_AREAS) {
            const item = group.items.find(i => i.value === val);
            if (item) return item.label;
        }
        return "Select software area...";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const adapter = StorageManager.getInstance().currentAdapter;

        // Check authentication first
        if (!adapter.isAuthenticated()) {
            toast.error("Authentication Required", {
                description: "Please connect to GitHub to submit feedback.",
            });
            setIsConnectionOpen(true);
            return;
        }

        if (!area) {
            toast.error("Validation Error", {
                description: "Please select which part of the software this is about.",
            });
            return;
        }

        if (!type) {
            toast.error("Validation Error", {
                description: "Please select a feedback type.",
            });
            return;
        }

        if (!description.trim()) {
            toast.error("Validation Error", {
                description: "Please describe the feedback or error.",
            });
            return;
        }

        setIsSubmitting(true);

        try {
            if (!adapter.createIssue) {
                throw new Error("Feedback submission is not supported by the current storage adapter.");
            }

            const areaLabel = findAreaLabel(area);
            const title = `[${type.toUpperCase()}] ${areaLabel}: ${description.slice(0, 50)}${description.length > 50 ? '...' : ''}`;
            const body = `
### Software Area / Tool
${areaLabel} (${area})

### Type
${type}

### Description
${description}

### Contact Email
${email || 'Not provided'}

### Console Logs
\`\`\`
${logs || 'No logs attached'}
\`\`\`

---
*Submitted via Developer Feedback UI*
            `.trim();

            await adapter.createIssue(title, body);

            toast.success("Feedback Submitted!", {
                description: "Thank you for helping us improve HiveCAD.",
            });

            // Reset form
            setDescription("");
            setEmail("");
            setLogs("");
            if (onOpenChange) onOpenChange(false);
        } catch (error: any) {
            toast.error("Submission Failed", {
                description: error.message || "An error occurred while submitting feedback.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const dialogContent = (
        <DialogContent className="sm:max-w-[550px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl bg-background/95 backdrop-blur-xl">
            <div className="bg-primary/5 p-6 border-b border-border/50">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-primary/10 rounded-xl text-primary">
                            <MessageSquareWarning size={24} />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">Developer Feedback</DialogTitle>
                            <DialogDescription className="text-muted-foreground">
                                Report bugs or suggest features for specific tools.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold ml-1 flex items-center justify-between">
                            <span>What part of the software is this about? <span className="text-destructive">*</span></span>
                        </Label>
                        <Popover open={areaPopoverOpen} onOpenChange={setAreaPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={areaPopoverOpen}
                                    className="w-full justify-between rounded-xl border-border/50 bg-muted/30 h-10 px-3 hover:bg-muted/50 transition-colors"
                                >
                                    {area ? findAreaLabel(area) : "Select tool or area..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-xl border-border/50 shadow-2xl overflow-hidden" align="start">
                                <Command className="bg-popover">
                                    <CommandInput placeholder="Search tools..." className="h-10" />
                                    <CommandList className="max-h-[300px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                        <CommandEmpty>No tool found.</CommandEmpty>
                                        {TOOL_AREAS.map((group) => (
                                            <CommandGroup key={group.label} heading={group.label}>
                                                {group.items.map((item) => (
                                                    <CommandItem
                                                        key={item.value}
                                                        value={item.value}
                                                        onSelect={(currentValue) => {
                                                            setArea(currentValue === area ? "" : currentValue);
                                                            setAreaPopoverOpen(false);
                                                        }}
                                                        className="rounded-lg m-1"
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4 text-primary",
                                                                area === item.value ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {item.label}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        ))}
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="type" className="text-sm font-semibold ml-1">
                            Feedback Type <span className="text-destructive">*</span>
                        </Label>
                        <Select value={type} onValueChange={setType}>
                            <SelectTrigger id="type" className="rounded-xl border-border/50 bg-muted/30 focus:ring-primary/20 h-10">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-border/50 shadow-xl">
                                <SelectItem value="bug">Bug Report</SelectItem>
                                <SelectItem value="feature">Feature Request</SelectItem>
                                <SelectItem value="improvement">Improvement</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-semibold ml-1">
                        {type === 'bug' ? 'What happened?' : 'What would you like to see?'} <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                        id="description"
                        placeholder={type === 'bug'
                            ? "Describe the steps to replicate the error as detailed as you can..."
                            : "Describe the feature you'd like and how it would help your workflow..."}
                        className="min-h-[120px] rounded-2xl border-border/50 bg-muted/30 focus-visible:ring-primary/20 resize-none p-4"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold ml-1 flex items-center gap-2">
                        Contact Email <span className="text-[10px] font-normal text-muted-foreground">(Optional but recommended)</span>
                    </Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            id="email"
                            type="email"
                            placeholder="your@email.com"
                            className="rounded-xl border-border/50 bg-muted/30 h-10 pl-9 focus-visible:ring-primary/20"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <p className="text-[10px] text-muted-foreground px-1">
                        We'll only use this to notify you about progress on this issue.
                    </p>
                </div>

                <div className="space-y-3 p-4 bg-muted/20 rounded-2xl border border-border/30">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold flex items-center gap-2">
                            <Terminal size={14} className="text-primary" />
                            Debug Information
                        </Label>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-[11px] gap-1.5 rounded-lg hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all"
                                        >
                                            <ExternalLink size={12} />
                                            Instructions
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-64 p-4 rounded-xl border-border/50 shadow-2xl bg-popover/95 backdrop-blur-md" align="end" side="top">
                                        <div className="space-y-3">
                                            <h4 className="font-semibold text-xs leading-none text-foreground">Opening the Console</h4>
                                            <div className="space-y-2 text-[11px]">
                                                <div className="flex flex-col gap-1.5">
                                                    <span className="text-muted-foreground font-medium">Windows / Linux</span>
                                                    <div className="flex flex-wrap gap-1">
                                                        <span className="font-mono bg-muted px-2 py-0.5 rounded border border-border/50 text-foreground">F12</span>
                                                        <span className="text-[10px] self-center">or</span>
                                                        <span className="font-mono bg-muted px-2 py-0.5 rounded border border-border/50 text-foreground">Ctrl+Shift+J</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1.5 pt-1">
                                                    <span className="text-muted-foreground font-medium">macOS</span>
                                                    <span className="font-mono bg-muted px-2 py-0.5 rounded border border-border/50 text-foreground w-fit">⌥ + ⌘ + J</span>
                                                </div>
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={handleAttachLogs}
                                className="h-8 text-[11px] gap-1.5 rounded-lg font-semibold"
                            >
                                <Terminal size={12} />
                                Attach Logs
                            </Button>
                        </div>
                    </div>

                    <Textarea
                        placeholder="Console logs will appear here if attached..."
                        className="min-h-[60px] max-h-[120px] font-mono text-[10px] rounded-xl border-border/30 bg-muted/50 focus-visible:ring-primary/20 p-3"
                        value={logs}
                        readOnly
                    />
                    <p className="text-[10px] text-muted-foreground px-1">
                        Logs help us debug faster. They include the last 1000 console messages.
                    </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="gap-2 rounded-full px-8 bg-black hover:bg-zinc-800 text-white dark:bg-zinc-200 dark:hover:bg-zinc-300 dark:text-black font-semibold h-11"
                    >
                        <Github size={18} />
                        {isSubmitting ? 'Submitting...' : 'Submit to GitHub'}
                    </Button>
                </div>
            </form>
        </DialogContent >
    );

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                {dialogContent}
            </Dialog>
            <CloudConnectionsDialog
                open={isConnectionOpen}
                onOpenChange={setIsConnectionOpen}
            />
        </>
    );
};
