import {
  createContext,
  type ReactNode,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  createRenderCostStore,
  type RenderCostSnapshot,
  type RenderCostStore,
} from "./store";

const RenderCostStoreContext = createContext<RenderCostStore | null>(null);

export interface RenderCostProviderProps {
  children: ReactNode;
  initiallyEnabled?: boolean;
}

const emptySnapshot: RenderCostSnapshot = {
  enabled: false,
  components: [],
  simulatedMemo: [],
};
const emptySubscribe = () => () => {};

export function RenderCostProvider({
  children,
  initiallyEnabled = true,
}: RenderCostProviderProps) {
  const storeRef = useRef<RenderCostStore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = createRenderCostStore(initiallyEnabled);
  }

  return (
    <RenderCostStoreContext.Provider value={storeRef.current}>
      {children}
    </RenderCostStoreContext.Provider>
  );
}

export function useRenderCostStore(): RenderCostStore | null {
  return useContext(RenderCostStoreContext);
}

export function useRenderCostSnapshot(): RenderCostSnapshot {
  const store = useRenderCostStore();
  return useSyncExternalStore(
    store?.subscribe ?? emptySubscribe,
    store?.getSnapshot ?? (() => emptySnapshot),
    store?.getSnapshot ?? (() => emptySnapshot),
  );
}
