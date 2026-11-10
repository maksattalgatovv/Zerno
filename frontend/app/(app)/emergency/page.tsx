"use client";

import {
  CheckCircle2, Copy, Droplets, Flame, HeartPulse, MessageSquare, Phone, Plane, Plus, ShieldAlert, Siren, Trash2, TriangleAlert,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FarmGate } from "@/components/shared/farm-gate";
import { FormField } from "@/components/shared/form-field";
import { DemoBadge, PageHeader, Panel, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api/client";
import {
  isActive, useEmergencies, useEmergencyDrone, useEmergencyEvent, useFields, useMission, useRaiseEmergency,
  useResolveEmergency,
} from "@/lib/api/hooks";
import type { Emergency, EmergencyType, Farm } from "@/lib/api/types";
import { useFormat } from "@/lib/hooks/use-format";
import { useSiren } from "@/lib/hooks/use-siren";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/providers/i18n-provider";

const TYPES: { id: EmergencyType; label: TKey; icon: typeof Flame }[] = [
  { id: "fire", label: "emergency.fire", icon: Flame },
  { id: "injury", label: "emergency.injury", icon: HeartPulse },
  { id: "other", label: "emergency.other", icon: TriangleAlert },
];

// Kazakhstan: 101 fire, 103 ambulance, 112 unified emergency line.
const NUMBERS: Record<EmergencyType, { number: string; label: TKey }[]> = {
  fire: [{ number: "101", label: "emergency.call101" }, { number: "112", label: "emergency.call112" }],
  injury: [{ number: "103", label: "emergency.call103" }, { number: "112", label: "emergency.call112" }],
  other: [{ number: "112", label: "emergency.call112" }],
};
const ALL_NUMBERS = [...NUMBERS.fire, NUMBERS.injury[0]];
const NO_FIELD = "none";

function CallButton({ number, label, onCall, primary }: { number: string; label: string; onCall?: () => void; primary?: boolean }) {
  return (
    <a href={`tel:${number}`} onClick={onCall}
      className={cn("flex min-h-14 items-center gap-3 rounded-lg px-4 font-semibold",
        primary ? "bg-[#B93636] text-white hover:bg-[#A02E2E]" : "border bg-card hover:bg-muted")}>
      <Phone className="size-5 shrink-0" />
      <span className="flex-1">{label}</span>
      <span className="text-xl">{number}</span>
    </a>
  );
}

function RaiseForm({ farm, onRaised }: { farm: Farm; onRaised: () => void }) {
  const { t } = useT();
  const fields = useFields(farm.id);
  const raise = useRaiseEmergency();
  const [type, setType] = useState<EmergencyType | null>(null);
  const [fieldId, setFieldId] = useState<string>();
  const [sendDrone, setSendDrone] = useState(true);
  const selectedField = fieldId ?? fields.data?.[0]?.id ?? NO_FIELD;

  const submit = () => {
    if (!type) return;
    // Started here, inside the tap, because browsers block sound started later.
    onRaised();
    raise.mutate(
      { farm_id: farm.id, type, field_id: selectedField === NO_FIELD ? null : selectedField, send_drone: sendDrone },
      { onError: (error) => toast.error(errorText(error, t("state.errorBody"))) },
    );
  };

  return (
    <Panel title={t("emergency.whatHappened")}>
      <div className="grid gap-3 sm:grid-cols-3">
        {TYPES.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-pressed={type === id} onClick={() => setType(id)}
            className={cn("flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-3 font-semibold",
              type === id ? "border-[#B93636] bg-danger-tint text-danger-ink" : "bg-card hover:border-danger/50")}>
            <Icon className="size-6" />
            {t(label)}
          </button>
        ))}
      </div>
      {type && (
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="emergency-field">{t("emergency.where")}</Label>
            <Select value={selectedField} onValueChange={setFieldId}>
              <SelectTrigger id="emergency-field" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {fields.data?.map((field) => <SelectItem key={field.id} value={field.id}>{field.name}</SelectItem>)}
                <SelectItem value={NO_FIELD}>{t("emergency.notOnField")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start gap-3 rounded bg-muted p-3">
            <Switch id="send-drone" checked={sendDrone} onCheckedChange={setSendDrone} className="mt-0.5" />
            <Label htmlFor="send-drone" className="block leading-snug font-normal">{t("emergency.sendDrone")}</Label>
          </div>
          <Button size="lg" onClick={submit} disabled={raise.isPending} className="h-14 w-full bg-[#B93636] text-base text-white hover:bg-[#A02E2E]">
            <Siren className="size-5" /> {t("emergency.raise")}
          </Button>
        </div>
      )}
    </Panel>
  );
}

function DronePanel({ emergency }: { emergency: Emergency }) {
  const { t } = useT();
  const format = useFormat();
  const send = useEmergencyDrone();
  const { data: mission } = useMission(emergency.mission_id);
  const flying = isActive(mission);

  const dispatch = (mode: "recon" | "suppress") =>
    send.mutate({ id: emergency.id, mode }, { onError: (error) => toast.error(errorText(error, t("state.errorBody"))) });

  return (
    <Panel title={t("emergency.droneTitle")} actions={<DemoBadge label={t("common.simulated")} tip={t("emergency.droneTip")} />}>
      {flying && mission ? (
        <>
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{t(`drone.phase.${mission.phase ?? "takeoff"}` as TKey)}</span>
            <span className="text-sm text-muted-foreground">{t("drone.battery")}: {format.number(mission.battery ?? 0)}%</span>
          </div>
          <Progress value={mission.progress * 100} className="mt-2 h-2.5" aria-label={t("drone.coverage")} />
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" disabled={send.isPending} onClick={() => dispatch("recon")}><Plane className="size-4" /> {t("emergency.recon")}</Button>
          {emergency.type === "fire" && (
            <Button variant="outline" disabled={send.isPending} onClick={() => dispatch("suppress")}><Droplets className="size-4" /> {t("emergency.suppress")}</Button>
          )}
        </div>
      )}
      <p className="mt-3 text-sm text-muted-foreground">{t("emergency.droneTip")}</p>
    </Panel>
  );
}

function ActiveEmergency({ emergency, siren }: { emergency: Emergency; siren: ReturnType<typeof useSiren> }) {
  const { t } = useT();
  const format = useFormat();
  const { user } = useAuth();
  const event = useEmergencyEvent();
  const resolve = useResolveEmergency();
  const [closing, setClosing] = useState(false);

  const place = emergency.field_name ?? t("emergency.notOnField");
  const coordinates = `${emergency.latitude.toFixed(5)}, ${emergency.longitude.toFixed(5)}`;
  const message = t("emergency.message", {
    title: emergency.title, place, coordinates,
    link: `https://maps.google.com/?q=${emergency.latitude},${emergency.longitude}`,
  });
  const record = (code: "siren" | "call" | "sms", detail = "") => event.mutate({ id: emergency.id, code, detail });
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;

  const toggleSiren = () => {
    if (siren.active) return siren.stop();
    siren.start();
    record("siren");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-[#B93636] p-5 text-white">
        <p className="flex items-center gap-2 text-sm font-medium"><Siren className="size-4" /> {t("emergency.activeLabel")}</p>
        <h2 className="mt-1 text-2xl font-semibold">{emergency.title}</h2>
        <p className="mt-1 text-white/90">{place} · {coordinates}</p>
      </section>

      <div className="flex items-start gap-2 rounded-lg border-2 border-[#B93636] bg-danger-tint p-4 font-medium text-danger-ink">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <span>{t("emergency.mustCall")}</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {NUMBERS[emergency.type].map((item, index) => (
          <CallButton key={item.number} number={item.number} label={t(item.label)} primary={index === 0} onCall={() => record("call", item.number)} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("emergency.signalTitle")}>
          <Button variant={siren.active ? "destructive" : "outline"} className="w-full" onClick={toggleSiren}>
            {siren.active ? <VolumeX className="size-4" /> : <Siren className="size-4" />}
            {t(siren.active ? "emergency.sirenOff" : "emergency.sirenOn")}
          </Button>
          <h3 className="mt-4 font-medium">{t("emergency.tellPeople")}</h3>
          <p className="mt-2 rounded bg-muted p-3 text-sm">{message}</p>
          {canCopy && (
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => void navigator.clipboard.writeText(message).then(() => toast.success(t("emergency.copied")))}>
              <Copy className="size-3.5" /> {t("emergency.copy")}
            </Button>
          )}
          {user?.emergency_contacts.length ? (
            <ul className="mt-2 space-y-2">
              {user.emergency_contacts.map((contact) => (
                <li key={contact.phone}>
                  <a href={`sms:${contact.phone.replace(/[^+\d]/g, "")}?body=${encodeURIComponent(message)}`} onClick={() => record("sms", contact.name)}
                    className="flex min-h-11 items-center gap-2 rounded-lg border px-3 hover:bg-muted">
                    <MessageSquare className="size-4 text-brand-2" /> {t("emergency.smsTo", { name: contact.name })}
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-muted-foreground">{t("emergency.noContacts")}</p>}
        </Panel>
        <DronePanel emergency={emergency} />
      </div>

      <Panel title={t("emergency.timeline")}>
        <ol className="space-y-2">
          {[...emergency.log].reverse().map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground">{format.ago(entry.at)}</span>
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Button variant="outline" className="w-full" onClick={() => setClosing(true)}><CheckCircle2 className="size-4" /> {t("emergency.resolve")}</Button>
      <ConfirmDialog open={closing} onOpenChange={setClosing} title={t("emergency.resolveTitle")} body={t("emergency.resolveBody")}
        confirmLabel={t("emergency.resolve")}
        onConfirm={() => {
          siren.stop();
          resolve.mutate(emergency.id, { onError: (error) => toast.error(errorText(error, t("state.errorBody"))) });
        }} />
    </div>
  );
}

function Contacts() {
  const { t } = useT();
  const { user, update } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const contacts = user?.emergency_contacts ?? [];

  const save = (next: typeof contacts) =>
    update({ emergency_contacts: next })
      .then(() => { setName(""); setPhone(""); })
      .catch((error) => toast.error(error instanceof ApiError && error.status === 422 ? t("emergency.badPhone") : errorText(error, t("state.errorBody"))));

  return (
    <Panel title={t("emergency.contacts")} hint={t("emergency.contactsHint")}>
      <ul className="divide-y">
        {contacts.map((contact) => (
          <li key={contact.phone} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1"><span className="block font-medium">{contact.name}</span><span className="block text-sm text-muted-foreground">{contact.phone}</span></span>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} onClick={() => void save(contacts.filter((c) => c !== contact))}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>
      <form className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => { event.preventDefault(); void save([...contacts, { name: name.trim(), phone: phone.trim() }]); }}>
        <FormField id="contact-name" label={t("auth.name")}><Input id="contact-name" required value={name} onChange={(e) => setName(e.target.value)} /></FormField>
        <FormField id="contact-phone" label={t("emergency.phone")}><Input id="contact-phone" type="tel" required placeholder="+7 7__ ___ __ __" value={phone} onChange={(e) => setPhone(e.target.value)} /></FormField>
        <Button type="submit" variant="outline"><Plus className="size-4" /> {t("emergency.addContact")}</Button>
      </form>
    </Panel>
  );
}

function Content({ farm }: { farm: Farm }) {
  const { t } = useT();
  const format = useFormat();
  const query = useEmergencies(farm.id);
  const siren = useSiren();
  const active = query.data?.find((item) => item.status === "active");
  const past = query.data?.filter((item) => item.status === "resolved") ?? [];

  if (active) return <ActiveEmergency emergency={active} siren={siren} />;

  return (
    <div className="space-y-4">
      <RaiseForm farm={farm} onRaised={siren.start} />
      <Panel title={t("emergency.numbers")}>
        <div className="grid gap-2 sm:grid-cols-3">
          {ALL_NUMBERS.map((item) => <CallButton key={item.number} number={item.number} label={t(item.label)} />)}
        </div>
      </Panel>
      <Contacts />
      {past.length > 0 && (
        <Panel title={t("emergency.past")}>
          <ul className="divide-y">
            {past.map((item) => (
              <li key={item.id} className="py-2">
                <span className="block font-medium">{item.title}{item.field_name ? ` · ${item.field_name}` : ""}</span>
                <span className="block text-sm text-muted-foreground">{format.dateTime(item.created_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

export default function EmergencyPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("nav.emergency")} description={t("emergency.subtitle")} />
      <FarmGate>{(farm) => <Content farm={farm} />}</FarmGate>
    </>
  );
}
