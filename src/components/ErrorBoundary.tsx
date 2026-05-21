import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackUI?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 *
 * Catches React errors in child components and displays a fallback UI
 * instead of crashing the entire application.
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);

    // Update state with error details
    this.setState({
      error,
      errorInfo
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // In production, you might want to log to an error reporting service
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback UI if provided
      if (this.props.fallbackUI) {
        return this.props.fallbackUI;
      }

      // Default fallback UI
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#05080a]/95 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0f15] shadow-2xl p-8">
            {/* Error Icon */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/30 mb-4">
                <AlertTriangle className="w-10 h-10 text-red-400" strokeWidth={1.75} />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Something Went Wrong</h1>
              <p className="text-sm text-gray-400">The game encountered an unexpected error</p>
            </div>

            {/* Error Details (Development Only) */}
            {import.meta.env.DEV && this.state.error && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-6 max-h-64 overflow-auto">
                <div className="text-[11px] font-semibold tracking-[0.15em] text-red-400 uppercase mb-2">Error Details</div>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                  {this.state.error.toString()}
                </pre>
                {this.state.errorInfo && (
                  <>
                    <div className="text-[11px] font-semibold tracking-[0.15em] text-red-400 uppercase mt-4 mb-2">Stack Trace</div>
                    <pre className="text-xs text-gray-500 whitespace-pre-wrap font-mono">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            )}

            {/* Error Message (Production) */}
            {!import.meta.env.DEV && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-4 mb-6">
                <p className="text-sm text-gray-300 text-center">
                  We apologize for the inconvenience. The error has been logged and we'll look into it.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                  bg-emerald-500/15 border border-emerald-400/40 text-emerald-300
                  hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-all duration-200"
              >
                <RotateCcw className="w-4 h-4" strokeWidth={2.25} />
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold
                  bg-white/[0.04] border border-white/10 text-gray-300
                  hover:bg-white/[0.08] hover:border-white/20 hover:text-white transition-all duration-200"
              >
                <RefreshCw className="w-4 h-4" strokeWidth={2.25} />
                Reload Page
              </button>
            </div>

            {/* Help Text */}
            <div className="mt-6 text-center text-xs text-gray-500">
              If this problem persists, try refreshing the page or clearing your browser cache.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
