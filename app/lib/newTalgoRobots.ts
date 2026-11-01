export function newTalgoPublicRobots(host: string): string {
  return [
    "User-agent: *",
    "Disallow: /",
    "Allow: /$",
    "Allow: /carta.html$",
    "Allow: /visitanos.html$",
    "Allow: /assets/",
    "Allow: /styles.css$",
    "Allow: /premium.css$",
    "Allow: /app.js$",
    "Allow: /content.js$",
    "Allow: /menu-live.js$",
    "Allow: /promotions-live.js$",
    "Allow: /sitemap.xml$",
    `Sitemap: https://${host}/sitemap.xml`,
    "",
  ].join("\n");
}
