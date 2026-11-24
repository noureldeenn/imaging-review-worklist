import { Component, type ReactNode } from 'react';

interface Props {
  resetKey: string;
  children: ReactNode;
}

interface State {
  failed: boolean;
  seenKey: string;
}

// React 18 has no hook for error boundaries, hence the class. No componentDidCatch: nothing is
// logged: the error may carry study data, and the alert is the whole contract.
export class ViewerErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, seenKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.seenKey) return { failed: false, seenKey: props.resetKey };
    return null;
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <p
          role="alert"
          className="m-4 w-fit rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          The viewer crashed. Close and reopen the study.
        </p>
      );
    }
    return this.props.children;
  }
}
