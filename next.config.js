/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Force HTTPS for 2 years, include subdomains, allow preload
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Block clickjacking / iframe embedding
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Prevent MIME-sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URL to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Allow only camera (we need it for proctoring); deny everything else
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), display-capture=(), fullscreen=(self), payment=(), usb=()" },
  // No-cache for HTML responses (avoids stale auth state on shared machines)
  { key: "Cache-Control", value: "no-store, max-age=0" },
];

module.exports = {
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};
