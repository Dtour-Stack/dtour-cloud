import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { type ReactNode, useMemo } from "react";
import { SOLANA_RPC_URL } from "@/lib/dtour-token";
import "@solana/wallet-adapter-react-ui/styles.css";

/**
 * Solana wallet context for the $DTOUR token gate. Lazy-mounted only on the
 * login route (via the login page), so the wallet vendor chunks stay out of
 * the landing/token bundle. Wallet Standard auto-detects installed wallets;
 * Phantom/Solflare are added explicitly as a fallback.
 */
export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
