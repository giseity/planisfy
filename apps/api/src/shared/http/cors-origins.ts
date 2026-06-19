const defaultCorsOrigins = [
  "https://planisfy.localhost",
  "https://console.planisfy.localhost",
  "https://admin.planisfy.localhost",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3003",
  "https://console.planisfy.com",
];

export function apiCorsOrigins(config: { apiUrl: string; consoleUrl: string }) {
  return [
    ...new Set([
      ...defaultCorsOrigins,
      new URL(config.apiUrl).origin,
      new URL(config.consoleUrl).origin,
    ]),
  ];
}
