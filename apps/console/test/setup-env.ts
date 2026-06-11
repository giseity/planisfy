const testEnv = {
  NEXT_PUBLIC_APP_URL: "https://console.planisfy.localhost",
  NEXT_PUBLIC_API_URL: "https://api.planisfy.localhost",
  NEXT_PUBLIC_ADMIN_URL: "https://admin.planisfy.localhost",
  NEXT_PUBLIC_MARKETING_URL: "https://planisfy.localhost",
  NEXT_PUBLIC_AUTH_ORIGIN: "https://console.planisfy.localhost",
  NEXT_PUBLIC_CONSOLE_API_PATH: "/api/v1/console",
} as const;

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] ??= value;
}
