export function SectionIntro({
  index,
  kicker,
  title,
  lede,
  light = false,
}: {
  index?: string;
  kicker: string;
  title: string;
  lede: string;
  light?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <p className={light ? "text-sm font-semibold text-indigo-200" : "text-sm font-semibold text-accent"}>
        {index ? `${index} / ${kicker}` : kicker}
      </p>
      <h2
        className={
          light
            ? "mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl sm:leading-tight"
            : "mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl sm:leading-tight"
        }
      >
        {title}
      </h2>
      <p className={light ? "mt-4 text-base leading-7 text-zinc-300" : "mt-4 text-base leading-7 text-muted"}>{lede}</p>
    </div>
  );
}
