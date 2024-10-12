import { useEffect } from 'react';

export default function DropboxCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authorizationCode = params.get('code');

    if (authorizationCode) {
      // Send the authorization code to the parent window
      window.opener.postMessage({ authorizationCode }, window.location.origin);

      // Close the popup
      window.close();
    }
  }, []);

  return <p>Authenticating with Dropbox...</p>;
}
