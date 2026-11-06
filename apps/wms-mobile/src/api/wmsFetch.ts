/** Native transport keeps the configured API URL and fetch options intact. */
export const wmsFetch: typeof fetch = (input, init) => fetch(input, init);
