// Command-line front end: parses argv by hand, looks the command up in a table
// of small handlers, wires the services to the JSON-file store and prints plain
// text. Domain errors become exit code 1; anything else is a crash and stays one.

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoDate, parseIsoDateTime } from './domain/dates.js';
import { DomainError } from './domain/errors.js';
import type { Match, Offer } from './domain/types.js';
import { MatchService } from './matching/MatchService.js';
import type { Clock } from './matching/ports.js';
import { PeopleService } from './people/PeopleService.js';
import { sequentialIds } from './storage/ids.js';
import { JsonFileStore } from './storage/JsonFileStore.js';
import { loadZones } from './zones/zones.js';

interface Args {
  readonly command: string;
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string>>;
}

interface App {
  readonly people: PeopleService;
  readonly matches: MatchService;
  readonly clock: Clock;
}

type Handler = (app: App, args: Args) => void;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `Usage: relay <command> [args] [--file data.json] [--zones zones.json] [--now YYYY-MM-DDTHH:MM]

  people
  add-person <name> driver|rider|both <zone>
  offer <driver> <date> <fromZone> --arrive HH:MM --departs HH:MM --seats N [--via a,b]
  request <rider> <date> <zone> --arrive HH:MM --earliest HH:MM
  propose <requestId>
  confirm <matchId>
  complete <matchId>
  no-show <matchId> driver|rider
  cancel-offer <offerId>
  cancel-request <requestId>
  board <date>
  reliability`;

/** `--flag value` pairs become flags; everything else is positional. */
function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = argv[i + 1] ?? '';
      i += 1;
    } else {
      positional.push(argv[i]);
    }
  }
  const [command = 'help', ...rest] = positional;
  return { command, positional: rest, flags };
}

const usage = (why: string): DomainError => new DomainError('USAGE', `${why}\n\n${USAGE}`);

function need(args: Args, index: number, what: string): string {
  const value = args.positional[index];
  if (value === undefined) throw usage(`Missing ${what}`);
  return value;
}

/** A required flag; with `shape`, a cheap check so a typo fails before anything is looked up. */
function flag(args: Args, name: string, shape?: RegExp): string {
  const value = args.flags[name];
  if (value === undefined || value === '') throw usage(`Missing --${name}`);
  if (shape !== undefined && !shape.test(value)) throw usage(`--${name} looks wrong: '${value}'`);
  return value;
}

const HHMM = /^\d{1,2}:\d{2}$/;

function oneOf<T extends string>(value: string, allowed: readonly T[], what: string): T {
  if (!(allowed as readonly string[]).includes(value)) throw usage(`${what} must be ${allowed.join(' or ')}, got '${value}'`);
  return value as T;
}

function table(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return '  none';
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)));
  return rows.map((r) => r.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd()).join('\n');
}

function nameOf(app: App, id: string): string {
  try {
    return app.people.find(id).name;
  } catch {
    return id;
  }
}

function matchLine(m: Match): string {
  const who = m.attributedTo !== undefined ? ` (${m.attributedTo})` : '';
  return `${m.id}  ${m.offerId} <- ${m.requestId}  ${m.status}${who}`;
}

const addPerson: Handler = (app, args) => {
  const role = oneOf(need(args, 1, 'role'), ['driver', 'rider', 'both'], 'Role');
  const p = app.people.addPerson(need(args, 0, 'name'), role, need(args, 2, 'zone'));
  console.log(`Added ${p.id} ${p.name} (${p.role}, ${p.homeZone})`);
};

const offer: Handler = (app, args) => {
  const driver = app.people.find(need(args, 0, 'driver'));
  const via = args.flags.via;
  const o = app.matches.postOffer(driver, need(args, 1, 'date'), need(args, 2, 'fromZone'), {
    arriveBy: flag(args, 'arrive', HHMM),
    departsAfter: flag(args, 'departs', HHMM),
    seats: Number(flag(args, 'seats')),
    viaZones: via === undefined || via === '' ? [] : via.split(','),
  });
  console.log(`Posted ${o.id}: ${driver.name} from ${o.fromZone} on ${o.date}, ${o.departsAfter}-${o.arriveBy}, ${o.seats} seats`);
};

const request: Handler = (app, args) => {
  const rider = app.people.find(need(args, 0, 'rider'));
  const r = app.matches.postRequest(rider, need(args, 1, 'date'), need(args, 2, 'zone'), {
    arriveBy: flag(args, 'arrive', HHMM),
    earliest: flag(args, 'earliest', HHMM),
  });
  console.log(`Posted ${r.id}: ${rider.name} from ${r.fromZone} on ${r.date}, ${r.earliest}-${r.arriveBy}`);
};

const propose: Handler = (app, args) => {
  const { candidates, match } = app.matches.propose(need(args, 0, 'requestId'));
  const rows = candidates.map((c, i) => [
    String(i + 1), c.offer.id, nameOf(app, c.offer.driverId), c.reach, c.offer.arriveBy, c.driverScore.toFixed(2),
  ]);
  console.log(table([['#', 'offer', 'driver', 'reach', 'arrives', 'score'], ...rows]));
  console.log(`Proposed ${match.id}: ${match.requestId} rides with ${match.offerId}`);
};

const cancelOffer: Handler = (app, args) => {
  const id = need(args, 0, 'offerId');
  const cancelled = app.matches.cancelOffer(id);
  console.log(`Cancelled ${id} and ${cancelled.length} match(es): ${cancelled.map((m) => m.id).join(', ') || 'none'}`);
};

const board: Handler = (app, args) => {
  const b = app.matches.board(need(args, 0, 'date'));
  console.log(`Board for ${b.date} (now ${isoDate(app.clock())})`);
  const via = (o: Offer): string => (o.viaZones.length > 0 ? `via ${o.viaZones.join(',')}` : '');
  console.log(`\nOffers\n${table(b.offers.map((o) => [o.id, nameOf(app, o.driverId), o.fromZone, via(o), o.departsAfter, o.arriveBy, `${o.seats} seats`, o.status]))}`);
  console.log(`\nRequests\n${table(b.requests.map((r) => [r.id, nameOf(app, r.riderId), r.fromZone, r.earliest, r.arriveBy, r.status]))}`);
  console.log(`\nMatches\n${b.matches.length > 0 ? b.matches.map(matchLine).join('\n') : '  none'}`);
};

const reliability: Handler = (app) => {
  const rows = app.people.reliabilityBoard().map((r) => [nameOf(app, r.personId), String(r.completed), String(r.noShows), r.score.toFixed(2)]);
  console.log(table([['person', 'completed', 'no-shows', 'score'], ...rows]));
};

const COMMANDS: Readonly<Record<string, Handler>> = {
  people: (app) => console.log(table([['id', 'name', 'role', 'home'], ...app.people.all().map((p) => [p.id, p.name, p.role, p.homeZone])])),
  'add-person': addPerson,
  offer,
  request,
  propose,
  confirm: (app, args) => console.log(matchLine(app.matches.confirm(need(args, 0, 'matchId')))),
  complete: (app, args) => console.log(matchLine(app.matches.complete(need(args, 0, 'matchId')))),
  'no-show': (app, args) => {
    const party = oneOf(need(args, 1, 'driver|rider'), ['driver', 'rider'], 'Party');
    console.log(matchLine(app.matches.noShow(need(args, 0, 'matchId'), party)));
  },
  'cancel-offer': cancelOffer,
  'cancel-request': (app, args) => {
    const r = app.matches.cancelRequest(need(args, 0, 'requestId'));
    console.log(`Cancelled ${r.id} (${r.status})`);
  },
  board,
  reliability,
};

function mustExist(path: string, what: string): string {
  if (!existsSync(path)) throw new DomainError('USAGE', `${what} not found: ${path}`);
  return path;
}

function buildApp(args: Args): App {
  const store = new JsonFileStore(mustExist(resolve(args.flags.file ?? resolve(ROOT, 'data/sample.json')), 'Data file'));
  const zones = loadZones(mustExist(resolve(args.flags.zones ?? resolve(ROOT, 'data/zones.json')), 'Zones file'));
  const fixed = args.flags.now !== undefined ? parseIsoDateTime(args.flags.now) : undefined;
  const clock: Clock = fixed !== undefined ? () => fixed : () => new Date();
  const ids = sequentialIds(store);
  const people = new PeopleService(store, zones, ids);
  return { people, matches: new MatchService(store, people, zones, clock, ids), clock };
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  const handler = COMMANDS[args.command];
  if (handler === undefined) {
    console.log(USAGE);
    return 0;
  }
  try {
    handler(buildApp(args), args);
    return 0;
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
    console.error(`Error: ${e.message}`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
