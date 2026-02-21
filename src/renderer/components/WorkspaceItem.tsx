import React, { useEffect, useState } from "react";
import { GitBranch, Bot } from "lucide-react";
import { useWorkspaceChanges } from "../hooks/useWorkspaceChanges";
import { ChangesBadge } from "./WorkspaceChanges";
import { Spinner } from "./ui/spinner";
import { usePrStatus } from "../hooks/usePrStatus";

interface Workspace {
  id: string;
  name: string;
  branch: string;
  path: string;
  status: "active" | "idle" | "running";
  agentId?: string;
}

interface WorkspaceItemProps {
  workspace: Workspace;
}

export const WorkspaceItem: React.FC<WorkspaceItemProps> = ({ workspace }) => {
  const { totalAdditions, totalDeletions, isLoading } = useWorkspaceChanges(
    workspace.path,
    workspace.id
  );
  const [isRunning, setIsRunning] = useState(false);
  const { pr } = usePrStatus(workspace.path);

  // Initialize from current agent status
  useEffect(() => {
    (async () => {
      try {
        const status = await (window as any).electronAPI.codexGetAgentStatus(
          workspace.id
        );
        if (status?.success && status.agent) {
          setIsRunning(status.agent.status === "running");
        }
      } catch {}
    })();

    // Subscribe to streaming events to reflect activity live
    const offOut = (window as any).electronAPI.onCodexStreamOutput(
      (data: any) => {
        if (data.workspaceId === workspace.id) setIsRunning(true);
      }
    );
    const offComplete = (window as any).electronAPI.onCodexStreamComplete(
      (data: any) => {
        if (data.workspaceId === workspace.id) setIsRunning(false);
      }
    );
    const offErr = (window as any).electronAPI.onCodexStreamError(
      (data: any) => {
        if (data.workspaceId === workspace.id) setIsRunning(false);
      }
    );
    return () => {
      offOut?.();
      offComplete?.();
      offErr?.();
    };
  }, [workspace.id]);

  return (
    <div className="flex items-center justify-between min-w-0">
      <div className="flex items-center space-x-2 py-1 flex-1 min-w-0">
        {isRunning || workspace.status === "running" || workspace.agentId ? (
          <Spinner size="sm" className="w-3 h-3 text-gray-400 flex-shrink-0" />
        ) : (
          <GitBranch className="w-3 h-3 text-gray-400 flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate block">
          {workspace.name}
        </span>
        {workspace.agentId && (
          <Bot className="w-3 h-3 text-purple-500 flex-shrink-0" />
        )}
      </div>
      <div className="hidden sm:flex items-center space-x-2 flex-shrink-0">
        {!isLoading && (totalAdditions > 0 || totalDeletions > 0) ? (
          <ChangesBadge additions={totalAdditions} deletions={totalDeletions} />
        ) : pr ? (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border 
              ${pr.state === 'MERGED' ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
              ${pr.state === 'OPEN' && pr.isDraft ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
              ${pr.state === 'OPEN' && !pr.isDraft ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
              ${pr.state === 'CLOSED' ? 'bg-gray-100 text-gray-700 border-gray-200' : ''}
            `}
            title={`${pr.title || 'Pull Request'} (#${pr.number})`}
          >
            {pr.isDraft ? 'draft' : pr.state.toLowerCase()}
          </span>
        ) : null}
      </div>
    </div>
  );
};
