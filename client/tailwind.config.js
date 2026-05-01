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
        background: "hsl(var(--background, 222.2 84% 4.9%))"
      },
       keyframes: {
      'fade-in-down': {
        '0%': { opacity: '0', transform: 'translateY(-20px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      },
      'fade-in': {
        '0%': { opacity: '0' },
        '100%': { opacity: '1' },
      }
    },
    animation: {
      'fade-in-down': 'fade-in-down 0.8s ease-out',
      'fade-in': 'fade-in 0.5s ease-out',
    }
    } 
  },
  plugins: [],
  
}

