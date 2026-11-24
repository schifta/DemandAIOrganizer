import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "EcoColetas — Gestão de Coletas e Trocas",
  description:
    "Painel operacional de fila de coletas e trocas via WhatsApp para gestão logística sustentável.",
};

const initPreferencesScript = `
(function() {
  try {
    var theme = localStorage.getItem('eco_theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
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
    <html lang="pt-BR" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initPreferencesScript }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
