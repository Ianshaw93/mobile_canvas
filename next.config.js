/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {unoptimized: true},
  ...(process.env.NEXT_PUBLIC_UPLOAD_RECOVERY_PROTOTYPE === '1' ? {
    distDir: '.next-recovery',
    async rewrites() { return [{source:'/recovery-api/:path*', destination:'http://127.0.0.1:3112/:path*'}]; },
    async headers() { return [{source:'/:path*',headers:[{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:3112; worker-src 'self' blob:; font-src 'self' data:; frame-ancestors 'none'"}]}]; }
  } : {})
}

module.exports = nextConfig
