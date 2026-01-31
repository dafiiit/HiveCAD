import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Github } from "lucide-react";
import * as Icons from "lucide-react";
import { LucideProps } from "lucide-react";
import { IconPicker } from "../ui/IconPicker";
import { useGlobalStore } from "@/store/useGlobalStore";
import { StorageManager } from "@/lib/storage/StorageManager";
import { Extension } from "@/lib/storage/types";

interface CreateExtensionFormProps {
    onCancel: () => void;
    onSuccess: () => void;
}

export const CreateExtensionForm: React.FC<CreateExtensionFormProps> = ({ onCancel, onSuccess }) => {
    const { user } = useGlobalStore();
    const [name, setName] = useState("");
    const [id, setId] = useState("");
    const [description, setDescription] = useState("");
    const [iconName, setIconName] = useState("Package");
    const [loading, setLoading] = useState(false);

    // Auto-generate ID from Name
    useEffect(() => {
        const generatedId = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        setId(generatedId);
    }, [name]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !description || !iconName) {
            toast.error("Validation Error", {
                description: "Please fill in all required fields.",
            });
            return;
        }

        setLoading(true);
        try {
            const adapter = StorageManager.getInstance().currentAdapter;
            if (adapter.submitExtension) {
                const githubUrl = await adapter.submitExtension({
                    id,
                    name,
                    description,
                    icon: iconName,
                    author: user?.email || "Anonymous",
                    version: "1.0.0",
                } as any);

                toast.success("Community Tool Created!", {
                    description: `Your extension "${name}" has been created on GitHub. Redirecting...`,
                });

                onSuccess();

                // Redirect to GitHub
                if (githubUrl) {
                    setTimeout(() => {
                        window.open(githubUrl, '_blank');
                    }, 1000);
                }
            } else {
                toast.error("Error", {
                    description: "Storage adapter does not support extension submission.",
                });
            }
        } catch (error) {
            console.error("Submission failed:", error);
            toast.error("Submission Failed", {
                description: "There was an error submitting your tool to the library.",
            });
        } finally {
            setLoading(false);
        }
    };


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
                    <Label htmlFor="icon" className="text-sm font-semibold">Icon</Label>
                    <IconPicker
                        value={iconName}
                        onChange={setIconName}
                    />
                    <p className="text-[11px] text-muted-foreground">
                        Select an icon that best represents your tool.
                    </p>
                </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-border/40">
                <Button type="button" variant="ghost" onClick={onCancel} className="rounded-full px-6" disabled={loading}>
                    Cancel
                </Button>
                <Button type="submit" className="gap-2 rounded-full px-6 bg-black hover:bg-zinc-800 text-white dark:bg-zinc-200 dark:hover:bg-zinc-300 dark:text-black font-semibold h-11" disabled={loading}>
                    {loading ? (
                        <Icons.Loader2 size={18} className="animate-spin" />
                    ) : (
                        <Github size={18} />
                    )}
                    {loading ? "Submitting..." : "Create Tool on GitHub"}
                </Button>
            </div>
        </form>
    );
};
