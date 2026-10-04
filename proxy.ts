import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Protected unless listed here, so a new route is private by default. The
// redirect happens in the proxy, before the page renders any HTML.
//
// /preview is public because it exists to show the interface without an
// account. It reads a checked-in file, never the database.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/preview(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
