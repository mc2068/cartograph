import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Header } from "./header";
import { parseTheme, THEME_COOKIE } from "./theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cartograph",
  description: "Draws a GitHub repository as a dependency map.",
};

// Clerk's components take the app's colour tokens, so they follow the theme
// control like everything else instead of staying light.
//
// The tokens carry an app- prefix because Clerk sets --accent and --border on
// its own buttons. Handing it var(--accent) made that property refer to itself,
// and the button lost its background.
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--app-accent)",
    colorPrimaryForeground: "#ffffff",
    colorBackground: "var(--app-background)",
    colorForeground: "var(--app-foreground)",
    colorMutedForeground: "var(--app-muted)",
    colorNeutral: "var(--app-foreground)",
    colorInput: "var(--app-background)",
    colorInputForeground: "var(--app-foreground)",
    fontFamily: "var(--font-geist-sans)",
    borderRadius: "0.25rem",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Read on the server so a forced theme is in the first HTML response. No
  // attribute means follow the system.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ClerkProvider appearance={clerkAppearance}>
          <Header theme={theme} />
          <main className="flex flex-1 flex-col">{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
