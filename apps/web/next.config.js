/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  transpilePackages: ['@farm-phone/types', '@farm-phone/config'],
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/socket.io/:path*',
        destination: 'http://127.0.0.1:3001/socket.io/:path*',
      },
      {
        source: '/api/v1/:path*',
        destination: 'http://127.0.0.1:3001/api/v1/:path*',
      },
      {
        source: '/generated-videos/:path*',
        destination: 'http://127.0.0.1:3001/generated-videos/:path*',
      },
      {
        source: '/output/:path*',
        destination: 'http://127.0.0.1:3001/output/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
