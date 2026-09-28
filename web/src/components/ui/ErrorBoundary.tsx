"use client";

import { Component, type ReactNode } from "react";

import { Notice } from "./States";

/** Contain a rendering failure to one part of the page. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[${this.props.label}]`, error);
  }

  render() {
    if (this.state.failed)
      return (
        <Notice tone="error">
          The {this.props.label} section hit an unexpected problem and could not be shown. Other sections still
          work.{" "}
          <button type="button" className="button button--small" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
        </Notice>
      );
    return this.props.children;
  }
}
