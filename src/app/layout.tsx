import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupplyMesh | MSE",
  description:
    "Map supplier dependencies, model supply disruptions, and coordinate recovery with an auditable deterministic planning workspace.",
  icons: { icon: "/supplymesh-mark.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
