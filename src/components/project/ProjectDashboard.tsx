import React, { useState, useEffect } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
    Plus, Search, Clock, User, Users, Tag, Globe, Trash2,
    MoreVertical, Grid, List as ListIcon, Folder, ChevronDown,
    Bell, HelpCircle, UserCircle, LayoutGrid, Info, Star
} from 'lucide-react';
import { EXAMPLES } from '@/lib/data/examples';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GitHubTokenDialog } from '../ui/GitHubTokenDialog';

type DashboardMode = 'workspace' | 'discover';

const DISCOVER_PROJECTS = [
    { id: 'd1', name: 'Precision Drone Frame', author: 'sky_builder', likes: 124, forks: 45, thumbnail: null },
    { id: 'd2', name: 'Gridfinity 4x4 Base', author: 'organizer_pro', likes: 89, forks: 21, thumbnail: null },
    { id: 'd3', name: 'Minimalist Pot', author: 'industrial_box', likes: 210, forks: 12, thumbnail: null },
    { id: 'd4', name: 'M3 Bolt Assortment', author: 'mech_man', likes: 56, forks: 8, thumbnail: null },
    { id: 'd5', name: 'Parametric Hinge', author: 'hinge_king', likes: 167, forks: 34, thumbnail: null },
    { id: 'd6', name: 'Custom Keyboard Case', author: 'clack_master', likes: 312, forks: 67, thumbnail: null },
];

export function ProjectDashboard() {
    const { user, logout, setFileName, setCode, projectThumbnails, reset, showPATDialog, setShowPATDialog } = useCADStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [dashboardMode, setDashboardMode] = useState<DashboardMode>('workspace');
    const [activeNav, setActiveNav] = useState('Created by me');
    const [folders, setFolders] = useState<string[]>([]);
    const [starredProjects, setStarredProjects] = useState<string[]>([]);
    const [userProjects, setUserProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchProjects = async () => {
            if (user?.pat && dashboardMode === 'workspace') {
                setLoading(true);
                try {
                    const { StorageManager } = await import('@/lib/storage/StorageManager');
                    const adapter = StorageManager.getInstance().currentAdapter;
                    if (adapter.listProjects) {
                        const projects = await adapter.listProjects();
                        setUserProjects(projects);
                    }
                } catch (error) {
                    console.error("Failed to fetch projects:", error);
                } finally {
                    setLoading(false);
                }
            }
        };
        fetchProjects();
    }, [user, dashboardMode]);

    const handleCreateProject = () => {
        if (!user?.pat) {
            setShowPATDialog(true);
            return;
        }

        createProject();
    };

    const handleOpenProject = async (project: any) => {
        setLoading(true);
        try {
            const { StorageManager } = await import('@/lib/storage/StorageManager');
            const adapter = StorageManager.getInstance().currentAdapter;
            const data = await adapter.load(project.id);
            if (data) {
                setFileName(data.fileName || project.name);
                setCode(data.code);
                // We'd need a more complete state restoration here ideally
                toast.success(`Opened project: ${project.name}`);
            }
        } catch (error) {
            toast.error("Failed to open project");
        } finally {
            setLoading(false);
        }
    };

    const createProject = () => {
        const existingNames = Object.keys(projectThumbnails);
        let name = 'Unnamed';
        let counter = 1;

        while (existingNames.includes(name)) {
            counter++;
            name = `Unnamed ${counter}`;
        }

        setFileName(name);
        reset();
        toast.success(`Started new project: ${name}`);
    };

    const handleAddFolder = () => {
        const name = window.prompt('Enter folder name:');
        if (name) {
            setFolders([...folders, name]);
            toast.success(`Folder "${name}" created`);
        }
    };

    const handleOpenExample = (example: typeof EXAMPLES[0]) => {
        setFileName(example.name);
        setCode(example.code);
        toast.success(`Opened ${example.name}`);
    };

    const handleToggleStar = (e: React.MouseEvent, projectName: string) => {
        e.stopPropagation();
        setStarredProjects(prev =>
            prev.includes(projectName)
                ? prev.filter(p => p !== projectName)
                : [...prev, projectName]
        );
        toast.success(starredProjects.includes(projectName) ? `Removed from Starred` : `Added to Starred`);
    };

    const navItems = [
        { icon: User, label: 'Created by me' },
        { icon: Star, label: 'Starred' },
        { icon: Users, label: 'Shared with me' },
        { icon: Tag, label: 'Labels' },
        { icon: Globe, label: 'Public' },
        { icon: Trash2, label: 'Trash' },
    ];


    return (
        <div className="flex h-screen w-screen bg-[#1a1a1a] text-zinc-300 overflow-hidden font-sans flex-col">
            {/* Main Header */}
            <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#222] shrink-0">
                <div className="flex items-center gap-3 w-64">
                    <img src="/favicon.ico" alt="HiveCAD Logo" className="w-8 h-8 rounded-md" />
                    <span className="font-bold text-white text-lg tracking-tight">HiveCAD</span>
                </div>
                <div className="flex-1 flex justify-center">
                    <div className="bg-[#1a1a1a] p-1 rounded-lg flex border border-zinc-800">
                        <button
                            onClick={() => setDashboardMode('workspace')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${dashboardMode === 'workspace' ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            MY WORKSPACE
                        </button>
                        <button
                            onClick={() => setDashboardMode('discover')}
                            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${dashboardMode === 'discover' ? 'bg-primary text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            DISCOVER
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-4 text-zinc-400 w-64 justify-end">
                    <Bell className="w-5 h-5 hover:text-white cursor-pointer" />
                    <HelpCircle className="w-5 h-5 hover:text-white cursor-pointer" />
                    <div className="flex items-center gap-2 pl-2 border-l border-zinc-700 ml-2">
                        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-white">
                            {user?.email[0].toUpperCase()}
                        </div>
                        <span className="text-sm hidden sm:inline whitespace-nowrap">{user?.email}</span>
                        <button onClick={logout} className="text-xs hover:text-white underline">Logout</button>
                    </div>
                </div>
            </header>

            {/* Dashboard Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-[#1a1a1a]">
                {dashboardMode === 'workspace' ? (
                    <>
                        {/* Search and Navigation Tags */}
                        <div className="space-y-4">
                            <div className="max-w-xl relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={`Search in my HiveCAD...`}
                                    className="bg-[#222] border-zinc-800 pl-10 h-10 focus:ring-primary focus:border-zinc-700"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {navItems.map((item) => (
                                    <button
                                        key={item.label}
                                        onClick={() => setActiveNav(item.label)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${activeNav === item.label
                                            ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]'
                                            : 'bg-zinc-800/30 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                                            }`}
                                    >
                                        <item.icon className="w-3 h-3" />
                                        {item.label.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Recently Opened */}
                        <section>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold flex items-center gap-2 text-zinc-400 uppercase tracking-wider">
                                    <Clock className="w-4 h-4" /> Last opened by me
                                </h3>
                                <div className="flex items-center bg-[#2d2d2d] rounded-md p-1 border border-zinc-800">
                                    <button
                                        onClick={() => setViewMode('list')}
                                        className={`p-1 rounded ${viewMode === 'list' ? 'bg-zinc-700 text-white' : ''}`}
                                    >
                                        <ListIcon className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setViewMode('grid')}
                                        className={`p-1 rounded ${viewMode === 'grid' ? 'bg-zinc-700 text-white' : ''}`}
                                    >
                                        <Grid className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {/* New Project Card */}
                                <div
                                    onClick={handleCreateProject}
                                    className="bg-primary/5 rounded-md overflow-hidden border border-primary/20 border-dashed hover:border-primary hover:bg-primary/10 cursor-pointer group transition-all hover:translate-y-[-4px] shadow-lg flex flex-col ring-1 ring-primary/10 hover:ring-primary/30"
                                >
                                    <div className="h-32 bg-primary/10 flex items-center justify-center overflow-hidden relative shrink-0">
                                        <div className="text-primary group-hover:scale-110 transition-transform duration-300">
                                            <Plus className="w-12 h-12" />
                                        </div>
                                        <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="p-3 bg-[#2d2d2d] border-t border-zinc-800 flex-1 flex flex-col justify-center">
                                        <div className="font-bold text-primary group-hover:text-white transition-colors truncate text-sm tracking-tight">+ New Project</div>
                                        <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-widest font-black opacity-60">Create Space</div>
                                    </div>
                                </div>

                                {loading && (
                                    <div className="col-span-full py-10 flex flex-col items-center justify-center space-y-2">
                                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                        <p className="text-xs text-zinc-500 font-medium">Syncing with GitHub...</p>
                                    </div>
                                )}

                                {!loading && userProjects.length > 0 && userProjects.map((project) => (
                                    <div
                                        key={project.id}
                                        onClick={() => handleOpenProject(project)}
                                        className="bg-[#2d2d2d] rounded-md overflow-hidden border border-zinc-800 hover:border-primary/50 cursor-pointer group transition-all hover:translate-y-[-2px] shadow-lg flex flex-col relative"
                                    >
                                        <div className="h-32 bg-[#222] flex items-center justify-center overflow-hidden relative shrink-0">
                                            <div className="text-primary opacity-40 group-hover:opacity-60 transition-opacity">
                                                <div className="bg-primary/10 p-4 rounded-full">
                                                    <LayoutGrid className="w-12 h-12" />
                                                </div>
                                            </div>
                                            {project.sha && (
                                                <div className="absolute bottom-2 right-2 bg-green-500/20 text-green-500 text-[8px] font-bold px-1.5 py-0.5 rounded border border-green-500/30 uppercase tracking-tighter">
                                                    Cloud
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3 bg-[#2d2d2d] border-t border-zinc-800 flex-1 flex flex-col justify-center">
                                            <div className="font-medium text-white truncate text-sm">{project.name}</div>
                                            <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-tighter font-bold opacity-60">My Project</div>
                                        </div>
                                    </div>
                                ))}

                                {EXAMPLES.map((example) => {
                                    const thumbnail = projectThumbnails[example.name];
                                    const isStarred = starredProjects.includes(example.name);
                                    return (
                                        <div
                                            key={example.id}
                                            onClick={() => handleOpenExample(example)}
                                            className="bg-[#2d2d2d] rounded-md overflow-hidden border border-zinc-800 hover:border-primary/50 cursor-pointer group transition-all hover:translate-y-[-2px] shadow-lg flex flex-col relative"
                                        >
                                            <div className="h-32 bg-[#252525] flex items-center justify-center overflow-hidden relative shrink-0">
                                                {thumbnail ? (
                                                    <img
                                                        src={thumbnail}
                                                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                                        alt={example.name}
                                                    />
                                                ) : (
                                                    <div className="text-primary opacity-20 group-hover:opacity-40 transition-opacity">
                                                        <div className="bg-primary/20 p-4 rounded-full">
                                                            <LayoutGrid className="w-12 h-12" />
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="absolute top-2 right-2 flex gap-1">
                                                    <button
                                                        onClick={(e) => handleToggleStar(e, example.name)}
                                                        className={`p-1.5 rounded-md backdrop-blur-md transition-all ${isStarred ? 'bg-primary/20 text-primary' : 'bg-black/50 text-zinc-400 opacity-0 group-hover:opacity-100'}`}
                                                    >
                                                        <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-primary' : ''}`} />
                                                    </button>
                                                    <div className="bg-black/50 p-1.5 rounded-md backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Info className="w-3.5 h-3.5 text-zinc-400" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-3 bg-[#2d2d2d] border-t border-zinc-800 flex-1 flex flex-col justify-center">
                                                <div className="font-medium text-white truncate text-sm">{example.name}</div>
                                                <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-tighter font-bold opacity-60">Example Project</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Dynamic Projects Filtered Section */}
                        <section>
                            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-zinc-400 uppercase tracking-wider">
                                <ListIcon className="w-4 h-4" /> {activeNav}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {loading && (
                                    <div className="col-span-full py-10 flex flex-col items-center justify-center space-y-2">
                                        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                        <p className="text-xs text-zinc-500 font-medium">Fetching {activeNav}...</p>
                                    </div>
                                )}

                                {/* Filtered Projects (User + Examples) */}
                                {!loading && [
                                    ...userProjects.map(p => ({ ...p, type: 'user' })),
                                    ...EXAMPLES.map(e => ({ ...e, type: 'example' }))
                                ]
                                    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .filter(p => {
                                        if (activeNav === 'Starred') return starredProjects.includes(p.name);
                                        if (activeNav === 'Created by me') return p.type === 'user';
                                        if (activeNav === 'Shared with me') return false;
                                        if (activeNav === 'Public') return p.type === 'example' || p.type === 'user';
                                        if (activeNav === 'Trash') return false;
                                        if (activeNav === 'Labels') return false;
                                        return true;
                                    })
                                    .map((project: any) => {
                                        const isExample = project.type === 'example';
                                        const thumbnail = isExample ? projectThumbnails[project.name] : null;
                                        const isStarred = starredProjects.includes(project.name);
                                        return (
                                            <div
                                                key={`filtered-${project.id}`}
                                                onClick={() => isExample ? handleOpenExample(project) : handleOpenProject(project)}
                                                className="bg-[#2d2d2d] rounded-md overflow-hidden border border-zinc-800 hover:border-primary/50 cursor-pointer group transition-all hover:translate-y-[-2px] shadow-lg flex flex-col relative"
                                            >
                                                <div className="h-40 bg-[#252525] flex items-center justify-center overflow-hidden relative shrink-0">
                                                    {thumbnail ? (
                                                        <img src={thumbnail} className="w-full h-full object-cover" alt={project.name} />
                                                    ) : (
                                                        <LayoutGrid className={cn("w-10 h-10", isExample ? "text-zinc-700" : "text-primary/40")} />
                                                    )}
                                                    <div className="absolute top-2 right-2">
                                                        <button
                                                            onClick={(e) => handleToggleStar(e, project.name)}
                                                            className={`p-1.5 rounded-md backdrop-blur-md transition-all ${isStarred ? 'bg-primary/20 text-primary' : 'bg-black/50 text-zinc-400 opacity-0 group-hover:opacity-100'}`}
                                                        >
                                                            <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-primary' : ''}`} />
                                                        </button>
                                                    </div>
                                                    {!isExample && (
                                                        <div className="absolute bottom-2 right-2 bg-green-500/20 text-green-500 text-[8px] font-bold px-1.5 py-0.5 rounded border border-green-500/30 uppercase tracking-tighter">
                                                            Cloud
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-3">
                                                    <div className="font-medium text-white truncate text-sm">{project.name}</div>
                                                    <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-tighter">
                                                        {isExample ? 'Example Project' : 'Last Modified 2d ago'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                {!loading && [
                                    ...userProjects.map(p => ({ ...p, type: 'user' })),
                                    ...EXAMPLES.map(e => ({ ...e, type: 'example' }))
                                ].filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                    .filter(p => {
                                        if (activeNav === 'Starred') return starredProjects.includes(p.name);
                                        if (activeNav === 'Created by me') return p.type === 'user';
                                        if (activeNav === 'Shared with me') return false;
                                        if (activeNav === 'Public') return p.type === 'example' || p.type === 'user';
                                        if (activeNav === 'Trash') return false;
                                        if (activeNav === 'Labels') return false;
                                        return true;
                                    }).length === 0 && (
                                        <div className="col-span-full py-20 text-center space-y-3">
                                            <div className="w-16 h-16 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto text-zinc-600">
                                                <Search className="w-8 h-8" />
                                            </div>
                                            <div className="text-zinc-500 font-medium">No projects found in {activeNav}</div>
                                            <p className="text-zinc-600 text-sm">Try exploring the community in Discover mode or create a new project.</p>
                                        </div>
                                    )}
                            </div>
                        </section>
                    </>
                ) : (
                    /* Discover Mode - Community Section */
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-white tracking-tight">Community Discover</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-500">Trending</span>
                                <ChevronDown className="w-4 h-4 text-zinc-500" />
                            </div>
                        </div>

                        {/* Pinterest-style Staggered Grid (approximated with columns) */}
                        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                            {DISCOVER_PROJECTS.map((item) => (
                                <div
                                    key={item.id}
                                    className="break-inside-avoid bg-[#222] rounded-xl overflow-hidden border border-zinc-800 hover:border-primary/40 transition-all cursor-pointer group shadow-xl"
                                >
                                    <div
                                        className="w-full bg-zinc-800/50 flex items-center justify-center"
                                        style={{ height: `${150 + (parseInt(item.id[1]) * 40)}px` }}
                                    >
                                        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                            <LayoutGrid className="w-8 h-8" />
                                        </div>
                                    </div>
                                    <div className="p-4 space-y-3">
                                        <div className="font-bold text-white text-sm leading-tight group-hover:text-primary transition-colors">{item.name}</div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] text-white">
                                                    {item.author[0].toUpperCase()}
                                                </div>
                                                <span className="text-[10px] text-zinc-500 font-medium">@{item.author}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                                <div className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {item.forks}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
