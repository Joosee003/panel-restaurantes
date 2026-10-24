import type { NextConfig } from "next";

function supabaseOrigins() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("SUPABASE_URL_REQUIRED");
  }
  let url: URL;
  try {
    url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    throw new Error("INVALID_SUPABASE_URL");
  }
  const local = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const approvedRef = process.env.GASTROHELP_APPROVED_PROJECT_REF;
  const release = process.env.GASTROHELP_DEPLOYMENT_MODE === "approved-production";
  const remote = release && /^[a-z0-9]{20}$/.test(approvedRef || "")
    && url.protocol === "https:" && url.hostname === `${approvedRef}.supabase.co`;
  if (release && !remote) throw new Error("APPROVED_PRODUCTION_PROJECT_REQUIRED");
  if (!local && !remote) throw new Error("ISOLATED_CLONE_REMOTE_SUPABASE_FORBIDDEN");
  if (remote && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID || "")) {
    throw new Error("NEW_TALGO_RESTAURANT_ID_REQUIRED");
  }
  const websocket = new URL(url.href);
  websocket.protocol = local ? "ws:" : "wss:";
  return [url.origin, websocket.origin];
}

const localOrigins = supabaseOrigins();
const approvedProduction = process.env.GASTROHELP_DEPLOYMENT_MODE === "approved-production";
const newTalgoIndexable = approvedProduction && process.env.NEW_TALGO_INDEXING_APPROVED === "yes";
const newTalgoPublicHost = process.env.NEW_TALGO_PUBLIC_HOST?.toLowerCase().trim();
if (approvedProduction && process.env.NEW_TALGO_PUBLICATION_APPROVED !== "yes") {
  throw new Error("NEW_TALGO_CONTENT_AND_PHOTO_RIGHTS_APPROVAL_REQUIRED");
}
if (approvedProduction && !/^[a-zA-Z0-9]{32}$/.test(process.env.NEW_TALGO_PUBLIC_MENU_TOKEN || "")) {
  throw new Error("NEW_TALGO_PUBLIC_MENU_TOKEN_REQUIRED");
}
if (newTalgoPublicHost && (!approvedProduction || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(newTalgoPublicHost)
  || newTalgoPublicHost === "panel.gastrohelp.es")) {
  throw new Error("NEW_TALGO_PUBLIC_HOST_REQUIRES_APPROVED_PRODUCTION");
}
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${localOrigins[0]}`,
  "font-src 'self' data:",
  `connect-src 'self' ${localOrigins.join(" ")}`.trim(),
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://www.google.com https://maps.google.com",
  ...(approvedProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
];

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/panel-personalizado/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/new-talgo/:path*",
        headers: [{ key: "X-Robots-Tag", value: newTalgoIndexable ? "index, follow" : "noindex, nofollow, noarchive" }],
      },
      {
        source: "/pruebas-resenas/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy.replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'") },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/c/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/club/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/r/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        source: "/reserva/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/new-talgo", destination: "/new-talgo/index.html", permanent: false }];
  },
  async rewrites() {
    if (!newTalgoPublicHost) return [];
    const has = [{ type: "host" as const, value: newTalgoPublicHost }];
    return [
      { source: "/", destination: "/new-talgo/index.html", has },
      ...["index.html", "carta.html", "visitanos.html", "styles.css", "app.js", "content.js", "menu-live.js", "promotions-live.js"]
        .map(path => ({ source: `/${path}`, destination: `/new-talgo/${path}`, has })),
      { source: "/assets/:path*", destination: "/new-talgo/assets/:path*", has },
    ];
  },
};

export default nextConfig;
