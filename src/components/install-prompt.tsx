import { useState, useEffect, useRef } from "react";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "blipp-install-prompt-dismissed";

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Don't show if dismissed this session
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setShow(false);
    sessionStorage.setItem(DISMISSED_KEY, "1");
  }

  async function install() {
    const prompt = deferredPromptRef.current;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    deferredPromptRef.current = null;
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3 mb-4">
      <div className="w-10 h-10 bg-foreground/10 rounded-lg flex items-center justify-center flex-shrink-0">
        <Download className="w-5 h-5 text-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Install Blipp</p>
        <p className="text-xs text-muted-foreground">Add to your home screen for quick access</p>
      </div>
      <button
        onClick={install}
        className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg flex-shrink-0"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
