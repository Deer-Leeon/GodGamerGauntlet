"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  assignModerator,
  canManageBoard,
  createCategory,
  createVariable,
  createVariableValue,
  getGameModerators,
  getGameRecords,
  removeModerator,
  updateCategory,
  type GameModeratorInfo,
  type GameRecords,
  type RecordsCategory,
  type RecordsVariable,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ManageBoardPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user, loading: authLoading } = useAuth();

  const [records, setRecords] = useState<GameRecords | null>(null);
  const [categories, setCategories] = useState<RecordsCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGameRecords(gameId)
      .then((fetched) => {
        if (cancelled) return;
        setRecords(fetched);
        setCategories(fetched.categories);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorText(error, "Failed to load board."));
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  if (authLoading || (!records && !loadError)) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <p className="py-14 text-sm text-faint">Loading…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <p className="py-14 text-sm text-red-400/90">{loadError}</p>
      </main>
    );
  }

  const authorized = canManageBoard(user, records!.moderators);
  if (!authorized) {
    return (
      <main className="site-content flex-1 px-5 py-8 sm:px-7">
        <h1 className="text-2xl font-semibold">Manage board</h1>
        <p className="mt-4 text-sm text-muted">
          Only global admins and this game&apos;s moderators can manage its
          record board.
        </p>
        <Link
          href={user ? `/records/${gameId}` : "/login"}
          className="mt-6 inline-block bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
        >
          {user ? "Back to leaderboard" : "Sign in"}
        </Link>
      </main>
    );
  }

  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gold/20 pb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            Manage board — {records!.title}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Categories, variables, and values are the contract runners submit
            against. Existing submissions keep their selected values.
          </p>
        </div>
        <Link
          href={`/records/${gameId}`}
          className="border border-gold/30 px-4 py-2 text-sm text-muted transition hover:border-gold hover:text-ink"
        >
          View leaderboard
        </Link>
      </header>

      <CategoryManager
        gameId={gameId}
        categories={categories}
        onChange={setCategories}
      />

      {user?.isAdmin && <ModeratorRoster gameId={gameId} />}
    </main>
  );
}

// ── Categories ───────────────────────────────────────────────────────────────

function CategoryManager({
  gameId,
  categories,
  onChange,
}: {
  gameId: string;
  categories: RecordsCategory[];
  onChange: (next: RecordsCategory[]) => void;
}) {
  const [adding, setAdding] = useState(categories.length === 0);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Categories</h2>
        <button
          onClick={() => setAdding((open) => !open)}
          className="bg-gold px-3 py-1.5 text-sm text-dark transition hover:bg-gold/90"
        >
          {adding ? "Cancel" : "+ New category"}
        </button>
      </div>

      {adding && (
        <CategoryForm
          heading="New category"
          initialName=""
          initialRules=""
          submitLabel="Create category"
          onSubmit={async (name, rules) => {
            const created = await createCategory(gameId, { name, rules });
            onChange([...categories, created]);
            setAdding(false);
          }}
        />
      )}

      {categories.length === 0 && !adding && (
        <p className="mt-4 text-sm text-faint">
          No categories yet — runs can&apos;t be submitted until one exists.
        </p>
      )}

      <div className="mt-4 space-y-4">
        {categories.map((category) => (
          <CategoryCard
            key={category.id}
            category={category}
            onReplace={(next) =>
              onChange(categories.map((c) => (c.id === next.id ? next : c)))
            }
          />
        ))}
      </div>
    </section>
  );
}

function CategoryForm({
  heading,
  initialName,
  initialRules,
  submitLabel,
  onSubmit,
}: {
  heading: string;
  initialName: string;
  initialRules: string;
  submitLabel: string;
  onSubmit: (name: string, rules: string | null) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [rules, setRules] = useState(initialRules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim(), rules.trim() ? rules : null);
    } catch (err: unknown) {
      setError(errorText(err, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 border border-gold/20 bg-black/20 p-4"
    >
      <p className="text-sm text-faint">{heading}</p>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Category name — e.g. Any%"
        maxLength={100}
        className="w-full border border-gold/30 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
      />
      <textarea
        value={rules}
        onChange={(event) => setRules(event.target.value)}
        placeholder="Rules (markdown) — what counts as done, timing start/stop, banned glitches…"
        rows={5}
        className="w-full border border-gold/30 bg-transparent px-3 py-2 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-gold focus:outline-none"
      />
      {error && <p className="text-sm text-red-400/90">{error}</p>}
      <button
        type="submit"
        disabled={!name.trim() || busy}
        className="bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function CategoryCard({
  category,
  onReplace,
}: {
  category: RecordsCategory;
  onReplace: (next: RecordsCategory) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <article className="border border-gold/20 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-gold">{category.name}</h3>
        <button
          onClick={() => setEditing((open) => !open)}
          className="text-sm text-faint transition hover:text-ink"
        >
          {editing ? "Close editor" : "Edit name & rules"}
        </button>
      </div>

      {!editing && (
        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-faint">
          {category.rules ?? "No rules written yet."}
        </p>
      )}

      {editing && (
        <CategoryForm
          heading={`Editing ${category.name}`}
          initialName={category.name}
          initialRules={category.rules ?? ""}
          submitLabel="Save changes"
          onSubmit={async (name, rules) => {
            const updated = await updateCategory(category.id, { name, rules });
            onReplace(updated);
            setEditing(false);
          }}
        />
      )}

      <VariableBuilder category={category} onReplace={onReplace} />
    </article>
  );
}

// ── Variables & values ───────────────────────────────────────────────────────

function VariableBuilder({
  category,
  onReplace,
}: {
  category: RecordsCategory;
  onReplace: (next: RecordsCategory) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [isSubcategory, setIsSubcategory] = useState(true);
  const [isRequired, setIsRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createVariable(category.id, {
        name: name.trim(),
        isSubcategory,
        isRequired,
      });
      onReplace({ ...category, variables: [...category.variables, created] });
      setName("");
      setAdding(false);
    } catch (err: unknown) {
      setError(errorText(err, "Couldn't add the variable."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-gold/10 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Variables</p>
        <button
          onClick={() => setAdding((open) => !open)}
          className="text-sm text-faint transition hover:text-gold"
        >
          {adding ? "Cancel" : "+ Add variable"}
        </button>
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="mt-3 space-y-3">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Variable name — e.g. Platform"
            maxLength={100}
            autoFocus
            className="w-full border border-gold/30 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
          />
          <div className="flex flex-wrap gap-5 text-sm text-muted">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isSubcategory}
                onChange={(event) => setIsSubcategory(event.target.checked)}
              />
              Splits board (subcategory)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(event) => setIsRequired(event.target.checked)}
              />
              Required on submit
            </label>
          </div>
          {error && <p className="text-sm text-red-400/90">{error}</p>}
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="border border-gold/40 px-3 py-1.5 text-sm text-gold transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add variable"}
          </button>
        </form>
      )}

      {category.variables.length === 0 && !adding && (
        <p className="mt-2 text-xs text-faint">
          None — the board is a single list until a subcategory variable splits
          it.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {category.variables.map((variable) => (
          <VariableRow
            key={variable.id}
            variable={variable}
            onReplace={(next) =>
              onReplace({
                ...category,
                variables: category.variables.map((v) =>
                  v.id === next.id ? next : v,
                ),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function VariableRow({
  variable,
  onReplace,
}: {
  variable: RecordsVariable;
  onReplace: (next: RecordsVariable) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddValue(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createVariableValue(variable.id, value.trim());
      onReplace({ ...variable, values: [...variable.values, created] });
      setValue("");
    } catch (err: unknown) {
      setError(errorText(err, "Couldn't add the option."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-gold/10 bg-black/20 p-3">
      <p className="text-sm text-ink">
        {variable.name}
        {variable.isSubcategory && (
          <span className="ml-2 border border-gold/30 px-1.5 py-0.5 text-[11px] text-gold">
            SPLITS BOARD
          </span>
        )}
        {variable.isRequired && (
          <span className="ml-2 border border-gold/20 px-1.5 py-0.5 text-[11px] text-faint">
            REQUIRED
          </span>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {variable.values.map((option) => (
          <span
            key={option.id}
            className="border border-gold/20 px-2 py-0.5 text-xs text-muted"
          >
            {option.value}
          </span>
        ))}
        <form onSubmit={handleAddValue} className="flex items-center gap-1.5">
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Add option…"
            maxLength={100}
            className="w-32 border border-gold/20 bg-transparent px-2 py-0.5 text-xs text-ink placeholder:text-faint focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={!value.trim() || busy}
            className="text-xs text-faint transition hover:text-gold disabled:opacity-40"
          >
            Add
          </button>
        </form>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-400/90">{error}</p>}
    </div>
  );
}

// ── Moderator roster (admins only) ───────────────────────────────────────────

function ModeratorRoster({ gameId }: { gameId: string }) {
  const [moderators, setModerators] = useState<GameModeratorInfo[] | null>(
    null,
  );
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGameModerators(gameId)
      .then((fetched) => {
        if (!cancelled) setModerators(fetched);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorText(err, "Failed to load moderators."));
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!username.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await assignModerator(gameId, username.trim());
      setModerators(await getGameModerators(gameId));
      setUsername("");
    } catch (err: unknown) {
      setError(errorText(err, "Couldn't assign that user."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: string) {
    setError(null);
    const previous = moderators;
    setModerators((current) =>
      (current ?? []).filter((m) => m.userId !== userId),
    );
    try {
      await removeModerator(gameId, userId);
    } catch (err: unknown) {
      setModerators(previous);
      setError(errorText(err, "Couldn't remove that moderator."));
    }
  }

  return (
    <section className="mt-10 border-t border-gold/20 pt-6">
      <h2 className="text-lg font-semibold">Moderator roster</h2>
      <p className="mt-1 text-sm text-faint">
        Admins only. Moderators verify runs and manage this board.
      </p>

      <form onSubmit={handleAssign} className="mt-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Exact username"
          className="border border-gold/30 bg-transparent px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={!username.trim() || busy}
          className="bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Assigning…" : "Assign moderator"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-400/90">{error}</p>}

      <ul className="mt-4 space-y-2">
        {(moderators ?? []).map((mod) => (
          <li
            key={mod.userId}
            className="flex items-center justify-between gap-3 border border-gold/10 bg-black/20 px-3 py-2 text-sm"
          >
            <Link
              href={`/u/${encodeURIComponent(mod.username)}`}
              className="text-ink hover:text-gold"
            >
              {mod.username}
            </Link>
            <button
              onClick={() => handleRemove(mod.userId)}
              className="text-xs text-red-400/80 transition hover:text-red-400"
            >
              Revoke
            </button>
          </li>
        ))}
        {moderators !== null && moderators.length === 0 && (
          <li className="text-sm text-faint">
            No moderators assigned — only admins can verify runs for this game.
          </li>
        )}
      </ul>
    </section>
  );
}
