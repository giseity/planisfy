import { ImageResponse } from 'next/og'
import { planisfyBrandColors, planisfyMarkPaths, planisfyMarkViewBox } from 'assets/brand'

export const alt = 'Planisfy - open-source, self-hostable map infrastructure'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

function Mark() {
  return (
    <svg width="154" height="176" viewBox={planisfyMarkViewBox}>
      {planisfyMarkPaths.map((path) => (
        <path key={path.d} d={path.d} fill={path.fill} />
      ))}
    </svg>
  )
}

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #fbfaf5 0%, #efe7d7 100%)',
        color: planisfyBrandColors.foreground,
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.42,
          backgroundImage:
            'linear-gradient(#ded5c7 1px, transparent 1px), linear-gradient(90deg, #ded5c7 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'relative',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '64px 76px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 42 }}>
          <Mark />
          <div style={{ fontSize: 104, fontWeight: 600, letterSpacing: 0, lineHeight: 1 }}>
            Planisfy
          </div>
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 34,
            fontWeight: 500,
            color: planisfyBrandColors.mutedForeground,
            textAlign: 'center',
          }}
        >
          Open-source, self-hostable map infrastructure
        </div>
      </div>
    </div>,
    size
  )
}
