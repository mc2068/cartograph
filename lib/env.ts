// Imported by next.config.ts, so a missing value stops `next dev`, `next build`
// and `next start` before anything is served, and names every missing variable
// at once instead of the first one.

const missing: string[] = [];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    missing.push(name);
    return "";
  }
  return value;
}

export const env = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: required(
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ),
  CLERK_SECRET_KEY: required("CLERK_SECRET_KEY"),
  // Clerk reads these four itself. They are what make every sign-in method
  // start and end in the same place, so a blank one is a boot failure too.
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: required("NEXT_PUBLIC_CLERK_SIGN_IN_URL"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: required("NEXT_PUBLIC_CLERK_SIGN_UP_URL"),
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: required(
    "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  ),
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: required(
    "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  ),
  NEXT_PUBLIC_SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ),
};

if (missing.length > 0) {
  throw new Error(
    `Missing environment variables: ${missing.join(", ")}. Set them in .env.local.`,
  );
}
