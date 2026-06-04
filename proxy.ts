import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing(.*)",
  "/pro-finance(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/security(.*)",
  "/demo(.*)",
  "/invite(.*)",
  // SEO / crawler + metadata endpoints — must be reachable without auth.
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/opengraph-image(.*)",
  "/twitter-image(.*)",
  "/icon.png",
  "/apple-icon.png",
  "/api/health(.*)",
  "/api/webhooks(.*)",
  "/api/inngest(.*)",
  // Slack calls these server-to-server (no Clerk session); they're secured by
  // Slack request-signature verification inside the handlers, not by auth.
  // /slack/install and /slack/callback are intentionally NOT public — they run
  // in the browser and read the Clerk session.
  "/api/integrations/slack/interactivity(.*)",
  "/api/integrations/slack/commands(.*)",
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
