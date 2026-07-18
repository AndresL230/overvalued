import type { Metadata } from "next";
import { BoardScreen } from "./board-screen";

export const metadata: Metadata = {
  title: "Live Booth Board",
  description: "The live Overvalued candidate market board.",
};

export default function BoardPage() {
  return <BoardScreen />;
}
