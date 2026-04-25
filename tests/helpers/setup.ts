import "@testing-library/jest-dom/vitest";

// Polyfill ResizeObserver for jsdom (used by @radix-ui/react-scroll-area)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

// jsdom's Blob lacks .stream(); Node's undici (used by the global Response)
// calls it during `new Response(blob)`, which fails on CI even though some
// local jsdom builds already provide it.
if (typeof Blob !== "undefined" && typeof Blob.prototype.stream !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Blob.prototype as any).stream = function (this: Blob) {
    const blob = this;
    return new ReadableStream({
      async start(controller) {
        const buffer = await blob.arrayBuffer();
        controller.enqueue(new Uint8Array(buffer));
        controller.close();
      },
    });
  };
}
