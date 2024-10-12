import { Dropbox } from "dropbox";

// @ts-ignore
export function getDropboxClient(accessToken) {
  return new Dropbox({ accessToken });
}