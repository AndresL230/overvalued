import type { Metadata } from "next";
import { OvervaluedApp } from "./overvalued-app";

export const metadata: Metadata = {
  description: "Trade the résumé. Watch the room decide. A live reference-check prediction market.",
};

export default function Home() {
  return <OvervaluedApp />;
}
