import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark Navy / Cyber Blue theme
        'dark-navy': '#0a0e1a',
        'navy-950': '#070b14',
        'navy-900': '#0c1322',
        'navy-800': '#0f1724',
        'navy-700': '#1a2332',
        'navy-600': '#243447',
        'cyber-blue': '#00d4ff',
        'neon-cyan': '#00f0ff',
        'status-green': '#00ff88',
        'warning-orange': '#ff8c00',
        'error-red': '#ff3366',
        'pixel-border': '#1e3a5f',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        pixel: ['Press Start 2P', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'pixel': '4px 4px 0px 0px rgba(0, 212, 255, 0.3)',
        'pixel-sm': '2px 2px 0px 0px rgba(0, 212, 255, 0.3)',
        'glow': '0 0 15px rgba(0, 212, 255, 0.15)',
        'glow-green': '0 0 15px rgba(0, 255, 136, 0.15)',
        'card': '0 0 0 2px rgba(0, 212, 255, 0.1)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-slow': 'bounce 2s infinite',
        'float': 'float 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'slide-right': 'slideRight 0.3s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 212, 255, 0.2)' },
          '50%': { boxShadow: '0 0 20px rgba(0, 212, 255, 0.4)' },
        },
        slideRight: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
