import { printingLabel, type BinderRow } from "./binderSurplus";

/** Every owned printing of a Binder row, with its quantity. Shared by the row expansion and the phone sheet. */
export function PrintingList({ row, id, className = "" }: { row: BinderRow; id?: string; className?: string }) {
  return (
    <ul id={id} className={`binder-printings ${className}`.trim()} aria-label={`Printings of ${row.name}`}>
      {row.printings.map((p, i) => (
        <li key={i}>
          <span>{printingLabel(p)}</span>
          <b>{p.quantity}</b>
        </li>
      ))}
    </ul>
  );
}
