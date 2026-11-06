"use client";

import { Bot, Eraser, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { FarmGate } from "@/components/shared/farm-gate";
import { DemoBadge, ErrorState, LoadingState, PageHeader, errorText } from "@/components/shared/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAsk, useAssistantInfo, useChat, useClearChat } from "@/lib/api/hooks";
import type { Farm } from "@/lib/api/types";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useT } from "@/providers/i18n-provider";

const SUGGESTIONS: TKey[] = ["assistant.q1", "assistant.q2", "assistant.q3", "assistant.q4", "assistant.q5"];

function Chat({ farm }: { farm: Farm }) {
  const { t } = useT();
  const info = useAssistantInfo();
  const chat = useChat(farm.id);
  const ask = useAsk(farm.id);
  const clear = useClearChat(farm.id);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat.data, pending]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || ask.isPending) return;
    setDraft("");
    setPending(content);
    ask.mutate(content, {
      onError: (error) => { toast.error(errorText(error, t("state.errorBody"))); setDraft(content); },
      onSettled: () => setPending(null),
    });
  };

  const onSubmit = (event: FormEvent) => { event.preventDefault(); send(draft); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(draft); }
  };

  if (chat.isLoading) return <LoadingState rows={1} />;
  if (chat.isError) return <ErrorState error={chat.error} onRetry={chat.refetch} />;
  const messages = chat.data ?? [];

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="min-w-0 text-sm text-muted-foreground">{t("assistant.context", { farm: farm.name })}</p>
        <div className="flex shrink-0 items-center gap-2">
          {info.data?.is_demo && <DemoBadge label={t("assistant.demoBadge")} tip={info.data.notice ?? undefined} />}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" disabled={clear.isPending} onClick={() => clear.mutate()}><Eraser className="size-4" /> {t("assistant.clear")}</Button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && !pending && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <Bot className="mx-auto size-9 text-brand-2" />
            <h2 className="mt-2 text-lg font-semibold">{t("assistant.welcome")}</h2>
            <p className="mt-1 text-muted-foreground">{t("assistant.welcomeBody")}</p>
            {info.data?.notice && <p className="mt-3 rounded bg-warn-tint px-3 py-2 text-sm text-warn-ink">{info.data.notice}</p>}
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.role === "user" && "justify-end")}>
            <div className={cn("max-w-[85%] rounded-lg px-4 py-2.5 whitespace-pre-wrap md:max-w-[75%]",
              message.role === "user" ? "bg-brand text-white" : "bg-muted")}>
              {message.content}
            </div>
          </div>
        ))}
        {pending && (
          <>
            <div className="flex justify-end"><div className="max-w-[75%] rounded-lg bg-brand px-4 py-2.5 whitespace-pre-wrap text-white">{pending}</div></div>
            <div className="w-fit rounded-lg bg-muted px-4 py-2.5 text-muted-foreground">{t("assistant.thinking")}</div>
          </>
        )}
        <div ref={end} />
      </div>

      <div className="border-t p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {SUGGESTIONS.map((key) => (
            <button key={key} type="button" onClick={() => send(t(key))} disabled={ask.isPending}
              className="shrink-0 rounded-full border bg-background px-3 py-1.5 text-sm hover:border-brand-2 disabled:opacity-50">
              {t(key)}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} rows={1} maxLength={2000}
            placeholder={t("assistant.placeholder")} aria-label={t("assistant.placeholder")} className="max-h-32 min-h-10 resize-none" />
          <Button type="submit" size="icon" disabled={!draft.trim() || ask.isPending} aria-label={t("assistant.send")}><SendHorizontal className="size-4" /></Button>
        </form>
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t("nav.assistant")} description={t("assistant.subtitle")} />
      <FarmGate>{(farm) => <Chat farm={farm} />}</FarmGate>
    </>
  );
}
