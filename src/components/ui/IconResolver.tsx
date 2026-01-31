import React from "react";
import * as Icons from "lucide-react";

interface IconResolverProps {
    name: string;
    className?: string;
}

export const IconResolver = ({ name, className }: IconResolverProps) => {
    // Lucide icons are exported as PascalCase (e.g. "Box", "Circle")
    const IconComponent = (Icons as any)[name] || Icons.HelpCircle;
    return <IconComponent className={className} />;
};
