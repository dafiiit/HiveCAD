export interface ExtensionStats {
    downloads: number;
    likes: number;
    dislikes: number;
}

export interface Extension {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    stats: ExtensionStats;
    icon: string;
}

export const MOCK_EXTENSIONS: Extension[] = [
    {
        id: "gear-generator",
        name: "Gear Generator",
        description: "Create custom involute spur gears with adjustable teeth, pressure angle, and module. Perfect for mechanical designs.",
        author: "MechanicJoe",
        version: "1.2.0",
        stats: {
            downloads: 1240,
            likes: 85,
            dislikes: 2,
        },
        icon: "Settings",
    },
    {
        id: "gridfinity-base",
        name: "Gridfinity Base",
        description: "Generate standardized Gridfinity baseplates and bins. Fully parametric and compatible with the Gridfinity ecosystem.",
        author: "ZackFreedman",
        version: "2.0.1",
        stats: {
            downloads: 5600,
            likes: 420,
            dislikes: 5,
        },
        icon: "Grid",
    },
    {
        id: "voronoi-pattern",
        name: "Voronoi Pattern",
        description: "Apply beautiful Voronoi patterns to your surfaces. Great for aesthetic weight reduction and organic looks.",
        author: "ArtisticBenoit",
        version: "0.8.5",
        stats: {
            downloads: 890,
            likes: 64,
            dislikes: 12,
        },
        icon: "Zap",
    },
    {
        id: "thread-factory",
        name: "Thread Factory",
        description: "Generate realistic ISO and UTS threads for bolts and nuts. Includes clearance options for 3D printing.",
        author: "PrinterPaul",
        version: "1.0.4",
        stats: {
            downloads: 2100,
            likes: 156,
            dislikes: 8,
        },
        icon: "Wind",
    },
    {
        id: "lattice-generator",
        name: "Lattice Generator",
        description: "Fill volumes with various lattice structures like Gyroid, Schwarz P, and Diamond. Ideal for lightweighting.",
        author: "StructureLab",
        version: "1.1.0",
        stats: {
            downloads: 450,
            likes: 38,
            dislikes: 1,
        },
        icon: "Layers",
    },
    {
        id: "pcb-enclosure",
        name: "PCB Enclosure Wizard",
        description: "Automatically generate enclosures for standard PCB sizes with mounting bosses and connector cutouts.",
        author: "ElectroMakers",
        version: "0.9.1",
        stats: {
            downloads: 780,
            likes: 92,
            dislikes: 3,
        },
        icon: "Cpu",
    },
];
