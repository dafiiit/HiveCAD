import React, { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, PlusCircle, ArrowLeft, Package } from "lucide-react";
import { MOCK_EXTENSIONS } from "@/lib/mock-extensions";
import { ExtensionCard } from "./ExtensionCard";
import { CreateExtensionForm } from "./CreateExtensionForm";

interface ExtensionStoreDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const ExtensionStoreDialog: React.FC<ExtensionStoreDialogProps> = ({
    open,
    onOpenChange,
}) => {
    const [view, setView] = useState<"browse" | "create">("browse");
    const [searchQuery, setSearchQuery] = useState("");

    const filteredExtensions = useMemo(() => {
        return MOCK_EXTENSIONS.filter(
            (ext) =>
                ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                ext.description.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    const handleCreateSuccess = () => {
        setView("browse");
        // In a real app we might refresh the list here
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[950px] h-[650px] flex flex-col gap-0 p-0 overflow-hidden border-border/40 bg-background/95 backdrop-blur-md rounded-[2rem]">
                <DialogHeader className="p-6 pr-14 border-b border-border/20 bg-transparent">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                                {view === "browse" ? (
                                    <>
                                        <Package className="w-6 h-6 text-primary" />
                                        Extension Library
                                    </>
                                ) : (
                                    <>
                                        <PlusCircle className="w-6 h-6 text-primary" />
                                        Create Community Tool
                                    </>
                                )}
                            </DialogTitle>
                            <DialogDescription>
                                {view === "browse"
                                    ? "Browse and install community-made tools to enhance your CAD workflow."
                                    : "Submit your own parametric tool to the HiveCAD community library via GitHub."}
                            </DialogDescription>
                        </div>

                        {view === "browse" ? (
                            <Button
                                size="sm"
                                onClick={() => setView("create")}
                                className="gap-2 shadow-sm rounded-full px-5"
                            >
                                <PlusCircle size={16} />
                                Create New Tool
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setView("browse")}
                                className="gap-2 rounded-full"
                            >
                                <ArrowLeft size={16} />
                                Back to Library
                            </Button>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden relative">
                    {view === "browse" ? (
                        <>
                            {/* Frosted Glass Floating Search Bar */}
                            <div className="absolute top-0 left-0 right-0 z-20 p-6 pb-2 bg-gradient-to-b from-background via-background/90 to-transparent backdrop-blur-sm pointer-events-none">
                                <div className="relative pointer-events-auto">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 z-30" />
                                    <Input
                                        placeholder="Search tools, generators, patterns..."
                                        className="pl-11 h-12 bg-background/60 backdrop-blur-xl border-border/50 focus-visible:ring-primary/30 rounded-full text-base shadow-lg"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            <ScrollArea className="h-full w-full">
                                <div className="p-6 pt-24">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                                        {filteredExtensions.length > 0 ? (
                                            filteredExtensions.map((ext) => (
                                                <ExtensionCard key={ext.id} extension={ext} />
                                            ))
                                        ) : (
                                            <div className="col-span-full py-20 text-center space-y-3">
                                                <div className="flex justify-center">
                                                    <Package className="w-12 h-12 text-muted/30" />
                                                </div>
                                                <p className="text-muted-foreground">No extensions found matching "{searchQuery}"</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </ScrollArea>
                        </>
                    ) : (
                        <div className="p-6 h-full flex flex-col">
                            <ScrollArea className="flex-1 -mr-4 pr-4">
                                <CreateExtensionForm
                                    onCancel={() => setView("browse")}
                                    onSuccess={handleCreateSuccess}
                                />
                            </ScrollArea>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
