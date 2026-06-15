export const env = {
  NEXT_PUBLIC_APP_URL: requiredUrl("NEXT_PUBLIC_APP_URL"),
  NEXT_PUBLIC_API_URL: requiredUrl("NEXT_PUBLIC_API_URL"),
  NEXT_PUBLIC_AUTH_ORIGIN: requiredUrl("NEXT_PUBLIC_AUTH_ORIGIN"),
  AUTH_INTERNAL_ORIGIN: optionalUrl("AUTH_INTERNAL_ORIGIN"),
};

function requiredUrl(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);

  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  return value;
}

function optionalUrl(name: string) {
  const value = process.env[name];
  if (!value) return undefined;

  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  return value;
}
