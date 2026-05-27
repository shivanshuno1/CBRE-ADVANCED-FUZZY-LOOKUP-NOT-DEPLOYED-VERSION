import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// React Compiler Babel preset (simulate reactCompilerPreset)
// Note: @rolldown/plugin-babel expects standard Babel presets.
// For React Compiler, you'd normally use babel-plugin-react-compiler.
// But since you provided a custom preset, I'll assume you have it.
const reactCompilerPreset = () => {
  return {
    plugins: [
      // Placeholder – replace with actual React Compiler plugin
      // 'babel-plugin-react-compiler'
    ]
  }
}

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()]
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
})