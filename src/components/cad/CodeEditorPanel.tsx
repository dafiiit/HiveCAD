
import { useEffect, useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { useCADStore } from "@/hooks/useCADStore";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

const CodeEditorPanel = () => {
    const { code, setCode, runCode } = useCADStore();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleEditorChange = (value: string | undefined) => {
        if (value !== undefined) {
            setCode(value);

            // Debounce execution
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                console.log("Auto-running code...");
                runCode();
                toast.info("Updating geometry...");
            }, 1000); // 1 second debounce
        }
    };

    const handleEditorDidMount: OnMount = (editor, monaco) => {
        // Optional: Configure monaco here
        // e.g. add extra libs for autocompletion if we could

        // Run initially
        runCode();
    };

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] w-full">
            <div className="p-2 bg-muted/30 border-b border-border flex justify-end items-center">
                <button
                    onClick={() => runCode()}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-semibold transition-all shadow-sm",
                        "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
                    )}
                    title="Run Code (Cmd+Enter)"
                >
                    <Play className="w-3 h-3 fill-current" />
                    <span>RUN</span>
                </button>
            </div>
            <div className="flex-1 overflow-hidden">
                <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme="vs-dark"
                    value={code}
                    onChange={handleEditorChange}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: "on",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                    }}
                />
            </div>
        </div>
    );
};

export default CodeEditorPanel;
