"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  formatRecordTime,
  getGameRecords,
  isValidProofUrl,
  parseRecordTime,
  submitRun,
  type GameRecords,
  type RecordsCategory,
  type Submission,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function SubmitRunPage() {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense
      fallback={
        <main className="site-content flex-1 px-5 py-8 sm:px-7">
          <p className="py-14 text-sm text-faint">Loading…</p>
        </main>
      }
    >
      <SubmitRunForm />
    </Suspense>
  );
}

function SubmitRunForm() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user, loading: authLoading } = useAuth();

  // Gauntlet wedge: /run and /control deep-link a recorded split time here.
  const search = useSearchParams();
  const prefillMs = (() => {
    const raw = Number(search.get("timeMs"));
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  })();
  const sourceRunId = search.get("sourceRunId");

  const [records, setRecords] = useState<GameRecords | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<string>("");
  const [timeText, setTimeText] = useState(() =>
    prefillMs !== null ? formatRecordTime(prefillMs) : "",
  );
  const [videoUrl, setVideoUrl] = useState("");
  const [playedOn, setPlayedOn] = useState(todayInputValue());
  const [isEmulator, setIsEmulator] = useState(false);
  // variableId → chosen valueId ("" = not chosen).
  const [choices, setChoices] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Submission | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGameRecords(gameId)
      .then((fetched) => {
        if (cancelled) return;
        setRecords(fetched);
        setCategoryId(fetched.categories[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load game.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const category: RecordsCategory | null = useMemo(
    () => records?.categories.find((c) => c.id === categoryId) ?? null,
    [records, categoryId],
  );

  const parsedMs = useMemo(() => parseRecordTime(timeText), [timeText]);
  const videoValid = videoUrl.trim() === "" ? null : isValidProofUrl(videoUrl);

  const missingRequired = useMemo(
    () =>
      (category?.variables ?? []).filter(
        (variable) => variable.isRequired && !choices[variable.id],
      ),
    [category, choices],
  );

  const canSubmit =
    !submitting &&
    category !== null &&
    parsedMs !== null &&
    videoValid === true &&
    playedOn !== "" &&
    missingRequired.length === 0;

  function switchCategory(id: string) {
    setCategoryId(id);
    setChoices({});
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || !category || parsedMs === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const submitted = await submitRun({
        gameId,
        categoryId: category.id,
        primaryTimeMs: parsedMs,
        videoUrl: videoUrl.trim(),
        playedOn: new Date(`${playedOn}T00:00:00`).toISOString(),
        isEmulator,
        variableValueIds: Object.values(choices).filter(Boolean),
      });
      setResult(submitted);
    } catch (error: unknown) {
      setSubmitError(
        error instanceof Error ? error.message : "Submission failed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <p className="py-14 text-sm text-faint">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <h1 className="text-2xl font-semibold">Submit a run</h1>
        <p className="mt-4 text-sm text-muted">
          You need an account to add a time to this roster game.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
        >
          Sign in
        </Link>
      </main>
    );
  }

  if (result) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <div className="mx-auto max-w-xl border border-gold/20 bg-black/20 p-6">
          <h1 className="text-xl font-semibold text-gold">Run submitted</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Your {result.categoryName} run of{" "}
            <span className="font-mono text-ink">
              {formatRecordTime(result.primaryTimeMs)}
            </span>{" "}
            is now <span className="text-gold">pending review</span>. A
            moderator will watch your proof and verify or reject it — you can
            check back on this game&apos;s board once it clears.
          </p>
          <div className="mt-6 flex gap-4 text-sm">
            <Link
              href={`/records/${gameId}`}
              className="bg-gold px-4 py-2 text-dark transition hover:bg-gold/90"
            >
              Back to roster
            </Link>
            <button
              onClick={() => {
                setResult(null);
                setTimeText("");
                setVideoUrl("");
              }}
              className="border border-gold/30 px-4 py-2 text-muted transition hover:border-gold hover:text-ink"
            >
              Submit another
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="border-b border-gold/20 pb-6">
        <h1 className="text-2xl font-semibold">
          Submit a run{records ? ` — ${records.title}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Every run needs a full video proof. A moderator reviews each
          submission before it lands on the board.
        </p>
      </header>

      {prefillMs !== null && (
        <p className="mt-4 border border-gold/25 bg-gold/5 px-4 py-2.5 text-sm text-muted">
          Time carried over from your gauntlet split
          {sourceRunId && (
            <>
              {" — "}
              <Link
                href={`/run/${sourceRunId}`}
                className="text-gold hover:text-gold/80"
              >
                view the run
              </Link>
            </>
          )}
          . Pick a category, paste your VOD, and you&apos;re done.
        </p>
      )}

      {loadError && <p className="py-6 text-sm text-red-400/90">{loadError}</p>}

      {records && records.categories.length === 0 && (
        <p className="py-14 text-sm text-faint">
          This game has no categories yet, so runs can&apos;t be submitted.
        </p>
      )}

      {records && records.categories.length > 0 && (
        <form onSubmit={handleSubmit} className="mt-8 max-w-xl space-y-6">
          <Field label="Category">
            <select
              value={categoryId}
              onChange={(event) => switchCategory(event.target.value)}
              className="w-full border border-gold/30 bg-transparent px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none"
            >
              {records.categories.map((item) => (
                <option key={item.id} value={item.id} className="bg-dark">
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Time"
            hint={
              timeText.trim() === ""
                ? "HH:MM:SS.ms — e.g. 1:29:44.210 or 17:52"
                : parsedMs !== null
                  ? `Reads as ${formatRecordTime(parsedMs)}`
                  : "Can't parse that time. Use H:MM:SS.ms, MM:SS, or SS.ms."
            }
            hintTone={
              timeText.trim() !== "" && parsedMs === null ? "error" : "normal"
            }
          >
            <input
              type="text"
              value={timeText}
              onChange={(event) => setTimeText(event.target.value)}
              placeholder="1:29:44.210"
              className="w-full border border-gold/30 bg-transparent px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
            />
          </Field>

          <Field
            label="Video proof URL"
            hint={
              videoValid === false
                ? "Must be a YouTube or Twitch video/clip link (https)."
                : "YouTube or Twitch. Full run, unedited."
            }
            hintTone={videoValid === false ? "error" : "normal"}
          >
            <input
              type="url"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              className="w-full border border-gold/30 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
            />
          </Field>

          {(category?.variables ?? []).map((variable) => (
            <Field
              key={variable.id}
              label={`${variable.name}${variable.isRequired ? "" : " (optional)"}`}
            >
              <select
                value={choices[variable.id] ?? ""}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [variable.id]: event.target.value,
                  }))
                }
                className="w-full border border-gold/30 bg-transparent px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none"
              >
                <option value="" className="bg-dark">
                  {variable.isRequired ? "Choose…" : "—"}
                </option>
                {variable.values.map((value) => (
                  <option key={value.id} value={value.id} className="bg-dark">
                    {value.value}
                  </option>
                ))}
              </select>
            </Field>
          ))}

          <div className="flex flex-wrap items-end gap-6">
            <Field label="Played on">
              <input
                type="date"
                value={playedOn}
                max={todayInputValue()}
                onChange={(event) => setPlayedOn(event.target.value)}
                className="border border-gold/30 bg-transparent px-3 py-2 text-sm text-ink focus:border-gold focus:outline-none"
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={isEmulator}
                onChange={(event) => setIsEmulator(event.target.checked)}
                className="accent-[var(--gold,#d4af37)]"
              />
              Played on emulator
            </label>
          </div>

          {submitError && (
            <p className="text-sm text-red-400/90">{submitError}</p>
          )}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-gold px-5 py-2 text-sm text-dark transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
            <Link
              href={`/records/${gameId}`}
              className="text-sm text-faint hover:text-ink"
            >
              Back to board
            </Link>
          </div>
          {missingRequired.length > 0 && (
            <p className="text-xs text-faint">
              Still needed:{" "}
              {missingRequired.map((variable) => variable.name).join(", ")}
            </p>
          )}
        </form>
      )}
    </main>
  );
}

function Field({
  label,
  hint,
  hintTone = "normal",
  children,
}: {
  label: string;
  hint?: string;
  hintTone?: "normal" | "error";
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
      {children}
      {hint && (
        <span
          className={`mt-1.5 block text-xs ${
            hintTone === "error" ? "text-red-400/90" : "text-faint"
          }`}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
