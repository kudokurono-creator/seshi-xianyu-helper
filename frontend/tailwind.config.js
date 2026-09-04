/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: 'var(--accent)',
        spectral: {
          app: 'var(--bg-app)',
          sidebar: 'var(--bg-sidebar)',
          primary: 'var(--surface-primary)',
          secondary: 'var(--surface-secondary)',
          hover: 'var(--surface-hover)',
          raised: 'var(--surface-raised)',
          accent: 'var(--accent)',
          'accent-bright': 'var(--accent-bright)',
          'accent-soft': 'var(--accent-soft)',
          'text-primary': 'var(--text-primary)',
          'text-secondary': 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          'status-success': 'var(--status-success)',
          'status-warning': 'var(--status-warning)',
          'status-danger': 'var(--status-danger)',
        },
      },
      borderRadius: {
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
