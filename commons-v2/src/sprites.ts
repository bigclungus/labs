// sprites.ts — Sprite winner polling for NPC rendering
// Mirrors V1 grazing.html SPRITE_SLUG_MAP + fetchSpriteWinners logic

// Maps NPC name (server slug) → { id: sprite function ID, pollSlug: poll slug }
const SPRITE_SLUG_MAP: Record<string, { id: string; pollSlug: string }> = {
  'chairman':   { id: 'chairman',   pollSlug: 'chairman'  },
  'critic':     { id: 'critic',     pollSlug: 'critic'    },
  'architect':  { id: 'architect',  pollSlug: 'architect' },
  'ux':         { id: 'ux',         pollSlug: 'ux'        },
  'designer':   { id: 'designer',   pollSlug: 'designer'  },
  'galactus':   { id: 'galactus',   pollSlug: 'galactus'  },
  'hume':       { id: 'hume',       pollSlug: 'hume'      },
  'otto':       { id: 'otto',       pollSlug: 'otto'      },
  'pm':         { id: 'pm',         pollSlug: 'pm'        },
  'spengler':   { id: 'spengler',   pollSlug: 'spengler'  },
  'trump':      { id: 'trump',      pollSlug: 'trump'     },
  'uncle-bob':  { id: 'unclebob',   pollSlug: 'uncle-bob' },
  'bloodfeast': { id: 'bloodfeast', pollSlug: 'bloodfeast'},
  'adelbert':   { id: 'adelbert',   pollSlug: 'adelbert'  },
  'jhaddu':     { id: 'jhaddu',     pollSlug: 'jhaddu'    },
  'morgan':     { id: 'morgan',     pollSlug: 'morgan'    },
  'the-kid':    { id: 'the_kid',    pollSlug: 'the-kid'   },
};

// Current winners: npcName → "A"|"B"|"C"
const SPRITE_WINNERS: Record<string, string> = {};

function fetchSpriteWinners(): void {
  const slugs = Object.keys(SPRITE_SLUG_MAP);
  for (const name of slugs) {
    const info = SPRITE_SLUG_MAP[name];
    fetch('/api/vote/sprite-' + encodeURIComponent(info.pollSlug))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.winner) {
          SPRITE_WINNERS[name] = d.winner;
        }
      })
      .catch(() => {});
  }
}

// Initial fetch + poll every 30s
fetchSpriteWinners();
setInterval(fetchSpriteWinners, 30000);

/**
 * Returns the winning sprite variant ("A"|"B"|"C") for a given NPC name slug,
 * or null if no winner is known yet or the NPC has no sprite poll.
 */
export function getWinner(npcName: string): string | null {
  return SPRITE_WINNERS[npcName] ?? null;
}

/**
 * Returns the sprite function ID for a given NPC name slug,
 * or null if the NPC has no sprite entry.
 */
export function getSpriteId(npcName: string): string | null {
  return SPRITE_SLUG_MAP[npcName]?.id ?? null;
}
