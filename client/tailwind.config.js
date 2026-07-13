/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: { 
    extend: {
      colors: {
        primary: '#1565C0',
        primaryDark: '#0D3B66',
        secondary: '#00838F',
        success: '#2E7D32',
        warning: '#F9A825',
        danger: '#C62828',
        bgLight: '#F8FAFF',
        border: "hsl(var(--border, 217.2 32.6% 17.5%))",
        foreground: "hsl(var(--foreground, 210 40% 98%))",
        background: "hsl(var(--background, 222.2 84% 4.9%))",
        brand: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        clinical: {
          blue: '#3b82f6',
          indigo: '#6366f1',
          slate: '#0f172a',
          dark: '#020817',
          card: 'rgba(15, 23, 42, 0.45)'
        }
      },
       keyframes: {
      'fade-in-down': {
        '0%': { opacity: '0', transform: 'translateY(-20px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      },
      'fade-in': {
        '0%': { opacity: '0' },
        '100%': { opacity: '1' },
      },
      'slide-in-right': {
        '0%': { transform: 'translateX(100%)', opacity: '0' },
        '100%': { transform: 'translateX(0)', opacity: '1' }
      },
      'pulse-subtle': {
        '0%, 100%': { opacity: '1', transform: 'scale(1)' },
        '50%': { opacity: '0.85', transform: 'scale(0.98)' }
      }
    },
    animation: {
      'fade-in-down': 'fade-in-down 0.8s ease-out',
      'fade-in': 'fade-in 0.5s ease-out',
      'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      'pulse-subtle': 'pulse-subtle 3s infinite ease-in-out'
    }
    } 
  },
  plugins: [],
  
}

