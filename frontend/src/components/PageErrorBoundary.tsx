import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

export class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="panel space-y-4">
      <p className="eyebrow">Let’s get you back</p>
      <h1 className="text-2xl font-bold">This page couldn’t load</h1>
      <p className="text-sm leading-relaxed text-slate-500">Your saved rounds are still on the server. Reload this page to try again, or return to your dashboard.</p>
      <div className="flex flex-wrap gap-3"><button className="btn-primary" onClick={() => window.location.reload()}>Reload page</button><Link to="/" className="btn-secondary">Back to dashboard</Link></div>
    </section>;
  }
}
