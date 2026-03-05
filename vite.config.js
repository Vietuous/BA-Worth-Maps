import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/BA-Worth Maps/', // REPLACE 'worth-map-tool' with your actual repo name!
  plugins: [vue()]
})
