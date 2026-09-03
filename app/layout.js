export const metadata = {
  title: "ක්‍රික්බස් ස්ක්‍රේපර් | Cricbuzz Scraper",
  description: "Cricbuzz match data scraper with Sinhala JSON output",
};

export default function RootLayout({ children }) {
  return (
    <html lang="si">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "20px", backgroundColor: "#0a0a0a", color: "#ededed" }}>
        {children}
      </body>
    </html>
  );
}
