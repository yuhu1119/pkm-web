import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import EntityDrawer from "./components/EntityDrawer";
import SourcePipelineDrawer from "./components/SourcePipelineDrawer";

export type EntityMode = "view" | "edit" | "create";

interface WorkspaceValue {
  openEntity: (payload: { mode: EntityMode; id?: number; typeId?: string }) => void;
  openSource: (typeId: string, entityId?: number) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/**
 * 提供全站抽屉工作台：知识详情/编辑、按当前类型或实例写入文档。
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [entity, setEntity] = useState<{ mode: EntityMode; id?: number; typeId?: string; open: boolean }>({
    mode: "view",
    open: false,
  });
  const [sourceCtx, setSourceCtx] = useState<{ typeId: string; entityId?: number }>({ typeId: "" });

  useEffect(() => {
    const entityId = searchParams.get("entity");
    const mode = (searchParams.get("mode") as EntityMode) || "view";
    const type = searchParams.get("type") || "";
    const create = searchParams.get("create");
    const source = searchParams.get("source");
    if (entityId) {
      setEntity({ mode, id: Number(entityId), typeId: type || undefined, open: true });
    } else if (create && type) {
      setEntity({ mode: "create", typeId: type, open: true });
    }
    if (source) {
      setSourceCtx({ typeId: source, entityId: Number(searchParams.get("entity") || 0) || undefined });
    }
  }, [searchParams]);

  const clearEntityQuery = useCallback(() => {
    if (!searchParams.get("entity") && !searchParams.get("create") && !searchParams.get("mode")) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("entity");
    next.delete("mode");
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const value = useMemo<WorkspaceValue>(
    () => ({
      openEntity: ({ mode, id, typeId }) => setEntity({ mode, id, typeId, open: true }),
      openSource: (typeId, entityId) => setSourceCtx({ typeId, entityId }),
    }),
    [],
  );

  const closeEntity = useCallback(() => {
    setEntity((prev) => ({ ...prev, open: false }));
    clearEntityQuery();
  }, [clearEntityQuery]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <EntityDrawer
        open={entity.open}
        mode={entity.mode}
        id={entity.id}
        typeId={entity.typeId}
        onClose={closeEntity}
        onModeChange={(mode) => setEntity((prev) => ({ ...prev, mode }))}
        onOpenSource={(typeId, entityId) => setSourceCtx({ typeId, entityId })}
      />
      <SourcePipelineDrawer
        typeId={sourceCtx.typeId}
        entityId={sourceCtx.entityId}
        open={!!sourceCtx.typeId}
        onClose={() => {
          setSourceCtx({ typeId: "" });
          if (searchParams.get("source")) {
            const next = new URLSearchParams(searchParams);
            next.delete("source");
            setSearchParams(next, { replace: true });
          }
        }}
        onOpenDraft={(id, typeId) => setEntity({ mode: "edit", id, typeId, open: true })}
      />
    </WorkspaceContext.Provider>
  );
}

/**
 * 读取工作台抽屉能力。
 */
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("WorkspaceProvider missing");
  }
  return ctx;
}
