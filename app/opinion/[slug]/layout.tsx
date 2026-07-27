import type { ReactNode } from "react";
import OpinionAutoRedirect from "./OpinionAutoRedirect";

export default function OpinionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <OpinionAutoRedirect />
    </>
  );
}
