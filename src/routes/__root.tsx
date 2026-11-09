import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { NotFoundPage } from "@/components/not-found";
import { Ga4Analytics } from "@/components/ga4-analytics";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "roomeo · spare PG beds for working professionals" },
      { name: "description", content: "Spare PG beds in Mangaluru. People choose their own group. Chat free, ₹589 once when you lock a bed. Zero commission on rent." },
      { name: "theme-color", content: "var(--color-brand)" },
    ],
    scripts: [{ children: THEME_INIT_SCRIPT }],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  notFoundComponent: NotFoundPage,
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <Ga4Analytics />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
