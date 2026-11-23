// Vehicles you can rent or buy (see docs/DESIGN.md, section 7.3). Prices are
// starting guesses. Rentals are a flat fee per day with no deposit; both
// rentals and purchases are delivered the next business day.
// The bigger vehicles in the design (cargo van, dump truck) come later.

export const VEHICLE_TYPES = {
  halfTon: { id: 'halfTon', name: 'Half-ton truck', seats: 2, rentPerDay: 20, price: 7500, color: '#3e6fa8' },
  pickup: { id: 'pickup', name: 'Pickup truck', seats: 3, rentPerDay: 35, price: 14000, color: '#b5532f' },
  crewCab: { id: 'crewCab', name: 'Crew-cab truck', seats: 4, rentPerDay: 50, price: 24000, color: '#3f8a5a' },
};

// Paint for the truck cabs on the map, so you can tell crews apart.
export const CAB_COLORS = ['#3e6fa8', '#b5532f', '#3f8a5a', '#8a5aa8'];
