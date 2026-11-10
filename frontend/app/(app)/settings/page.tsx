"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, FlaskConical, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useChangeLanguage } from "@/components/layout/language-switcher";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FarmDialog } from "@/components/shared/farm-dialog";
import { FormField } from "@/components/shared/form-field";
import { ErrorState, LoadingState, PageHeader, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api/client";
import { useDeleteFarm, useSystemStatus } from "@/lib/api/hooks";
import type { Farm, User, UserUpdate } from "@/lib/api/types";
import { LANGUAGES, type Lang, type TKey } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { useFarm } from "@/providers/farm-provider";
import { useT } from "@/providers/i18n-provider";

function useSave() {
  const { t } = useT();
  const { update } = useAuth();
  return (body: UserUpdate) =>
    update(body)
      .then(() => toast.success(t("settings.saved")))
      .catch((error) => toast.error(errorText(error, t("state.errorBody"))));
}

function ProfileTab({ user }: { user: User }) {
  const { t } = useT();
  const save = useSave();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save({ name: name.trim(), role: role as UserUpdate["role"] });
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/users/me/password", { method: "POST", body: { current_password: current, new_password: next } });
      toast.success(t("settings.passwordChanged"));
      setCurrent("");
      setNext("");
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t("settings.profile")}>
        <form onSubmit={submit} className="space-y-4">
          <FormField id="profile-name" label={t("auth.name")}>
            <Input id="profile-name" value={name} minLength={2} required onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField id="profile-email" label={t("auth.email")}>
            <Input id="profile-email" value={user.email} disabled />
          </FormField>
          <FormField id="profile-role" label={t("settings.role")}>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="profile-role" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["farmer", "agronomist"].map((item) => <SelectItem key={item} value={item}>{t(`role.${item}` as TKey)}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <Button type="submit">{t("common.save")}</Button>
        </form>
      </Panel>
      <Panel title={t("settings.password")}>
        {user.is_demo ? <p className="text-muted-foreground">{t("settings.demoPassword")}</p> : (
          <form onSubmit={changePassword} className="space-y-4">
            <FormField id="current-password" label={t("settings.currentPassword")}>
              <Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </FormField>
            <FormField id="new-password" label={t("settings.newPassword")} hint={t("auth.passwordHint")}>
              <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
            </FormField>
            <Button type="submit">{t("settings.changePassword")}</Button>
          </form>
        )}
      </Panel>
    </div>
  );
}

function PreferencesTab({ user }: { user: User }) {
  const { t, lang } = useT();
  const changeLanguage = useChangeLanguage();
  const save = useSave();
  return (
    <Panel title={t("settings.preferences")} className="max-w-xl">
      <div className="space-y-4">
        <FormField id="pref-language" label={t("settings.language")}>
          <Select value={lang} onValueChange={(value) => { changeLanguage(value as Lang); toast.success(t("settings.saved")); }}>
            <SelectTrigger id="pref-language" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{LANGUAGES.map((item) => <SelectItem key={item.code} value={item.code}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField id="pref-units" label={t("settings.units")} hint={t("settings.unitsHint")}>
          <Select value={user.units} onValueChange={(value) => void save({ units: value as User["units"] })}>
            <SelectTrigger id="pref-units" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="metric">{t("settings.metric")}</SelectItem>
              <SelectItem value="imperial">{t("settings.imperial")}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </Panel>
  );
}

function NotificationsTab({ user }: { user: User }) {
  const { t } = useT();
  const save = useSave();
  const prefs = user.notification_prefs;
  const items: { key: keyof typeof prefs; label: TKey; hint: TKey }[] = [
    { key: "alerts", label: "settings.notifyAlerts", hint: "settings.notifyAlertsHint" },
    { key: "missions", label: "settings.notifyMissions", hint: "settings.notifyMissionsHint" },
    { key: "ai", label: "settings.notifyAi", hint: "settings.notifyAiHint" },
  ];
  return (
    <Panel title={t("settings.notifications")} className="max-w-xl">
      <ul className="divide-y">
        {items.map(({ key, label, hint }) => (
          <li key={key} className="flex items-center justify-between gap-4 py-3">
            <Label htmlFor={`notify-${key}`} className="block font-normal">
              <span className="block font-medium">{t(label)}</span>
              <span className="block text-sm text-muted-foreground">{t(hint)}</span>
            </Label>
            <Switch id={`notify-${key}`} checked={prefs[key]} onCheckedChange={(value) => void save({ notification_prefs: { ...prefs, [key]: value } })} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function FarmsTab() {
  const { t } = useT();
  const { farms } = useFarm();
  const remove = useDeleteFarm();
  const [dialog, setDialog] = useState<{ open: boolean; farm?: Farm }>({ open: false });
  const [deleting, setDeleting] = useState<Farm | null>(null);

  return (
    <Panel title={t("settings.farms")} actions={<Button size="sm" onClick={() => setDialog({ open: true })}><Plus className="size-4" /> {t("farm.create")}</Button>}>
      {farms.length === 0 && <p className="text-muted-foreground">{t("farm.emptyBody")}</p>}
      <ul className="divide-y">
        {farms.map((farm) => (
          <li key={farm.id} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{farm.name}</span>
              <span className="block text-sm text-muted-foreground">{farm.region} · {t("dash.fieldCount", { count: farm.field_count })} · {farm.total_area} {t("unit.ha")}</span>
            </span>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} onClick={() => setDialog({ open: true, farm })}><Pencil className="size-4" /></Button>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} onClick={() => setDeleting(farm)}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>
      <FarmDialog open={dialog.open} farm={dialog.farm} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}
        title={t("farm.deleteTitle", { name: deleting?.name ?? "" })} body={t("farm.deleteBody")} confirmLabel={t("common.delete")}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onError: (e) => toast.error(errorText(e, t("state.errorBody"))) });
          setDeleting(null);
        }} />
    </Panel>
  );
}

function IntegrationsTab({ user }: { user: User }) {
  const { t } = useT();
  const save = useSave();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const reset = async () => {
    try {
      await api("/system/demo-reset", { method: "POST" });
      await client.invalidateQueries();
      toast.success(t("settings.resetDone"));
    } catch (error) {
      toast.error(errorText(error, t("state.errorBody")));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={t("settings.simulator")}>
        <FormField id="sim-speed" label={t("settings.simSpeed")} hint={t("settings.simSpeedHint")}>
          <Select value={user.integration_prefs.sim_speed} onValueChange={(value) => void save({ integration_prefs: { sim_speed: value as "slow" | "normal" | "fast" } })}>
            <SelectTrigger id="sim-speed" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["slow", "normal", "fast"].map((item) => <SelectItem key={item} value={item}>{t(`settings.speed.${item}` as TKey)}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </Panel>
      {user.is_demo && (
        <Panel title={t("settings.resetTitle")}>
          <p className="text-muted-foreground">{t("settings.resetBody")}</p>
          <Button variant="outline" className="mt-4" onClick={() => setConfirming(true)}><RotateCcw className="size-4" /> {t("settings.resetAction")}</Button>
          <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={t("settings.resetTitle")} body={t("settings.resetBody")}
            confirmLabel={t("settings.resetAction")} onConfirm={reset} />
        </Panel>
      )}
    </div>
  );
}

function SystemTab() {
  const { t } = useT();
  const query = useSystemStatus();
  if (query.isLoading) return <LoadingState rows={1} />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return (
    <Panel title={t("settings.system")} className="max-w-2xl">
      <ul className="divide-y">
        {query.data.services.map((service) => (
          <li key={service.key} className="flex items-center gap-3 py-3">
            {service.status === "ok" ? <CheckCircle2 className="size-5 text-brand-2" /> :
              service.status === "demo" ? <FlaskConical className="size-5 text-warn" /> : <CircleAlert className="size-5 text-danger" />}
            <span className="flex-1">
              <span className="block font-medium">{t(`service.${service.key}` as TKey)}</span>
              <span className="block text-sm text-muted-foreground">{service.detail}</span>
            </span>
            <span className="text-sm">{t(`service.status.${service.status}` as TKey)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">{t("settings.version")} {query.data.version}</p>
    </Panel>
  );
}

function SettingsPage() {
  const { t } = useT();
  const { user } = useAuth();
  const params = useSearchParams();
  if (!user) return null;
  return (
    <>
      <PageHeader title={t("nav.settings")} description={t("settings.subtitle")} />
      <Tabs defaultValue={params.get("tab") ?? "profile"}>
        <div className="mb-4 overflow-x-auto">
          <TabsList>
            {(["profile", "preferences", "farms", "system"] as const).map((tab) => (
              <TabsTrigger key={tab} value={tab}>{t(`settings.tab.${tab}` as TKey)}</TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="profile"><ProfileTab user={user} /></TabsContent>
        <TabsContent value="preferences" className="space-y-4"><PreferencesTab user={user} /><NotificationsTab user={user} /></TabsContent>
        <TabsContent value="farms"><FarmsTab /></TabsContent>
        <TabsContent value="system" className="space-y-4"><IntegrationsTab user={user} /><SystemTab /></TabsContent>
      </Tabs>
    </>
  );
}

export default function Page() {
  return <Suspense><SettingsPage /></Suspense>;
}
