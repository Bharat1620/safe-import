import type { ColumnDef, Row } from "../sheet/types";

export const DEMO_COLUMNS: ColumnDef[] = [
  { key: "full_name", header: "Full name", width: 200 },
  { key: "email", header: "Email", width: 260 },
  { key: "phone", header: "Phone", width: 180 },
  { key: "company", header: "Company", width: 200 },
];

const FIRST = ["Ana", "Bharat", "Chen", "Dara", "Elif", "Farid", "Gita", "Hana"];
const LAST = ["Rao", "Silva", "Okafor", "Nguyen", "Muller", "Haddad", "Kim"];
const CO = ["Northwind", "Acme", "Globex", "Initech", "Umbrella", "Soylent"];

/**
 * Demo and benchmark data only. Built from the index alone, so row 400,000
 * costs a few modulo operations and rows 0..399,999 are never created — that is
 * what makes a 500k-row benchmark cost no memory.
 *
 * Deliberately messy: every 29th name blank, every 13th email a duplicate,
 * every 7th phone unformatted.
 */
export function generateRow(index: number): Row {
  const first = FIRST[index % FIRST.length];
  const last = LAST[index % LAST.length];
  const emailIndex = index % 13 === 0 ? Math.max(0, index - 13) : index;

  return {
    index,
    cells: {
      full_name: index % 29 === 0 ? "" : `${first} ${last}`,
      email: `${first}.${last}${emailIndex}@example.com`.toLowerCase(),
      phone:
        index % 7 === 0
          ? String(9000000000 + (index % 999999999))
          : `+91 ${90000 + (index % 9999)} ${10000 + (index % 89999)}`,
      company: CO[index % CO.length],
    },
  };
}
