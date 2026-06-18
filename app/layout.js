import "./globals.css";

export const metadata = {
  title: "Dinner Forecast — The Holme Valley Almanac",
  description:
    "A recency-weighted forecast of the next seven dinners, sampled from what you actually eat.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16302B",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
