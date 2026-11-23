// Job types are data, so new jobs never need engine changes
// (see docs/DESIGN.md, section 8.2 and the appendix catalog).
// `visual` picks how the work is drawn on the map (see render.js).
// `weight` is how often the type shows up among the daily offers.

export const JOB_TYPES = {
  mow: {
    id: 'mow',
    name: 'Mow lawn',
    verb: 'Mowing',
    baseMinutes: 60, // for one average worker
    minCrew: 1,
    lotKinds: ['house'],
    payRange: [40, 60],
    payStep: 5,
    weight: 5,
    visual: 'stripes',
  },
  hedges: {
    id: 'hedges',
    name: 'Trim hedges',
    verb: 'Trimming hedges',
    baseMinutes: 60,
    minCrew: 1,
    lotKinds: ['house'],
    payRange: [35, 55],
    payStep: 5,
    weight: 3,
    visual: 'hedges',
  },
  weeds: {
    id: 'weeds',
    name: 'Pull weeds',
    verb: 'Weeding',
    baseMinutes: 90,
    minCrew: 1,
    lotKinds: ['house'],
    payRange: [55, 80],
    payStep: 5,
    weight: 2,
    visual: 'weeds',
  },
};
