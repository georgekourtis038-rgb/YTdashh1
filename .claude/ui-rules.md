# Axis UI Rules

## Colors
- Background: #0a0f0e
- Accent/mint: #2de8a2
- Accent dim: rgba(45,232,162,0.4)
- Card bg: rgba(255,255,255,0.04)
- Card border: rgba(255,255,255,0.08)
- Section label: rgba(255,255,255,0.4)
- Subtle text: rgba(255,255,255,0.3)

## Cards
- background: rgba(255,255,255,0.04)
- border: 1px solid rgba(255,255,255,0.08)
- border-radius: 16px
- padding: 16px

## Liquid Glass (topbar/bottombar only)
- -webkit-backdrop-filter ALWAYS before backdrop-filter
- blur max 20px on mobile
- NEVER overflow:hidden on glass elements
- background: rgba(8,12,11,0.85)
- border: 1px solid rgba(255,255,255,0.1)

## Typography
- Section headers: font-size 11px, letter-spacing 2px, color rgba(255,255,255,0.4), uppercase
- Body: white, font-size 15px
- Large numbers: white, font-weight 700
- Taglines: rgba(255,255,255,0.3), font-size 13px

## Animations
- Scroll reveal: translateY(40px) → 0, opacity 0→1, 650ms cubic-bezier(0.16,1,0.3,1)
- Stagger: 80ms between siblings
- Only animate transform and opacity — never box-shadow or filter
- Always add will-change:transform and backface-visibility:hidden to animated elements
- prefers-reduced-motion must be respected

## Buttons
- Primary: white background, black text, border-radius 12px
- Secondary: rgba(255,255,255,0.06) background, white text, border 1px solid rgba(255,255,255,0.1)
- Mint CTA: background rgba(45,232,162,0.1), border 2px solid #2de8a2, white text

## iOS Safari Rules
- font-size: 16px on ALL inputs (prevents zoom)
- -webkit-backdrop-filter before backdrop-filter always
- No overflow:hidden with backdrop-filter
- Use translateZ(0) in keyframes to force GPU
- Safe area: max(Xpx, env(safe-area-inset-top))
- will-change:transform + backface-visibility:hidden on all animating elements
