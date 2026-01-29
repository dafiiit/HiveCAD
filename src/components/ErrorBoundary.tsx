import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`ErrorBoundary caught error in ${this.props.name || 'Component'}:`, error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
        if (this.props.name === 'Viewport') {
            // Special handling for Viewport? Maybe not needed yet.
        }
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="flex flex-col items-center justify-center h-full p-8 bg-background/50 backdrop-blur-sm border border-border/50 rounded-lg">
                    <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
                    <h2 className="text-xl font-semibold mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-muted-foreground mb-6 text-center max-w-md">
                        {this.state.error?.message || 'An unexpected error occurred in ' + (this.props.name || 'this component')}
                    </p>
                    <div className="flex gap-4">
                        <Button
                            variant="outline"
                            onClick={this.handleReset}
                            className="flex gap-2"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            Try Again
                        </Button>
                        <Button onClick={() => window.location.reload()}>
                            Reload Application
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
