export const metadata = {
  title: "Cricbuzz Scraper | Created By Viruna Randinu",
  description: "Cricbuzz match data scraper - paste any Cricbuzz live URL and get full match data",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", margin: 0, padding: "20px", backgroundColor: "#0a0a0a", color: "#e0e0e0" }}>
        {children}
      </body>
    </html>
  );
}
