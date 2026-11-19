import { useMemo, useState } from "react";

export type SortState<K extends string> = { key: K; dir: "asc" | "desc" } | null;

/** A column for SortableHeader: first click ascending, then descending, then off. */
export function sortColumn<K extends string>(key: K, sort: SortState<K>, setSort: (s: SortState<K>) => void) {
  return {
    getIsSorted: () => (sort?.key === key ? sort.dir : false) as false | "asc" | "desc",
    getToggleSortingHandler: () => () => {
      if (sort?.key !== key) setSort({ key, dir: "asc" });
      else if (sort.dir === "asc") setSort({ key, dir: "desc" });
      else setSort(null);
    },
  };
}

/** Rows sorted client-side; empty values go last. */
export function useSorted<T, K extends string & keyof T>(rows: T[], initial: SortState<K> = null) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a[sort.key] as unknown;
      const y = b[sort.key] as unknown;
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      return (typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, sort]);
  return { sorted, sort, setSort, column: (key: K) => sortColumn(key, sort, setSort) };
}
