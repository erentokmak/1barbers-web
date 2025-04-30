import '@/styles/globals.css'
import { Base, Main } from '@/components/layout'
import { Toaster } from '@/ui/toaster'
import { ApolloProvider } from '@apollo/client'
import client from '@/lib/apollo-client'
import { useRouter } from 'next/router'
import { SessionProvider, useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'

// Types
type AppProps = {
  Component: React.ComponentType<any>
  pageProps: any
}

// Constants
const PUBLIC_PATHS = [
  '/auth/sign-in',
  '/auth/forgot-password',
  '/auth/sign-up',
  '/reservation',
  '/',
  '/about',
  '/gallery',
] as const

// App Content Component
function AppContent({ Component, pageProps }: AppProps) {
  const { data: session, status } = useSession()
  const router = useRouter()

  const isPublicPath = PUBLIC_PATHS.includes(
    router?.pathname as (typeof PUBLIC_PATHS)[number],
  )

  // Simplified auth redirect logic
  useEffect(() => {
    // Only redirect to sign-in if user is not authenticated and tries to access protected route
    if (status === 'unauthenticated' && !isPublicPath) {
      router?.push('/auth/sign-in')
    }
  }, [status, router, isPublicPath])

  // Show loading state or content
  if (status === 'loading') {
    return null
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      //enableSystem
      disableTransitionOnChange
    >
      <ApolloProvider client={client}>
        <Base>
          <Main>
            <Component {...pageProps} />
          </Main>
        </Base>
        <Toaster />
      </ApolloProvider>
    </ThemeProvider>
  )
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <SessionProvider session={pageProps.session}>
      <AppContent Component={Component} pageProps={pageProps} />
    </SessionProvider>
  )
}
