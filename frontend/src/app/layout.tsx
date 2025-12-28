import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FaceAuth - Secure Authentication',
  description: 'Deepfake-resistant facial authentication system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

