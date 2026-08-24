import type { Metadata } from "next";
import { Anton, Archivo, Space_Mono } from "next/font/google";
import "./globals.css";
import Nav from "./Nav";

const display = Anton({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const body = Archivo({ variable: "--font-body", subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const mono = Space_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "YOU UGLY — Draft Board",
  description: "Value-over-replacement draft board for the YOU UGLY fantasy league.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
