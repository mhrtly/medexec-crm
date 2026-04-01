import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
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

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ color: '#c44', marginBottom: '1rem' }}>Something went wrong</h1>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '1rem', borderRadius: '8px', fontSize: '14px' }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', cursor: 'pointer', background: '#333', color: '#fff', border: 'none', borderRadius: '6px' }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
