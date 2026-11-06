/** Friendly names for the types generated from the backend's OpenAPI schema. */
import type { components } from "./schema";

type S = components["schemas"];

export type User = S["UserOut"];
export type UserUpdate = S["UserUpdate"];
export type Farm = S["FarmOut"];
export type FarmIn = S["FarmIn"];
export type Field = S["FieldOut"];
export type FieldDetail = S["FieldDetailOut"];
export type FieldIn = S["FieldIn"];
export type Zone = S["ZoneOut"];
export type Anomaly = S["AnomalyOut"];
export type MapData = S["MapOut"];
export type Dashboard = S["DashboardOut"];
export type Drone = S["DroneOut"];
export type Mission = S["MissionOut"];
export type MissionDetail = S["MissionDetailOut"];
export type Analysis = S["AnalysisOut"];
export type Image = S["ImageOut"];
export type Analytics = S["AnalyticsOut"];
export type NdviGrid = S["NdviGridOut"];
export type Notification = S["NotificationOut"];
export type ChatMessage = S["ChatMessageOut"];
export type AssistantInfo = S["AssistantInfo"];
export type Report = S["ReportOut"];
export type ReportIn = S["ReportIn"];
export type SystemStatus = S["SystemStatusOut"];
export type Token = S["TokenOut"];
export type ForgotPasswordResult = S["ForgotPasswordOut"];

export type Health = Field["health_status"];
export type CropType = Field["crop_type"];
export const CROP_TYPES: CropType[] = ["wheat", "barley", "canola", "sunflower", "flax", "other"];
