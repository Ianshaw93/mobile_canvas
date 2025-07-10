import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head';
import { useEffect } from 'react';
import useSiteStore from '@/store/useSiteStore';

export default function App({ Component, pageProps: {session, ...pageProps} }: AppProps) {
  
  // ✅ Initialize store on app startup
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('[App] Starting app initialization...');
        await useSiteStore.getState().initialize();
        console.log('[App] App initialization completed successfully');
      } catch (error) {
        console.error('[App] Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, []); // Empty dependency array = runs once on mount

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
