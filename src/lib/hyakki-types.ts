// Shared contract for /hyakki (百鬼夜行, SPEC v3): the API, the map and the flow all use these.
// Nothing here may carry a yokai's name or picture before 「会いにいく」 (SPEC 2.2, 8.2).

export type RegionKey = 'hokkaido-tohoku' | 'kanto' | 'chubu' | 'kinki' | 'chugoku-shikoku' | 'kyushu-okinawa';
export type Point = { lat: number; lon: number };
/** How well the place is known: a named town ("〇〇のあたり") or only the prefecture ("〇〇県のどこか"). */
export type PlaceLevel = 'place' | 'prefecture';

/** An undiscovered yokai. tier 3 is the thickest (most like the yokai met last).
 *  tease is one short catchy trait (about 14 characters, never the name) shown in a puffy cloud
 *  bubble over the mist to make the player curious; hint is the 1-2 sentences shown after a tap. */
export type Mist = Point & { id: string; level: PlaceLevel; tier: 1 | 2 | 3; hint: string; tease: string };

/** A yokai the player chose: everything may be shown. */
export type Card = Point & {
    id: string; name: string; prefecture: string; place: string | null; level: PlaceLevel;
    desc: string;
    /** One short catchy trait; shown on the buddy slips in place of a cut-off description. May be empty. */
    tease: string;
    /** The names the source record is filed under, as written (local names such as ガワタロ survive here). */
    recordName: string;
    /** Same-origin URLs served by /api/hyakki. */
    picture: string;
    /** The archive pages for the story and for the picture. */
    storyUrl: string; pictureSourceUrl: string;
};

/** A summoned yokai. While it runs it is a black silhouette; `id` and `picture` are for the line-up at the end,
 * where every yokai is shown and can be opened (the choosing is over by then, so nothing is given away).
 *  caller is the index (0-4) of the chosen yokai that called it; order is its place in the wave
 *  (0 = first to answer the call). */
export type Light = Point & {
    id: string; caller: number; order: number; silhouette: string; picture: string; region: RegionKey;
    /** How alike this yokai is to the one that called it; larger is nearer. It decides how close it stands.
     *  Twins score above 1, everything else between 0 and 1. */
    near: number;
    /** True when one of its records tells the same account as a record of its caller (see scripts/hyakki/build_twins.py).
     *  The others are distant relations: alike in kind or in parts, drawn smaller and fainter. */
    twin: boolean;
    /** For the closest twins of each caller: one sentence of the matching record, name masked. They answer aloud
     *  with it when called. Otherwise ''. */
    tease: string;
    /** With tease: the sentence of the caller's own record that this one matches, so that the two can be read together. */
    callerLine: string;
};

// GET  /api/hyakki?region=<RegionKey>&lat=<n>&lon=<n>      -> { buddies: Card[] }   (3 cards; the pin is never stored or logged)
// GET  /api/hyakki?silhouette=<mist id>                     -> image/png
// GET  /api/hyakki?picture=<token from Card.picture>        -> image/jpeg
// POST /api/hyakki { action: 'mists', region, chosen: string[], shown: string[] }
//        -> { mists: Mist[] }   chosen: ids met so far, oldest first (tiers follow the last one).
//           shown: mist ids on screen now; most of them come back with new tiers so the player
//           sees the same mists thicken or thin, and only a few are swapped.
// POST /api/hyakki { action: 'meet', id }                   -> { card: Card }
// POST /api/hyakki { action: 'summon', chosen: string[] }   -> { lights: Light[] }
//        lights are grouped per caller; within a caller they are in marching order
//        (nearest-neighbour from the caller's place), so the parade is: chosen[0], the ones it called,
//        chosen[1], the ones it called, ...
// Errors: { error: string } with 400 (bad request) or 503 (data unavailable).

export type HyakkiMapProps = {
    onTrace?: (kind: 'map_drag' | 'tease_shown' | 'echo_shown', ids?: string[]) => void;
    /** Camera target; the map animates between views. Always straight down, orthographic. */
    view: 'japan' | RegionKey;
    /** Screen 1: regions are tinted and tappable. */
    onRegion?: (region: RegionKey) => void;
    /** Screen 2: a tap on land in the current region. */
    onPick?: (point: Point) => void;
    /** The player's town. Kept in memory until the end (the parade goes there); never stored or logged. */
    pin?: Point | null;
    mists?: Mist[];
    onMist?: (id: string) => void;
    /** Mists the player has looked into: their clouds stay open so they can be compared. */
    peeked?: string[];
    /** Chosen yokai in order: small pictures on the map, joined by a line in this order. */
    figures?: Card[];
    /** Screen 8: a tap on a chosen yokai (its index) makes it call; `called` lists the ones that have. */
    onFigure?: (index: number) => void;
    called?: number[];
    /** Screen 10: the line-up on one map - every friend's home joined to the town in its caller's colour. */
    sheet?: boolean;
    /** Screen 8-10. 'wave': when a chosen yokai is in `called`, the ones it called light up where they live and run
     *  to it (figures[caller]), leaving a faint trail from home; onSummoned once all five have called.
     *  'on' shows them gathered. */
    lights?: Light[];
    summon?: 'off' | 'wave' | 'on';
    onSummoned?: () => void;
    /** Screen 9: all 100 parade from where they gathered to `pin` (the player's town) in about 10 s, each chosen
     *  yokai followed by the ones it called, running about (hopping, overtaking, darting out and back);
     *  they end circling the town, then onParaded. */
    parade?: boolean;
    onParaded?: () => void;
    /** prefers-reduced-motion: no wave and no walk; show the end state and fire the callbacks at once. */
    still?: boolean;
};
