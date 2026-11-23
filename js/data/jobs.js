// Job types are data, so new jobs never need engine changes
// (see docs/DESIGN.md, section 8.2 and the appendix catalog).
// Slice 2 has just one: mowing.

export const JOB_TYPES = {
  mow: {
    id: 'mow',
    name: 'Mow lawn',
    baseMinutes: 60, // for one average worker
    minCrew: 1,
    lotKinds: ['house'],
    payRange: [40, 60],
    payStep: 5,
    visual: 'stripes',
  },
};
