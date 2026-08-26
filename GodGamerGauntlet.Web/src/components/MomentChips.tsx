export default function MomentChips({ moments }: { moments: string[] | null | undefined }) {
  if (!moments || moments.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {moments.map((moment) => (
        <li
          key={moment}
          className="border border-gold/25 px-2 py-0.5 text-xs text-gold"
        >
          {moment}
        </li>
      ))}
    </ul>
  );
}
