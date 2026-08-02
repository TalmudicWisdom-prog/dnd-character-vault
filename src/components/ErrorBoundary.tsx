import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  characterIdFromRoute,
  clearPortraitRecoveryState,
  recordRouteCrash,
  resetCharacterPortraitFraming,
  suppressPortraitForSession,
} from "../app/portraitRecovery";
import { checkForAppUpdate, installWaitingUpdate } from "../pwa/updates";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { actionStatus: string; characterId: string; error: Error | null; failedRoute: string };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { actionStatus: "", characterId: "", error: null, failedRoute: "" };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const failedRoute = typeof window === "undefined" ? "#characters" : window.location.hash || "#characters";
    const characterId = characterIdFromRoute(failedRoute);
    recordRouteCrash(failedRoute);
    this.setState({ characterId, failedRoute });
    console.error(`Application view failed: ${error.name}: ${error.message}\n${info.componentStack}`);
  }

  private tryAgain = () => {
    this.setState({ actionStatus: "", error: null });
  };

  private openWithoutPortrait = () => {
    if (this.state.characterId) suppressPortraitForSession(this.state.characterId, this.state.failedRoute);
    this.setState({ actionStatus: "Opening with the portrait temporarily hidden...", error: null });
  };

  private resetPortraitFraming = async () => {
    this.setState({ actionStatus: "Resetting only this portrait’s framing..." });
    const reset = await resetCharacterPortraitFraming(this.state.characterId);
    if (!reset) {
      this.setState({ actionStatus: "The character could not be found. No data was changed." });
      return;
    }
    clearPortraitRecoveryState();
    this.setState({ actionStatus: "Portrait framing reset. Opening character...", error: null });
  };

  private returnToVault = () => {
    clearPortraitRecoveryState();
    if (typeof window !== "undefined") window.location.hash = "characters";
    this.setState({ actionStatus: "", error: null });
  };

  private reloadSafely = async () => {
    this.setState({ actionStatus: "Checking for the stability update..." });
    try {
      const result = await checkForAppUpdate();
      if (result.available && installWaitingUpdate()) {
        this.setState({ actionStatus: "Installing the stability update. Local character data will remain untouched." });
        return;
      }
      this.setState({ actionStatus: "Reloading the repaired app without clearing local data..." });
      window.location.reload();
    } catch {
      this.setState({ actionStatus: "The update check was unavailable. Try again when online; your local data remains safe." });
    }
  };

  render() {
    if (this.state.error) {
      return (
        <section className="page">
          <div className="panel error-panel">
            <span className="card-label">Local app error</span>
            <h1>This view could not open</h1>
            <p>{this.state.error.name}: {this.state.error.message}</p>
            <p>No character data has been cleared. Choose a targeted recovery action below.</p>
            {this.state.actionStatus && <p aria-live="polite" className="inline-message">{this.state.actionStatus}</p>}
            <div className="error-recovery-actions">
              <button className="primary-button" onClick={this.tryAgain} type="button">Try Again</button>
              {this.state.characterId && <button className="secondary-button" onClick={this.openWithoutPortrait} type="button">Open Character Without Portrait</button>}
              {this.state.characterId && <button className="secondary-button" onClick={() => void this.resetPortraitFraming()} type="button">Reset This Character’s Portrait Framing</button>}
              <button className="secondary-button" onClick={() => void this.reloadSafely()} type="button">Reload safely</button>
              <button className="text-button" onClick={this.returnToVault} type="button">Return to Character Vault</button>
            </div>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
