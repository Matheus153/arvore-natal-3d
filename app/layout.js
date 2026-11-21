import "./globals.css";

export const metadata = {
  title: "Árvore de Natal 3D",
  description: "Uma árvore de Natal interativa em 3D feita com Next.js e React Three Fiber.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
