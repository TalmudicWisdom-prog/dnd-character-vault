import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Application view failed: ${error.name}: ${error.message}\n${info.componentStack}`);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="page">
          <div className="panel error-panel">
            <span className="card-label">Local app error</span>
            <h1>This view could not open</h1>
            <p>{this.state.error.name}: {this.state.error.message}</p>
            <a className="secondary-button button-link" href="#characters">Return to characters</a>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
