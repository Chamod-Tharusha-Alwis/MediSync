import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

/**
 * HistoryErrorBoundary
 * React Error Boundary specifically designed to isolate rendering faults
 * in medical history records, preventing unhandled exceptions from crashing
 * the parent consultation wizard or history viewers.
 */
export default class HistoryErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.resetErrorBoundary = this.resetErrorBoundary.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn(
      '[HistoryErrorBoundary] Captured render error in medical history panel (sanitized notice):',
      error?.message || error
    );
    if (typeof this.props.onError === 'function') {
      try {
        this.props.onError(error, errorInfo);
      } catch {
        // Ignore errors in logging callback
      }
    }
  }

  resetErrorBoundary() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          resetErrorBoundary: this.resetErrorBoundary,
        });
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="polite"
          className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-start gap-3 my-4"
        >
          <FiAlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="font-semibold text-white">
              Notice: Unable to render complete historical record
            </p>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              A record in the patient's medical history could not be formatted. Your consultation session remains active and you can proceed with symptoms and e-prescriptions.
            </p>
            {typeof this.props.onProceed === 'function' && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={this.props.onProceed}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-500/40 transition-colors"
                >
                  Proceed to Symptoms
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
