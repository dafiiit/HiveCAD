
import { useEffect, useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { useCADStore } from "@/hooks/useCADStore";
import { toast } from "sonner";

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
        <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-border" style={{ width: '400px', minWidth: '300px' }}>
            <div className="p-2 bg-muted text-muted-foreground text-xs font-mono border-b border-border flex justify-between items-center">
                <span>script.js</span>
                <button
                    onClick={() => runCode()}
                    className="hover:text-primary transition-colors"
                    title="Run Code (Cmd+Enter)"
                >
                    Run
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
