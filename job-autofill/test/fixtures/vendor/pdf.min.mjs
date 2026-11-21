export const GlobalWorkerOptions = {};

export function getDocument() {
  return {
    promise: Promise.resolve({
      numPages: 1,
      async getPage() {
        return {
          async getTextContent() {
            return { items: [] };
          },
        };
      },
    }),
  };
}
