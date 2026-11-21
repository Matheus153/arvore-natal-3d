/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  // esconde o botão "N" do Next.js que aparece no canto em modo de desenvolvimento
  devIndicators: false,
};

export default nextConfig;
