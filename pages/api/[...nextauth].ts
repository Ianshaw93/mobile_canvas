import NextAuth from "next-auth";
import DropboxProvider from "next-auth/providers/dropbox";

export default NextAuth({
  providers: [
    DropboxProvider({
      clientId: process.env.DROPBOX_CLIENT_ID,
      clientSecret: process.env.DROPBOX_CLIENT_SECRET
    })
  ],
});