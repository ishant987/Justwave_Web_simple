import React from 'react';

interface AppErrorBoundaryState {
  errorMessage: string | null;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { errorMessage: null };
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      errorMessage: error instanceof Error ? error.message : 'Unexpected application error.',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('App crashed:', error);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="screen-center">
          <div className="panel error-panel">
            <h2>Something went wrong</h2>
            <p className="muted">
              The app hit a runtime error instead of rendering this page.
            </p>
            <p className="error-text">{this.state.errorMessage}</p>
            <button className="primary-button" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
