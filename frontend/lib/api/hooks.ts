/** React Query hooks for every backend resource. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type * as T from "./types";

const ACTIVE = ["in_progress", "returning"];
export const isActive = (mission?: { status: string } | null) => !!mission && ACTIVE.includes(mission.status);

export function useFarms(enabled = true) {
  return useQuery({ queryKey: ["farms"], queryFn: () => api<T.Farm[]>("/farms"), enabled });
}

export function useDashboard(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "dashboard"],
    queryFn: () => api<T.Dashboard>(`/farms/${farmId}/dashboard`),
    enabled: !!farmId,
  });
}

export function useMapData(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "map"],
    queryFn: () => api<T.MapData>(`/farms/${farmId}/map`),
    enabled: !!farmId,
  });
}

export function useAnalytics(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "analytics"],
    queryFn: () => api<T.Analytics>(`/farms/${farmId}/analytics`),
    enabled: !!farmId,
  });
}

export function useFields(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "fields"],
    queryFn: () => api<T.Field[]>(`/farms/${farmId}/fields`),
    enabled: !!farmId,
  });
}

export function useField(fieldId: string) {
  return useQuery({
    queryKey: ["field", fieldId],
    queryFn: () => api<T.FieldDetail>(`/fields/${fieldId}`),
    enabled: !!fieldId,
  });
}

export function useNdviGrid(fieldId?: string) {
  return useQuery({
    queryKey: ["field", fieldId, "ndvi"],
    queryFn: () => api<T.NdviGrid>(`/fields/${fieldId}/ndvi`),
    enabled: !!fieldId,
  });
}

export function useSaveField(farmId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: T.FieldIn }) =>
      id
        ? api<T.Field>(`/fields/${id}`, { method: "PUT", body })
        : api<T.Field>(`/farms/${farmId}/fields`, { method: "POST", body }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["farm"] });
      client.invalidateQueries({ queryKey: ["farms"] });
      client.invalidateQueries({ queryKey: ["field"] });
    },
  });
}

export function useDeleteField() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/fields/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["farm"] });
      client.invalidateQueries({ queryKey: ["farms"] });
    },
  });
}

export function useResolveAnomaly() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<T.Anomaly>(`/anomalies/${id}`, { method: "PATCH", body: { status: "resolved" } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["farm"] });
      client.invalidateQueries({ queryKey: ["field"] });
    },
  });
}

export function useDrones(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "drones"],
    queryFn: () => api<T.Drone[]>(`/farms/${farmId}/drones`),
    enabled: !!farmId,
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === "charging" || d.status === "in_mission") ? 1000 : false,
  });
}

export function useMissions(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "missions"],
    queryFn: () => api<T.Mission[]>(`/farms/${farmId}/missions`),
    enabled: !!farmId,
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 2000 : false),
  });
}

export function useMission(id?: string | null) {
  return useQuery({
    queryKey: ["mission", id],
    queryFn: () => api<T.MissionDetail>(`/missions/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (isActive(query.state.data) ? 700 : false),
  });
}

function useMissionMutation<V>(fn: (vars: V) => Promise<T.Mission>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: (mission) => {
      client.invalidateQueries({ queryKey: ["farm"] });
      if (mission) client.invalidateQueries({ queryKey: ["mission", mission.id] });
    },
  });
}

export const usePlanMission = () =>
  useMissionMutation((body: { drone_id: string; field_id: string; altitude_m: number; purpose: T.MissionPurpose }) =>
    api<T.Mission>("/missions", { method: "POST", body }),
  );

export const useStartMission = () =>
  useMissionMutation((id: string) =>
    api<T.Mission>(`/missions/${id}/start`, { method: "POST", body: { operator_confirmed: true } }),
  );

export const useReturnHome = () =>
  useMissionMutation((id: string) => api<T.Mission>(`/missions/${id}/return-home`, { method: "POST" }));

export const useCancelMission = () =>
  useMissionMutation((id: string) => api<T.Mission>(`/missions/${id}/cancel`, { method: "POST" }));

export function useChargeDrone() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<T.Drone>(`/drones/${id}/charge`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["farm"] }),
  });
}

export function useAnalyses() {
  return useQuery({ queryKey: ["analyses"], queryFn: () => api<T.Analysis[]>("/analyses") });
}

export function useRunAnalysis() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { image_id: string; crop_type: T.CropType; field_id?: string | null }) =>
      api<T.Analysis>("/analyses", { method: "POST", body }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["analyses"] });
      client.invalidateQueries({ queryKey: ["notifications"] });
      client.invalidateQueries({ queryKey: ["farm"] });
    },
  });
}

export function useDecide() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, comment }: { id: string; decision: "approved" | "rejected"; comment: string }) =>
      api<T.Analysis>(`/analyses/${id}/actions`, { method: "POST", body: { decision, comment } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["analyses"] });
      client.invalidateQueries({ queryKey: ["farm"] });
    },
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<T.Notification[]>("/notifications"),
    enabled,
    refetchInterval: 15000,
  });
}

export function useReadNotification() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) =>
      api(id ? `/notifications/${id}/read` : "/notifications/read-all", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useAssistantInfo() {
  return useQuery({ queryKey: ["assistant-info"], queryFn: () => api<T.AssistantInfo>("/assistant/info") });
}

export function useChat(farmId?: string) {
  return useQuery({
    queryKey: ["chat", farmId],
    queryFn: () => api<T.ChatMessage[]>(`/assistant/messages?farm_id=${farmId}`),
    enabled: !!farmId,
  });
}

export function useAsk(farmId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api<T.ChatMessage>("/assistant/messages", { method: "POST", body: { farm_id: farmId, content } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["chat", farmId] }),
  });
}

export function useClearChat(farmId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/assistant/messages?farm_id=${farmId}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["chat", farmId] }),
  });
}

export function useReports(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "reports"],
    queryFn: () => api<T.Report[]>(`/farms/${farmId}/reports`),
    enabled: !!farmId,
  });
}

export function useCreateReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: T.ReportIn) => api<T.Report>("/reports", { method: "POST", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["farm"] }),
  });
}

export function useDeleteReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/reports/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["farm"] }),
  });
}

export function useSaveFarm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: T.FarmIn }) =>
      id
        ? api<T.Farm>(`/farms/${id}`, { method: "PUT", body })
        : api<T.Farm>("/farms", { method: "POST", body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["farms"] }),
  });
}

export function useDeleteFarm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/farms/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["farms"] }),
  });
}

export function useSystemStatus() {
  return useQuery({ queryKey: ["system"], queryFn: () => api<T.SystemStatus>("/system/status") });
}

export function useEmergencies(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "emergencies"],
    queryFn: () => api<T.Emergency[]>(`/farms/${farmId}/emergencies`),
    enabled: !!farmId,
    refetchInterval: (query) => (query.state.data?.some((item) => item.status === "active") ? 2000 : 30000),
  });
}

function useEmergencyMutation<V>(fn: (vars: V) => Promise<T.Emergency>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      client.invalidateQueries({ queryKey: ["farm"] });
      client.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export const useRaiseEmergency = () =>
  useEmergencyMutation((body: T.EmergencyIn) => api<T.Emergency>("/emergencies", { method: "POST", body }));

export const useEmergencyDrone = () =>
  useEmergencyMutation(({ id, mode }: { id: string; mode: "recon" | "suppress" }) =>
    api<T.Emergency>(`/emergencies/${id}/drone`, { method: "POST", body: { mode } }),
  );

export const useEmergencyEvent = () =>
  useEmergencyMutation(({ id, code, detail }: { id: string; code: "siren" | "call" | "sms"; detail: string }) =>
    api<T.Emergency>(`/emergencies/${id}/events`, { method: "POST", body: { code, detail } }),
  );

export const useResolveEmergency = () =>
  useEmergencyMutation((id: string) => api<T.Emergency>(`/emergencies/${id}/resolve`, { method: "POST" }));

export function useLivestock(farmId?: string) {
  return useQuery({
    queryKey: ["farm", farmId, "livestock"],
    queryFn: () => api<T.Livestock>(`/farms/${farmId}/livestock`),
    enabled: !!farmId,
  });
}

function useLivestockMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["farm"] }) });
}

export const useSaveLivestockGroup = (farmId: string) =>
  useLivestockMutation(({ id, body }: { id?: string; body: T.LivestockGroupIn }) =>
    id
      ? api<T.LivestockGroup>(`/livestock/${id}`, {
        method: "PATCH", body: { species: body.species, name: body.name, notes: body.notes, field_id: body.field_id ?? "" },
      })
      : api<T.LivestockGroup>(`/farms/${farmId}/livestock`, { method: "POST", body }),
  );

export const useDeleteLivestockGroup = () =>
  useLivestockMutation((id: string) => api(`/livestock/${id}`, { method: "DELETE" }));

export const useLivestockEvent = () =>
  useLivestockMutation(({ id, body }: { id: string; body: T.LivestockEventIn }) =>
    api<T.LivestockEvent>(`/livestock/${id}/events`, { method: "POST", body }),
  );
