import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // Cast process to any to avoid TS errors in some environments
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Polyfill process.env.API_KEY. 
      // Fallback to empty string '' if API_KEY is missing during build (e.g. on Vercel before config)
      // This prevents "JSON.stringify(undefined)" issues.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
    }
  }
})