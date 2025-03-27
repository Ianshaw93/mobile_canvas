import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head';
import { useEffect } from 'react';
import { initializeStore } from '@/store/useSiteStore';
import DebugPanel from '@/components/DebugPanel';

export default function App({ Component, pageProps: {session, ...pageProps} }: AppProps) {
  useEffect(() => {
    initializeStore();
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <Component {...pageProps} />
      <DebugPanel />
    </>
  )
}
