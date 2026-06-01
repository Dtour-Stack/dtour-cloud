import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_PROJECT_NAME, projectFromSearchParam } from "./designProject";

type DesignProjectContextValue = {
  project: string;
  setProject: (name: string) => void;
};

const DesignProjectContext = createContext<DesignProjectContextValue | null>(null);

export function DesignProjectProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const project = projectFromSearchParam(searchParams.get("project"));

  const setProject = useCallback(
    (name: string) => {
      const next = name.trim() || DEFAULT_PROJECT_NAME;
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === DEFAULT_PROJECT_NAME) p.delete("project");
          else p.set("project", next);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const value = useMemo(() => ({ project, setProject }), [project, setProject]);

  return (
    <DesignProjectContext.Provider value={value}>{children}</DesignProjectContext.Provider>
  );
}

export function useDesignProject(): DesignProjectContextValue {
  const ctx = useContext(DesignProjectContext);
  if (!ctx) throw new Error("useDesignProject outside DesignProjectProvider");
  return ctx;
}
