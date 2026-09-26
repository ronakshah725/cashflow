// Vitest setup: stub browser APIs that jsdom doesn't implement but the
// dashboard components touch (MoneyFlow measures its container width).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as Record<string, unknown>).ResizeObserver = ResizeObserverStub;
}
