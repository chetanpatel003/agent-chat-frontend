import { clerkMiddleware } from "@clerk/nextjs/server";

// Standard Clerk App Router middleware — required for ClerkProvider /
// useAuth to resolve session state. The actual API authorization decision
// is made by the backend (verifies its own bearer token independently per
// project-docs/decisions/0001) — this middleware only makes Clerk's client
// state available in this app, it is not a security boundary for the API.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
