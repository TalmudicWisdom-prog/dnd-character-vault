import { useEffect, useState } from "react";
import { checkForAppUpdate, installWaitingUpdate, onUpdateAvailable } from "../pwa/updates";

export function UpdatePrompt() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => onUpdateAvailable(() => {
    setVisible(true);
    setMessage("Update Available");
  }), []);

  useEffect(() => {
    const check = async () => {
      setMessage("Checking for updates...");
      const result = await checkForAppUpdate();
      setVisible(result.available);
      setMessage(result.message);
      if (!result.available) window.setTimeout(() => setMessage(""), 2200);
    };
    window.addEventListener("vault:pull-refresh", check);
    return () => window.removeEventListener("vault:pull-refresh", check);
  }, []);

  if (!message) return null;

  return (
    <aside className={visible ? "update-prompt visible" : "update-prompt"} role="status">
      <strong>{message}</strong>
      {visible ? <div>
        <button className="primary-button compact" onClick={() => installWaitingUpdate()} type="button">Install Now</button>
        <button className="secondary-button compact" onClick={() => { setVisible(false); setMessage("Update postponed. Check Settings when you are ready."); window.setTimeout(() => setMessage(""), 2200); }} type="button">Later</button>
      </div> : <small>Pull-to-refresh checked for app updates. Your local vault data stays on this device.</small>}
    </aside>
  );
}
