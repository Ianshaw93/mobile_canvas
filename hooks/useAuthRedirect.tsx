import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useEffect } from 'react';
import useSiteStore from '@/store/useSiteStore';

const useAuthRedirect = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return; // Only run on native platforms
    }
    // @ts-ignore
    const handleUrlOpen = async (event) => {
      const url = new URL(event.url);
      if (url.protocol === 'myapp:') {
        const accessToken = url.searchParams.get('access_token');
        
        if (accessToken) {
          console.log('Access Token:', accessToken);

          const { setAccessToken } = useSiteStore.getState();
          setAccessToken(accessToken);
        }
      }
    };

    App.addListener('appUrlOpen', handleUrlOpen);

    return () => {
      App.removeAllListeners();
    };
  }, []);
};

export default useAuthRedirect;
