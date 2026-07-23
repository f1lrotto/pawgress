import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: "prompt",
    includeAssets: [
      "favicon.svg",
      "apple-touch-icon.png",
      "pwa-192x192.png",
      "pwa-512x512.png",
      "maskable-512x512.png",
    ],
    manifest: {
      id: "/",
      name: "Pawgress",
      short_name: "Pawgress",
      description: "Keep your puppy's daily routine clear, calm, and shared.",
      lang: "en",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f4f0e6",
      theme_color: "#f4f0e6",
      icons: [
        {
          src: "/pwa-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "/maskable-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      cleanupOutdatedCaches: true,
      clientsClaim: false,
      skipWaiting: false,
      navigateFallback: "index.html",
      navigateFallbackDenylist: [/^\/api\//, /^\/convex\//],
    },
  }), cloudflare()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});