import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Härissa Foods',
  description: 'Asistente virtual de Härissa Foods — Modern Mediterranean Food',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, sans-serif', background: '#f5f0eb' }}>
        {children}
      </body>
    </html>
  )
}
