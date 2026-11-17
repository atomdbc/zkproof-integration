"use client";

import { GetStarknetProvider } from "@starknet-io/get-starknet-ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return <GetStarknetProvider>{children}</GetStarknetProvider>;
}
