import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title:"星星日記｜家庭獎勵追蹤", description:"一家人一起記錄每一次努力，讓成長看得見。" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-Hant"><body>{children}</body></html>; }
