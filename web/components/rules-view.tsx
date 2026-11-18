"use client";

// How it works: rules() from the register, word for word: the question the model is asked, the prompt
// paragraphs, the combine table, the comparison, who may do what, the money and the limits.

import { useRead } from "@/components/use-read";
import { readRules } from "@/lib/chain";
import { RULES_COPY } from "@/lib/contract-rules";

const s = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function RulesView() {
  const r = useRead(async () => {
    const x = await readRules();
    return { data: { rules: x.data, copy: x.copy }, source: x.source };
  }, ["rules"]);
  const rules = r.data?.rules ?? RULES_COPY;
  const copy = r.data ? r.data.copy : true;
  const prompt = obj(rules.prompt);
  const section = (title: string, body: React.ReactNode) => (
    <section className="sheet pinned px-4 pt-6 pb-4 sm:px-6">
      <h2 className="head text-[22px] font-bold">{title}</h2>
      <div className="mt-2 text-[15px]">{body}</div>
    </section>
  );
  const table = (o: Record<string, unknown>) => (
    <dl className="ruled">
      {Object.entries(o).map(([k, v]) => (
        <div key={k} className="grid gap-x-3 border-b border-ruled/70 py-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <dt className="mono font-bold">{k}</dt>
          <dd>{s(v)}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="sheet pinned tilt-l px-4 pt-7 pb-5 sm:px-7">
        <p className="smallcaps text-[13px] text-wax">Standing orders</p>
        <h1 className="head mt-1 text-[32px] font-bold">How it works, in the contract&apos;s own words</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          Everything below is what rules() on the register answers, word for word.{" "}
          {copy ? "No register is set, so this is the site's copy, which the tests check against the contract's source." : "Read from the register just now."}
        </p>
        <blockquote className="head mt-4 border-l-4 border-wax bg-card px-4 py-3 text-[22px]">{s(rules.question)}</blockquote>
        <p className="mt-2 text-[15px]">{s(rules.answers)}</p>
      </div>
      {section("The prompt, paragraph by paragraph", table(prompt))}
      {section("Asked in two orders", <ul className="list-disc space-y-1 pl-5">{(Array.isArray(rules.askings) ? rules.askings : []).map((a, i) => <li key={i}>{s(a)}</li>)}</ul>)}
      {section(
        "Reading and combining the answers",
        <>
          <p>{s(rules.reading)}</p>
          <div className="mt-2">{table(obj(rules.combine))}</div>
          <p className="mt-2">
            <strong>Compared:</strong> {s(rules.compared)}
          </p>
          <p className="mt-1">
            <strong>Stored:</strong> {s(rules.value)}
          </p>
          <p className="mt-1">
            <strong>Never asked:</strong> {s(rules.not_asked)}
          </p>
          <p className="mt-1">
            <strong>Untrusted text:</strong> {s(rules.untrusted)}
          </p>
        </>,
      )}
      {section(
        "The award and the second looks",
        <>
          <p>
            <strong>Award:</strong> {s(rules.award)}
          </p>
          <p className="mt-1">
            <strong>Appeal:</strong> {s(rules.appeal)}
          </p>
          <p className="mt-1">
            <strong>Challenge:</strong> {s(rules.challenge)}
          </p>
          <p className="mt-1">
            <strong>Commitment:</strong> {s(rules.commitment)}
          </p>
          <p className="mt-1">
            <strong>Windows:</strong> {s(rules.windows)}
          </p>
        </>,
      )}
      {section("Who may do what", table(obj(rules.who)))}
      {section("The money", <>{table(obj(rules.money))}<p className="mt-2">{s(rules.settlement)}</p></>)}
      {section("Limits, stated plainly", <ul className="list-disc space-y-1 pl-5">{(Array.isArray(rules.limits) ? rules.limits : []).map((a, i) => <li key={i}>{s(a)}</li>)}</ul>)}
    </div>
  );
}
