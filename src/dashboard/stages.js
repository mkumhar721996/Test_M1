const STAGES = [
  { id: 'offer_accepted', name: 'Offer accepted', slaDays: 2 },
  { id: 'background_check', name: 'Background check', slaDays: 5 },
  { id: 'paperwork', name: 'Paperwork', slaDays: 3 },
  { id: 'it_provisioning', name: 'IT provisioning', slaDays: 2 },
  { id: 'orientation_scheduled', name: 'Orientation scheduled', slaDays: 2 },
];

const STALL_THRESHOLD_DAYS = 4;

module.exports = { STAGES, STALL_THRESHOLD_DAYS };
