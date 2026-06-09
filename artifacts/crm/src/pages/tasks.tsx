import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useRef } from "react";
import { useListTasks, useCompleteTask, getListTasksQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Clock, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function TasksPage() {
  const [filter, setFilter] = useState("open");
  const { data, isLoading } = useListTasks({ filter, page: 1, pageSize: 50 });
  const completeTask = useCompleteTask();
  const queryClient = useQueryClient();

  const completeTaskMutate = useRef(completeTask.mutate);
  completeTaskMutate.current = completeTask.mutate;

  const handleToggleTask = (id: string, currentlyCompleted: boolean) => {
    // Optimistic update
    queryClient.setQueryData(getListTasksQueryKey({ filter, page: 1, pageSize: 50 }), (old: any) => {
      if (!old || !old.data) return old;
      return {
        ...old,
        data: old.data.map((t: any) => 
          t.id === id ? { ...t, completed: !currentlyCompleted } : t
        )
      };
    });

    completeTaskMutate.current({
      id,
      data: { completed: !currentlyCompleted }
    }, {
      onSuccess: () => {
        // Refetch to ensure correct lists across tabs
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'URGENT': return 'text-red-500 bg-red-50 dark:bg-red-950/30';
      case 'HIGH': return 'text-orange-500 bg-orange-50 dark:bg-orange-950/30';
      case 'MEDIUM': return 'text-blue-500 bg-blue-50 dark:bg-blue-950/30';
      case 'LOW': return 'text-gray-500 bg-gray-50 dark:bg-gray-800/50';
      default: return 'text-gray-500 bg-gray-50';
    }
  };

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
            <p className="text-muted-foreground">Keep track of what needs to be done.</p>
          </div>
          <Button data-testid="btn-new-task">
            <Plus className="mr-2 h-4 w-4" /> New Task
          </Button>
        </div>

        <Tabs defaultValue="open" onValueChange={setFilter} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="open" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 hidden sm:block" /> Open
            </TabsTrigger>
            <TabsTrigger value="due_today" className="flex items-center gap-2">
              <Clock className="h-4 w-4 hidden sm:block" /> Today
            </TabsTrigger>
            <TabsTrigger value="overdue" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 hidden sm:block" /> Overdue
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckSquareIcon className="h-4 w-4 hidden sm:block" /> Completed
            </TabsTrigger>
          </TabsList>
          
          <div className="mt-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : data?.data && data.data.length > 0 ? (
              <div className="space-y-3">
                {data.data.map(task => (
                  <Card key={task.id} className={`transition-all hover:shadow-md ${task.completed ? 'opacity-60 bg-muted/50' : ''}`}>
                    <CardContent className="p-4 flex items-start gap-4">
                      <div className="mt-1">
                        <Checkbox 
                          checked={task.completed} 
                          onCheckedChange={() => handleToggleTask(task.id, task.completed)}
                          data-testid={`checkbox-task-${task.id}`}
                          className="h-5 w-5"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-1">
                          <h3 className={`font-medium ${task.completed ? 'line-through' : ''}`}>
                            {task.title}
                          </h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{task.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2">
                          <span className="flex items-center gap-1 font-medium bg-muted px-2 py-1 rounded-md">
                            <span className="w-2 h-2 rounded-full bg-primary/40 mr-1" />
                            {task.type}
                          </span>
                          
                          {task.dueDate && (
                            <span className={`flex items-center gap-1 ${!task.completed && new Date(task.dueDate) < new Date() ? 'text-destructive font-medium' : ''}`}>
                              <Calendar className="h-3 w-3" />
                              {new Date(task.dueDate).toLocaleDateString()}
                            </span>
                          )}

                          {task.contact && (
                            <span className="truncate max-w-[150px]">
                              @ {task.contact.firstName} {task.contact.lastName}
                            </span>
                          )}
                          
                          {task.deal && (
                            <span className="truncate max-w-[150px]">
                              # {task.deal.title}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 border rounded-xl bg-card border-dashed">
                <CheckCircle2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium">No tasks found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {filter === 'completed' ? 'You haven\'t completed any tasks yet.' : 
                   filter === 'overdue' ? 'Great job! You have no overdue tasks.' : 
                   'You\'re all caught up! Enjoy your day.'}
                </p>
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </SidebarLayout>
  );
}

function CheckSquareIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}
