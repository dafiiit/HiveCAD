import React, { useState } from 'react';
import { useCADStore } from '@/hooks/useCADStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
    Plus, Search, Clock, User, Users, Tag, Globe, Trash2,
    MoreVertical, Grid, List as ListIcon, Folder, ChevronDown,
    Bell, HelpCircle, UserCircle, LayoutGrid, Info
} from 'lucide-react';
import { EXAMPLES } from '@/lib/data/examples';
import { toast } from 'sonner';

export function ProjectDashboard() {
    const { user, logout, setFileName, setCode, projectThumbnails, reset } = useCADStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [activeNav, setActiveNav] = useState('Recently opened');
    const [folders, setFolders] = useState<string[]>([]);

    const handleCreateProject = () => {
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

    const navItems = [
        { icon: Clock, label: 'Recently opened' },
        { icon: User, label: 'Created by me' },
        { icon: Users, label: 'Shared with me' },
        { icon: Tag, label: 'Labels' },
        { icon: Globe, label: 'Public' },
        { icon: Trash2, label: 'Trash' },
    ];


    return (
        <div className="flex h-screen w-screen bg-[#1a1a1a] text-zinc-300 overflow-hidden font-sans">
            {/* Sidebar */}
            <div className="w-64 border-r border-zinc-800 flex flex-col shrink-0">
                <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
                    <img src="/favicon.ico" alt="HiveCAD Logo" className="w-8 h-8 rounded-md" />
                    <span className="font-bold text-white text-lg tracking-tight">HiveCAD</span>
                </div>


                <nav className="flex-1 px-2 space-y-0.5">
                    {navItems.map((item) => (
                        <button
                            key={item.label}
                            onClick={() => setActiveNav(item.label)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeNav === item.label
                                ? 'bg-[#2d2d2d] text-white'
                                : 'hover:bg-[#252525] text-zinc-400'
                                }`}
                        >
                            <item.icon className={`w-4 h-4 ${activeNav === item.label ? 'text-primary' : ''}`} />
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-zinc-800 space-y-4">
                    {/* Bottom sidebar info if needed */}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#222]">
                    <div className="flex-1 max-w-2xl px-4 relative">
                        <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search in HiveCAD"
                            className="bg-[#1a1a1a] border-zinc-700 pl-10 h-9 focus:ring-primary focus:border-zinc-500"
                        />
                    </div>

                    <div className="flex items-center gap-4 text-zinc-400">
                        <Bell className="w-5 h-5 hover:text-white cursor-pointer" />
                        <LayoutGrid className="w-5 h-5 hover:text-white cursor-pointer" />
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

                            {EXAMPLES.map((example) => {
                                const thumbnail = projectThumbnails[example.name];
                                return (
                                    <div
                                        key={example.id}
                                        onClick={() => handleOpenExample(example)}
                                        className="bg-[#2d2d2d] rounded-md overflow-hidden border border-zinc-800 hover:border-primary/50 cursor-pointer group transition-all hover:translate-y-[-2px] shadow-lg flex flex-col"
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
                                            <div className="absolute top-2 right-2 bg-black/50 p-1 rounded backdrop-blur-sm">
                                                <Info className="w-3 h-3 text-zinc-400" />
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

                    {/* Folders */}
                    <section>
                        <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-zinc-400 uppercase tracking-wider">
                            <Folder className="w-4 h-4" /> Folders
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            <div
                                onClick={handleAddFolder}
                                className="bg-[#222] p-4 rounded-md flex items-center gap-3 border border-zinc-800 border-dashed hover:border-primary hover:bg-[#252525] cursor-pointer transition-all group"
                            >
                                <Plus className="w-5 h-5 text-zinc-500 group-hover:text-primary transition-colors" />
                                <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-300">New Folder</span>
                            </div>
                            {folders.map((folder) => (
                                <div key={folder} className="bg-[#383838] p-4 rounded-md flex items-center gap-3 border border-zinc-700 hover:bg-[#404040] cursor-pointer transition-colors shadow-sm">
                                    <Folder className="w-5 h-5 text-primary" fill="currentColor" fillOpacity={0.2} />
                                    <span className="text-sm font-medium text-zinc-200">{folder}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
