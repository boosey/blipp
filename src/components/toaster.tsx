import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        className: "bg-zinc-900 text-zinc-50 border-zinc-800",
        duration: 3000,
      }}
      richColors
    />
  );
}
