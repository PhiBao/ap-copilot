"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { NetworkProvider, useNetwork } from "@/lib/network";
import { wagmiConfig } from "@/lib/wagmi";

const theme = darkTheme({ accentColor: "#B6602A", borderRadius: "small" });

function RainbowKit({ children }: { children: ReactNode }) {
  const { net } = useNetwork();
  return (
    <RainbowKitProvider initialChain={net.chain} locale="en-US" theme={theme} appInfo={{ appName: "Ledgerly" }}>
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <NetworkProvider>
          <RainbowKit>{children}</RainbowKit>
        </NetworkProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
