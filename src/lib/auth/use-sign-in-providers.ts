import { useEffect, useState } from "react";
import { getSignInProviders } from "./providers-api";
import type { SignInProvider } from "./provider-plan";

/** Only the sign-in buttons that actually work on this host (empty until loaded). */
export function useSignInProviders(): SignInProvider[] {
  const [list, setList] = useState<SignInProvider[]>([]);
  useEffect(() => {
    let live = true;
    void getSignInProviders().then((l) => live && setList(l)).catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, []);
  return list;
}
