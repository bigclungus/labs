// sprites.ts — Sprite winner polling for NPC rendering
// Mirrors V1 grazing.html SPRITE_SLUG_MAP + fetchSpriteWinners logic

// Maps NPC slug → human-readable display name
export const NPC_DISPLAY_NAMES: Record<string, string> = {
  'chairman':          'Ibrahim the Immovable',
  'critic':            'Pippi the Pitiless',
  'architect':         'Kwame the Constructor',
  'ux':                'Yuki the Yielding',
  'designer':          'Vesper the Vivid',
  'galactus':          'Galactus',
  'hume':              'David Hume',
  'otto':              'Otto Atreides',
  'pm':                "Chud O'Bikeshedder",
  'spengler':          'Spengler the Doomed',
  'trump':             'Punished Trump',
  'uncle-bob':         'Uncle Bob',
  'bloodfeast':        'Holden Bloodfeast',
  'adelbert':          'Adelbert Hominem',
  'jhaddu':            'Jhaddu',
  'morgan':            'Morgan (they/them)',
  'the-kid':           'The Kid',
  'the-correspondent': 'The Correspondent',
  'chaz':              'Chaz the Destroyer',
};

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

// All expected sprite function names, derived from SPRITE_SLUG_MAP ids × variants A/B/C
const SPRITE_FUNCTION_NAMES: string[] = Object.values(SPRITE_SLUG_MAP).flatMap(({ id }) => [
  `drawSprite_${id}_A`,
  `drawSprite_${id}_B`,
  `drawSprite_${id}_C`,
]);

/**
 * Validates that all expected sprite functions are present on window.
 * Called at startup (with a delay to allow sprite scripts to load).
 * Missing sprites fall back to colored boxes — this is expected if scripts
 * haven't loaded yet, but a persistent warning indicates a load failure.
 */
export function validateSprites(): void {
  const missing: string[] = [];
  for (const name of SPRITE_FUNCTION_NAMES) {
    if (typeof (window as any)[name] !== 'function') {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    console.warn('[sprites] missing sprite functions:', missing);
    // Missing sprites will fall back to colored boxes — expected if scripts haven't loaded yet
  } else {
    console.log('[sprites] all', SPRITE_FUNCTION_NAMES.length, 'sprite functions validated OK');
  }
}
