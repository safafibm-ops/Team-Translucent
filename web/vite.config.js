import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` serves the UI on :5173 and forwards API calls to FastAPI on :8000.
const api = ["/inspect", "/summary", "/inspections", "/review", "/early-warning", "/machines", "/work-orders", "/health", "/retrain", "/rules"];

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: Object.fromEntries(api.map((p) => [p, "http://localhost:8000"])) },
});
