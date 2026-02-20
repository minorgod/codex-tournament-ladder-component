import type { Match, Participant } from "@/models";

function participantName(participantsById: Map<string, Participant>, participantId: string | null): string {
  if (!participantId) {
    return "TBD";
  }
  if (participantId === "BYE") {
    return "BYE";
  }
  return participantsById.get(participantId)?.name ?? participantId;
}

function scoreText(match: Match): string {
  if (!match.score) {
    return "";
  }
  if (match.score.mode === "sets" && match.score.sets?.length) {
    return match.score.sets.map((set) => `${set.a}-${set.b}`).join(", ");
  }
  return `${match.score.a ?? "-"}-${match.score.b ?? "-"}`;
}

function outcomeText(match: Match): string {
  if (!match.outcome) {
    return "No result yet";
  }
  if (match.outcome.kind === "draw") {
    return "Draw";
  }
  if (match.outcome.kind === "no_contest") {
    return "No contest";
  }
  return `Winner: ${match.outcome.winnerId}`;
}

export function accessibleMatchLabel(match: Match, participantsById: Map<string, Participant>): string {
  const [a, b] = match.participants;
  const names = `${participantName(participantsById, a)} vs ${participantName(participantsById, b)}`;
  return `${names}. Status ${match.status}. Score ${scoreText(match) || "unscored"}. ${outcomeText(match)}`;
}

export function MatchCard(props: {
  match: Match;
  participantsById: Map<string, Participant>;
  isHighlighted?: boolean;
  isUpset?: boolean;
  isLive?: boolean;
  onClick(matchId: string): void;
}) {
  const [a, b] = props.match.participants;
  const aName = participantName(props.participantsById, a);
  const bName = participantName(props.participantsById, b);
  const score = scoreText(props.match);

  const classes = [
    "tlc-match-card",
    props.isHighlighted ? "is-highlight" : "",
    props.isUpset ? "is-upset" : "",
    props.isLive ? "is-live" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      onClick={() => props.onClick(props.match.id)}
      aria-label={accessibleMatchLabel(props.match, props.participantsById)}
    >
      <div className="tlc-row">
        <strong>{aName}</strong>
        <span>{score ? score.split("-")[0] : ""}</span>
      </div>
      <div className="tlc-row">
        <strong>{bName}</strong>
        <span>{score ? score.split("-")[1] : ""}</span>
      </div>
      <div className="tlc-row tlc-muted">
        <span>{props.match.status}</span>
        <span>{props.match.roundId ?? ""}</span>
      </div>
    </button>
  );
}
