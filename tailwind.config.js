/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // PARTIAL-ROUNDED design language (game-wide): a two-value radius rounds
      // the top-left + bottom-right corners and keeps the other two near-square,
      // so every card, button and field reads as straight-edged with a soft
      // diagonal accent. rounded / rounded-sm / rounded-full are untouched.
      borderRadius: {
        md: '7px 2px',
        lg: '9px 2px',
        xl: '12px 3px',
        '2xl': '16px 4px',
        '3xl': '22px 5px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fadeIn': 'fadeIn 0.3s ease-in',
        'slideInLeft': 'slideInLeft 0.3s ease-out',
        'bounce-in': 'bounceIn 0.5s ease-out',
        'progress-fill': 'progressFill 0.8s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        progressFill: {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
      },
    },
  },
  plugins: [],
}
