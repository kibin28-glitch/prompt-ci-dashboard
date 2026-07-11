import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://prompt-ci-dashboard.vercel.app"),
  title: "Prompt CI — regression testing for LLM prompts",
  description:
    "Catch LLM prompt regressions before they ship. Run saved test cases against a baseline in your CLI or on every PR, and get a shareable pass/fail report.",
  openGraph: {
    title: "Prompt CI — regression testing for LLM prompts",
    description:
      "Catch LLM prompt regressions before they ship. Run saved test cases against a baseline in your CLI or on every PR, and get a shareable pass/fail report.",
    url: "https://prompt-ci-dashboard.vercel.app",
    siteName: "Prompt CI",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Prompt CI — regression testing for LLM prompts",
    description:
      "Catch LLM prompt regressions before they ship. Run saved test cases against a baseline in your CLI or on every PR, and get a shareable pass/fail report.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
