// Public documents must follow the app base path, including sub-path deployments.
export const docUrl = (fileName: string) =>
  `${import.meta.env.BASE_URL}docs/${encodeURIComponent(fileName)}`;
