import React from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Download } from "lucide-react";
import * as Icons from "lucide-react";
import { LucideProps } from "lucide-react";
import { toast } from "sonner";
import { Extension } from "@/lib/mock-extensions";

interface ExtensionCardProps {
    extension: Extension;
}

export const ExtensionCard: React.FC<ExtensionCardProps> = ({ extension }) => {
    // Dynamically get the icon component from lucide-react
    const LucideIcon = (Icons[extension.icon as keyof typeof Icons] as React.FC<LucideProps>) || Icons.Package;

    const handleInstall = () => {
        toast("Installing Extension", {
            description: `Installing ${extension.name}...`,
        });
    };

    return (
        <Card className="flex flex-col h-full overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1 border-border/50 bg-card/50 backdrop-blur-sm rounded-[1.5rem]">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 p-5">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <LucideIcon size={24} />
                </div>
                <div className="flex flex-col">
                    <CardTitle className="text-lg leading-none font-bold">{extension.name}</CardTitle>
                    <CardDescription className="text-xs mt-1">by {extension.author}</CardDescription>
                </div>
            </CardHeader>

            <CardContent className="flex-1 px-5 pt-0">
                <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                    {extension.description}
                </p>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 p-5 pt-0">
                <div className="flex items-center justify-between w-full text-xs text-muted-foreground bg-muted/30 p-2 rounded-xl">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <ThumbsUp size={12} className="text-green-500" />
                            {extension.stats.likes}
                        </span>
                        <span className="flex items-center gap-1">
                            <ThumbsDown size={12} className="text-red-500" />
                            {extension.stats.dislikes}
                        </span>
                    </div>
                    <span className="flex items-center gap-1">
                        <Download size={12} />
                        {extension.stats.downloads.toLocaleString()}
                    </span>
                </div>

                <Button
                    onClick={handleInstall}
                    className="w-full rounded-full h-10 font-semibold"
                    variant="secondary"
                >
                    Install tool
                </Button>
            </CardFooter>
        </Card>
    );
};
