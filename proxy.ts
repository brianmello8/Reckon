import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/security(.*)",
  "/demo(.*)",
  "/invite(.*)",
  "/api/health(.*)",
  "/api/webhooks(.*)",
  "/api/inngest(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    const { userId, redirectToSignIn } = await auth();
    // Redirect signed-out users to sign-in (instead of auth.protect()'s 404),
    // preserving where they were headed so they land there after auth.
    if (!userId) {
      return redirectToSignIn({ returnBackUrl: request.url });
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
