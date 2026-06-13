# Axis UI Rules — Aurora

## Colors
- Background: #0a0d0c
- Body gradient: radial-gradient(135% 80% at 50% -8%, #102a22 0%, #0a1512 36%, #070b0a 72%, #060908 100%)
- Accent: #2de8a2
- Accent gradient: linear-gradient(180deg, #2de8a2, #1ec78a)
- Accent glow: rgba(45,232,162,0.5)
- Blue accent: #6f9bff
- Card bg: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.022))
- Card border: 1px solid rgba(255,255,255,0.08)
- Accent card bg: linear-gradient(180deg, rgba(45,232,162,0.08), rgba(255,255,255,0.022))
- Accent card border: 1px solid rgba(45,232,162,0.16)

## Cards
- background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.022))
- border: 1px solid rgba(255,255,255,0.08)
- border-radius: 24px
- padding: 20px
- box-shadow: inset 0 1px 0 rgba(255,255,255,0.07)

## Typography
- Primary font: 'Geist', 'Space Grotesk', system-ui, sans-serif
- Mono font: 'Geist Mono', monospace
- Section labels: Geist Mono, 11px, letter-spacing 0.16em, uppercase, rgba(255,255,255,0.42)
- Headings (h1): Geist, 29px, font-weight 600, letter-spacing -0.02em
- Body: rgba(255,255,255,0.86), 15px
- Data values: Geist Mono, 12-14px

## Buttons
- Primary: background linear-gradient(180deg,#2de8a2,#1ec78a), color #04140d, border-radius 14px, height 46-54px
- Secondary: background rgba(255,255,255,0.05), border 1px solid rgba(255,255,255,0.1), color rgba(255,255,255,0.8), border-radius 14px
- Danger: border 1px solid rgba(255,80,80,0.25), background rgba(255,80,80,0.06), color rgba(255,140,140,0.9)

## Glass / Topbar
- background: rgba(12,18,16,0.72)
- -webkit-backdrop-filter: blur(26px) saturate(170%)
- backdrop-filter: blur(26px) saturate(170%)
- border-radius: 26px
- box-shadow: 0 14px 44px -10px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.09)
- NEVER overflow:hidden on glass elements
- Always -webkit-backdrop-filter before backdrop-filter

## Progress Bars
- Track: height 7px, border-radius 6px, background rgba(255,255,255,0.07)
- Green: linear-gradient(90deg,#13b683,#2de8a2), box-shadow 0 0 12px rgba(45,232,162,0.5)
- Blue: linear-gradient(90deg,#4a72c8,#6f9bff), box-shadow 0 0 12px rgba(111,155,255,0.45)
- Gold: #d9b25a

## iOS Safari Rules
- font-size: 16px on ALL inputs
- -webkit-backdrop-filter before backdrop-filter always
- No overflow:hidden with backdrop-filter
- Safe area: max(Xpx, env(safe-area-inset-top))
- will-change:transform + backface-visibility:hidden on animated elements
- prefers-reduced-motion must be respected

## Animations
- axPulse: 0%,100% opacity 0.55 → 50% opacity 1
- axBreath: scale 1→1.06, opacity 0.85→1, 4s ease-in-out infinite
- axRise: translateY(22px)→0
- axSpin: rotate 0→360deg
- Only animate transform and opacity
