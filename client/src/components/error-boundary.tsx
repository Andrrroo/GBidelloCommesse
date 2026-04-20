import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="h-8 w-8 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Si è verificato un errore</h1>
              <p className="mt-1 text-sm text-gray-600">L'applicazione ha riscontrato un problema.</p>
            </div>
          </div>
          <pre className="text-xs bg-gray-50 border rounded p-3 overflow-auto text-gray-700 max-h-40 mb-4">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <Button onClick={this.handleReset} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" /> Riprova
            </Button>
            <Button onClick={() => window.location.reload()} size="sm">
              Ricarica pagina
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
