import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "EcoColetas — Gestão de Coletas e Trocas",
  description:
    "Painel operacional de fila de coletas e trocas via WhatsApp para gestão logística sustentável.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EcoColetas",
  },
};

export const viewport: Viewport = {
  themeColor: "#B91C1C",
};

const initPreferencesScript = `
(function() {
  try {
    var theme = localStorage.getItem('eco_theme');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    var scale = localStorage.getItem('eco_font_scale');
    if (scale === '87.5%' || scale === '100%' || scale === '112.5%' || scale === '125%') {
      document.documentElement.style.fontSize = scale;
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initPreferencesScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
