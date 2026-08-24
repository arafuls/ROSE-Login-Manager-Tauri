import "./global.css";

import AppProvider from "@/app/provider";
import AppRouter from "@/app/router";
import { TitleBar } from "@/components/title-bar";

export default function App() {
  return (
    <AppProvider>
      <div className="flex h-screen flex-col overflow-hidden rounded-xl bg-background">
        <TitleBar />
        <div className="min-h-0 flex-1">
          <AppRouter />
        </div>
      </div>
    </AppProvider>
  );
}
