export {};

declare global {
  // Claims added to the Clerk session token on top of the defaults. The
  // organization id is a default claim; the name is not, and organization slugs
  // are off for this instance, so the name is added as a custom claim.
  interface CustomJwtSessionClaims {
    org_name?: string;
  }
}
