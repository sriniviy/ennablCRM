import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionToken } from "@/hooks/use-session-token";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type CustomFieldObjectType = "contact" | "company" | "deal" | "activity";
export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "single_select"
  | "multi_select";

export interface CustomFieldDefinition {
  id: string;
  objectType: CustomFieldObjectType;
  label: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  required: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface CustomFieldWithValue extends CustomFieldDefinition {
  value: string | null;
}

function useAuthFetch() {
  const getToken = useSessionToken();
  return async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    const res = await fetch(`/api/custom-fields${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }
    return res.json();
  };
}

export function useCustomFieldDefinitions(objectType?: CustomFieldObjectType) {
  const authFetch = useAuthFetch();
  return useQuery<CustomFieldDefinition[]>({
    queryKey: ["custom-field-defs", objectType ?? "all"],
    queryFn: () =>
      authFetch(objectType ? `?objectType=${objectType}` : ""),
    staleTime: 60_000,
  });
}

export function useCustomFieldValues(
  objectType: CustomFieldObjectType,
  recordId: string | undefined,
) {
  const authFetch = useAuthFetch();
  return useQuery<CustomFieldWithValue[]>({
    queryKey: ["custom-field-values", objectType, recordId],
    queryFn: () => authFetch(`/values/${objectType}/${recordId}`),
    enabled: !!recordId,
    staleTime: 30_000,
  });
}

export function useSaveCustomFieldValues(
  objectType: CustomFieldObjectType,
  recordId: string,
) {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Array<{ fieldId: string; value: string | null }>) =>
      authFetch(`/values/${objectType}/${recordId}`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["custom-field-values", objectType, recordId],
      });
    },
  });
}

export function useSaveCustomFieldValuesForRecord(
  objectType: CustomFieldObjectType,
) {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      recordId,
      values,
    }: {
      recordId: string;
      values: Array<{ fieldId: string; value: string | null }>;
    }) =>
      authFetch(`/values/${objectType}/${recordId}`, {
        method: "PUT",
        body: JSON.stringify({ values }),
      }),
    onSuccess: (_data, { recordId }) => {
      qc.invalidateQueries({
        queryKey: ["custom-field-values", objectType, recordId],
      });
    },
  });
}

export function useCreateCustomFieldDefinition() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      objectType: CustomFieldObjectType;
      label: string;
      fieldType: CustomFieldType;
      options?: string[];
      required?: boolean;
    }) =>
      authFetch("", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-field-defs"] });
    },
  });
}

export function useUpdateCustomFieldDefinition() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      label?: string;
      options?: string[];
      required?: boolean;
      displayOrder?: number;
    }) =>
      authFetch(`/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-field-defs"] });
    },
  });
}

export function useDeleteCustomFieldDefinition() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      authFetch(`/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-field-defs"] });
      qc.invalidateQueries({ queryKey: ["custom-field-values"] });
    },
  });
}
