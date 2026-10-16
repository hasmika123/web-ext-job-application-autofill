/**
 * Who changed it, in words (docs/change-audit/README.md sections 2.3, 2.5 and 3): the one helper every "Updated ... by ..." line and every
 * timeline entry reads through, for the personal tracker AND the organization workspaces.
 *
 * It lives here, NOT in `resume-builder/headerBar.ts`: that file belongs to the resume builder branch. `actorText` accepts the resume's
 * `{login, label}` actor too, so the resume header can adopt this module (and `headerBar.actorText` can re-export it) when that branch settles.
 *
 * Privacy rule: an enterprise login (`ent#...`) is never shown. The API never sends one; this module also refuses to print one.
 */

/** The API's `ChangeActorDTO`. `kind` is PERSON | EXTENSION | MAIL | ASSISTANT | SYSTEM; `relation` (organization records) marketer | admin | consultant | member | system. */
export interface ChangeActor {
  userId?: number | null;
  memberId?: number | null;
  label: string;
  relation?: string | null;
  kind: string;
}

/** The resume's actor (`ResumeActorDTO`), accepted so one function renders both. */
export interface LoginActor {
  login: string;
  label: string;
}

/** The viewer: the session's account id and login (the personal tracker), or the organization seat (`memberId`, the organization's records). Any may be unknown. */
export interface Viewer {
  id?: number | null;
  login?: string | null;
  memberId?: number | null;
  /** An organization page (the tenant host): the platform is not named there, so a system change reads "automatically" (D15, 2026-10-16 audit). */
  org?: boolean;
}

export type AnyActor = ChangeActor | LoginActor | null | undefined;

const MEMBER = "a member";

function isLoginActor(a: ChangeActor | LoginActor): a is LoginActor {
  return typeof (a as LoginActor).login === "string" && (a as ChangeActor).kind === undefined;
}

/** A label that is safe to print: never an enterprise login. */
export function safeLabel(label: string | null | undefined): string {
  const l = (label ?? "").trim();
  if (l === "") return MEMBER;
  return l.toLowerCase().startsWith("ent#") ? MEMBER : l;
}

/** Is this actor the viewer? A person actor with the viewer's account id (or, for the resume's actor, login). */
export function isViewer(actor: AnyActor, me: Viewer | null | undefined): boolean {
  if (!actor || !me) return false;
  if (isLoginActor(actor)) return me.login != null && actor.login === me.login;
  if (actor.kind !== "PERSON") return false;
  if (actor.memberId != null && me.memberId != null) return actor.memberId === me.memberId; // an organization record: compare seats
  return actor.userId != null && me.id != null && actor.userId === me.id;
}

/**
 * "you" for the viewer's own writes, else the person's name. A missing actor reads as "you" (a record whose writer was never recorded is the
 * owner's own, as the resume header has always done).
 */
export function actorText(actor: AnyActor, me: Viewer | null | undefined): string {
  if (!actor) return "you";
  if (isViewer(actor, me)) return "you";
  return safeLabel(actor.label);
}

/** The channel a change came through, as the API names it (`source` on a timeline event). */
export type Channel = "WEB" | "EXTENSION" | "INBOX" | "SYSTEM" | "ASSISTANT" | string;

/**
 * The words of a "by ..." line (README section 2.3, as the OWNER reads it):
 * "by you", "by you via the extension", "by the extension", "by Kiwiply from your email", "by Kiwiply AI", "by Kiwiply", "by Sarah Chen".
 * `kind` is the actor kind; for an old payload without one it is read from the channel. The relation tag is NOT part of the string
 * (the screens render it as a small chip: see `relationTag`).
 */
export function actorLine(actor: AnyActor, kind: string | null | undefined, source: Channel | null | undefined, me: Viewer | null | undefined): string {
  const k = kind ?? (actor && !isLoginActor(actor) ? actor.kind : undefined) ?? kindFromChannel(source);
  switch (k) {
    case "EXTENSION":
      return "by the extension";
    case "MAIL":
      return "by Kiwiply from your email";
    case "ASSISTANT":
      return "by Kiwiply AI";
    case "SYSTEM":
      return me?.org ? "automatically" : "by Kiwiply";
    default: {
      const who = actorText(actor, me);
      return who === "you" && source === "EXTENSION" ? "by you via the extension" : `by ${who}`;
    }
  }
}

/** An old payload names a channel only: the actor kind it implies. */
function kindFromChannel(source: Channel | null | undefined): string {
  switch (source) {
    case "INBOX":
      return "MAIL";
    case "ASSISTANT":
      return "ASSISTANT";
    case "SYSTEM":
      return "SYSTEM";
    default:
      return "PERSON";
  }
}

/** The small uppercase tag next to a person's name (organization records): "MARKETER", "ADMIN", ...; none for the viewer, a non-person or no relation. */
export function relationTag(actor: AnyActor, me?: Viewer | null): string | null {
  if (!actor || isLoginActor(actor) || actor.kind !== "PERSON" || !actor.relation) return null;
  if (isViewer(actor, me)) return null;
  return actor.relation.toUpperCase();
}

/** "Sarah Chen MARKETER" in one string (tests, aria labels); the screens render the tag as a chip. */
export function actorWithTag(actor: AnyActor, me?: Viewer | null): string {
  const text = actorText(actor, me);
  const tag = relationTag(actor, me);
  return tag ? `${text} ${tag}` : text;
}

/** The text a non-person actor stands for in a list row (always shown: system actors are the information). */
export function isNonPerson(actor: AnyActor, kind?: string | null): boolean {
  const k = kind ?? (actor && !isLoginActor(actor) ? actor.kind : "PERSON");
  return k !== "PERSON";
}

/**
 * The "by ..." line of a LIST ROW (D2): nothing when the actor is the viewer (a personal board would otherwise read "by you" on every row),
 * the actor otherwise, and always for a non-person (the extension, the inbox, ...).
 */
export function rowActorLine(actor: AnyActor, me: Viewer | null | undefined): string | null {
  if (!actor) return null;
  if (isNonPerson(actor)) return actorLine(actor, null, null, me);
  if (isViewer(actor, me)) return null;
  return actorLine(actor, null, null, me);
}

/** "Updated 2h ago by you" / "Updated 3d ago by the extension": the header line's words (`when` is the already-formatted relative time). */
export function updatedLine(when: string, actor: AnyActor, me: Viewer | null | undefined): string {
  const by = actorLine(actor, null, null, me);
  return when ? `Updated ${when} ${by}` : `Updated ${by}`;
}
