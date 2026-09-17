import type {Metadata} from "next";
import "./globals.css";
import {ProjectProvider} from "@/components/project-provider";
import {AppShell} from "@/components/app-shell";

export const metadata:Metadata={
  title:"Fantasy Studio AI",
  description:"Cinematic full-image story studio"
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body><ProjectProvider><AppShell>{children}</AppShell></ProjectProvider></body></html>;
}
