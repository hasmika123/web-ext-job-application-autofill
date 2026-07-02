/** The autofill engine is vanilla JS attached to window.JAF (untyped here). */
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    JAF: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mammoth?: any;
  }
}

export {};
