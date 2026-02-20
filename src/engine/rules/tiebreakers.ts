export interface TiebreakerRow {
  participantId: string;
  points: number;
  pointDiff?: number;
  buchholz?: number;
}

const defaultOrder = ["points", "point_diff", "buchholz"] as const;

export function sortWithTiebreakers(rows: TiebreakerRow[], order: string[] = [...defaultOrder]): TiebreakerRow[] {
  return [...rows].sort((a, b) => {
    for (const rule of order) {
      if (rule === "points" && a.points !== b.points) {
        return b.points - a.points;
      }
      if (rule === "point_diff" && (a.pointDiff ?? 0) !== (b.pointDiff ?? 0)) {
        return (b.pointDiff ?? 0) - (a.pointDiff ?? 0);
      }
      if (rule === "buchholz" && (a.buchholz ?? 0) !== (b.buchholz ?? 0)) {
        return (b.buchholz ?? 0) - (a.buchholz ?? 0);
      }
    }
    return a.participantId.localeCompare(b.participantId);
  });
}
