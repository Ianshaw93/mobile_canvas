import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import useSiteStore from '@/store/useSiteStore';
import { initWebDatabase } from '@/services/database';

// Register jeep-sqlite custom element for web platform
if (typeof window !== 'undefined' && Capacitor.getPlatform() === 'web') {
  import('jeep-sqlite/loader').then(({ defineCustomElements }) => {
    defineCustomElements(window);
  });
}

export default function App({ Component, pageProps: {session, ...pageProps} }: AppProps) {
  // The static export is built with platform 'web', so anything keyed on the
  // platform must wait for mount or the native WebView hydrates against HTML
  // that doesn't match what it renders (React #418/#423).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Initialize store on app startup
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('[App] Starting app initialization...');

        // Initialize web SQLite store before anything else
        if (Capacitor.getPlatform() === 'web') {
          console.log('[App] Initializing web database store...');
          await initWebDatabase();
          console.log('[App] Web database store ready');
        }

        await useSiteStore.getState().initialize();
        console.log('[App] App initialization completed successfully');
      } catch (error) {
        console.error('[App] Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      {mounted && Capacitor.getPlatform() === 'web' && <jeep-sqlite></jeep-sqlite>}
      <Component {...pageProps} />
    </>
  )
}
