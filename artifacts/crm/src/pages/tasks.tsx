import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useRef, useEffect } from "react";
import { useListTasks, useCompleteTask, useGetTask, getListTasksQueryKey, getGetTaskQueryKey, type TaskWithRelations } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, Calendar, CheckCircle2, AlertCircle, Pencil, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { ExportFilterDialog } from "@/components/tasks/export-filter-dialog";
import { formatDistanceToNow } from "date-fns";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

function useTaskDeepLink(onOpen: (t: TaskWithRelations) => void) {
  const [deepLinkId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("open");
    if (id) window.history.replaceState({}, "", window.location.pathname);
    return id;
  });
  const { data: deepTask } = useGetTask(deepLinkId ?? "", {
    query: { enabled: !!deepLinkId, queryKey: getGetTaskQueryKey(deepLinkId ?? "") },
  });
  const openedRef = useRef(false);
  useEffect(() => {
    if (deepTask && !openedRef.current) {
      openedRef.current = true;
      onOpen(deepTask);
    }
  }, [deepTask, onOpen]);
}

export function TasksPage() {
  const [filter, setFilter] = useState("open");
  const { data, isLoading } = useListTasks({ filter, page: 1, pageSize: 50 });
  const completeTask = useCompleteTask();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskWithRelations | undefined>();
  const [exportTasksOpen, setExportTasksOpen] = useState(false);
  const [exportActivitiesOpen, setExportActivitiesOpen] = useState(false);

  const completeTaskMutate = useRef(completeTask.mutate);
  completeTaskMutate.current = completeTask.mutate;

  const handleToggleTask = (id: string, currentlyCompleted: boolean) => {
    queryClient.setQueryData(getListTasksQueryKey({ filter, page: 1, pageSize: 50 }), (old: any) => {
      if (!old || !old.data) return old;
      return { ...old, data: old.data.map((t: any) => t.id === id ? { ...t, completed: !currentlyCompleted } : t) };
    });
    completeTaskMutate.current({ id, data: { completed: !currentlyCompleted } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    });
  };

  const openNew = () => { setEditTask(undefined); setDialogOpen(true); };
  const openEdit = (t: TaskWithRelations) => { setEditTask(t); setDialogOpen(true); };

  useTaskDeepLink(openEdit);

  const getDueBadge = (task: TaskWithRelations) => {
    if (!task.dueDate) return null;
    const due = new Date(task.dueDate);
    const now = new Date();
    const isOverdue = due < now && !task.completed;
    const isDueToday = due.toDateString() === now.toDateString();
    if (isOverdue) return <span className="flex items-center gap-1 text-xs text-red-500"><AlertCircle className="h-3 w-3" />Overdue</span>;
    if (isDueToday) return <span className="flex items-center gap-1 text-xs text-amber-500"><Clock className="h-3 w-3" />Due today</span>;
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />{formatDistanceToNow(due, { addSuffix: true })}</span>;
  };

  return (
    <SidebarLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
            <p className="text-muted-foreground">Stay on top of your to-dos and follow-ups.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setExportActivitiesOpen(true)} data-testid="btn-export-activities">
              <Download className="mr-2 h-4 w-4" />
              Export Activities
            </Button>
            <Button variant="outline" onClick={() => setExportTasksOpen(true)} data-testid="btn-export-tasks">
              <Download className="mr-2 h-4 w-4" />
              Export Tasks
            </Button>
            <Button data-testid="btn-new-task" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Task
            </Button>
          </div>
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          {["open", "today", "overdue", "completed"].map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4 space-y-3">
              {isLoading ? (
                [...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
              ) : data?.data && data.data.length > 0 ? (
                data.data.map(task => (
                  <Card key={task.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={!!task.completed}
                          onCheckedChange={() => handleToggleTask(task.id, !!task.completed)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`font-medium leading-tight ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              <Badge variant="secondary" className={`text-xs border-0 ${PRIORITY_COLORS[task.priority] ?? ""}`}>
                                {task.priority}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEdit(task)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2">
                            {getDueBadge(task)}
                            {task.contact && (
                              <span className="text-xs text-muted-foreground">{task.contact.firstName} {task.contact.lastName}</span>
                            )}
                            {task.deal && (
                              <span className="text-xs text-muted-foreground">Deal: {task.deal.title}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>No tasks here.</p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editTask} />

      <ExportFilterDialog
        open={exportTasksOpen}
        onOpenChange={setExportTasksOpen}
        mode="tasks"
        defaultStatus={filter === "today" ? "due_today" : filter !== "open" ? filter : "all"}
      />
      <ExportFilterDialog
        open={exportActivitiesOpen}
        onOpenChange={setExportActivitiesOpen}
        mode="activities"
      />
    </SidebarLayout>
  );
}
