import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Github } from "lucide-react";
import * as Icons from "lucide-react";
import { LucideProps } from "lucide-react";

interface CreateExtensionFormProps {
    onCancel: () => void;
    onSuccess: () => void;
}

export const CreateExtensionForm: React.FC<CreateExtensionFormProps> = ({ onCancel, onSuccess }) => {
    const { toast } = useToast();
    const [name, setName] = useState("");
    const [id, setId] = useState("");
    const [description, setDescription] = useState("");
    const [iconName, setIconName] = useState("Package");

    // Auto-generate ID from Name
    useEffect(() => {
        const generatedId = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        setId(generatedId);
    }, [name]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !description || !iconName) {
            toast({
                title: "Validation Error",
                description: "Please fill in all required fields.",
                variant: "destructive",
            });
            return;
        }

        // Mock success
        toast({
            title: "PR Created!",
            description: `Your extension "${name}" has been submitted to the community library.`,
        });

        onSuccess();
    };

    // Preview the icon
    const PreviewIcon = (Icons[iconName as keyof typeof Icons] as React.FC<LucideProps>) || Icons.Package;

    return (
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-3">
                <div className="grid gap-1.5">
                    <Label htmlFor="name" className="text-sm font-semibold">Extension Name</Label>
                    <Input
                        id="name"
                        placeholder="e.g. Gear Generator"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="rounded-xl h-10 border-border/50 bg-muted/30 focus-visible:ring-primary/20"
                    />
                </div>

                <div className="grid gap-1.5">
                    <Label htmlFor="description" className="text-sm font-semibold">Description (README)</Label>
                    <Textarea
                        id="description"
                        placeholder="Describe what your tool does and how to use it..."
                        className="min-h-[100px] rounded-xl border-border/50 bg-muted/30 focus-visible:ring-primary/20 resize-none"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="grid gap-1.5">
                    <Label htmlFor="icon" className="text-sm font-semibold">Lucide Icon Name</Label>
                    <div className="flex gap-2">
                        <Input
                            id="icon"
                            placeholder="e.g. Zap, Settings, Grid..."
                            value={iconName}
                            onChange={(e) => setIconName(e.target.value)}
                            className="flex-1 rounded-xl h-10 border-border/50 bg-muted/30 focus-visible:ring-primary/20"
                        />
                        <div className="flex items-center justify-center w-10 h-10 border border-border/50 rounded-xl bg-muted/50 text-primary">
                            <PreviewIcon size={20} />
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Search icons at <a href="https://lucide.dev/icons" target="_blank" rel="noreferrer" className="underline hover:text-primary transition-colors">lucide.dev</a>
                    </p>
                </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-border/40">
                <Button type="button" variant="ghost" onClick={onCancel} className="rounded-full px-6">
                    Cancel
                </Button>
                <Button type="submit" className="gap-2 rounded-full px-6 bg-black hover:bg-zinc-800 text-white dark:bg-zinc-200 dark:hover:bg-zinc-300 dark:text-black font-semibold h-11">
                    <Github size={18} />
                    Create Tool on GitHub
                </Button>
            </div>
        </form>
    );
};
