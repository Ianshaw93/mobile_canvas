import useAuthRedirect from '@/hooks/useAuthRedirect';
import '@/styles/globals.css'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps: {session, ...pageProps} }: AppProps) {
  useAuthRedirect();
  return (
    <Component {...pageProps} />
)
}
