import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "./components/Toaster";

export const metadata: Metadata = {
  title: "Strata",
  description: "연구 프로젝트별로 국내외 논문을 찾고, 고른 논문의 초록을 요약해 쌓아 두는 연구실 공유 도구",
};

// 첫 화면이 그려지기 전에 저장된 테마를 적용해 깜빡임을 막는다
const themeScript = `try{var t=localStorage.getItem('strata-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;600&family=Noto+Serif+KR:wght@500;700&display=swap"
        />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
