const CATEGORIES = [
  {
    id: 'plumbing', name: 'Plumbing', icon: '🚰',
    description: 'Leaks, clogs, water heaters, and fixture repairs.',
    duration: 'Typically 45–90 min on site',
    fields: [
      { id: 'issueType', label: "What's the issue?", type: 'select', options: ['Leak', 'Clog', 'No hot water', 'Running toilet', 'Other'] },
      { id: 'fixture', label: 'Which fixture is affected?', type: 'select', options: ['Sink', 'Toilet', 'Water heater', 'Shower / tub', 'Other'] },
    ],
  },
  {
    id: 'electrical', name: 'Electrical', icon: '💡',
    description: 'Outlets, breakers, lighting, and wiring concerns.',
    duration: 'Typically 30–75 min on site',
    fields: [
      { id: 'issueType', label: "What's the issue?", type: 'select', options: ['Outlet not working', 'Breaker trips repeatedly', 'Flickering lights', 'Exposed wiring', 'Other'] },
      { id: 'room', label: 'Which room is affected?', type: 'text', placeholder: 'e.g. Kitchen, garage' },
    ],
  },
  {
    id: 'hvac', name: 'Heating & cooling', icon: '🌡️',
    description: 'Furnaces, air conditioners, heat pumps, and thermostats.',
    duration: 'Typically 60–120 min on site',
    fields: [
      { id: 'systemType', label: 'System type', type: 'select', options: ['Furnace', 'Central air conditioner', 'Heat pump', 'Mini-split', 'Other'] },
      { id: 'issueType', label: "What's happening?", type: 'select', options: ['Not heating', 'Not cooling', 'Strange noise', 'Thermostat issue', 'Other'] },
    ],
  },
  {
    id: 'appliance', name: 'Appliance repair', icon: '🧺',
    description: 'Refrigerators, washers, dryers, ovens, and dishwashers.',
    duration: 'Typically 45–90 min on site',
    fields: [
      { id: 'applianceType', label: 'Appliance type', type: 'select', options: ['Refrigerator', 'Washer', 'Dryer', 'Oven / range', 'Dishwasher', 'Other'] },
      { id: 'brand', label: 'Brand', type: 'text', placeholder: 'e.g. Whirlpool (optional)', optional: true },
    ],
  },
  {
    id: 'handyman', name: 'General handyman', icon: '🛠️',
    description: 'Drywall, furniture assembly, painting, and small repairs.',
    duration: 'Typically 30–90 min on site',
    fields: [
      { id: 'taskType', label: 'Task type', type: 'select', options: ['Drywall repair', 'Furniture assembly', 'Painting', 'Door / window repair', 'Other'] },
    ],
  },
];

const TIME_WINDOWS = [
  { id: 'morning', label: 'Morning (8am–11am)', staffed: true },
  { id: 'midday', label: 'Midday (11am–2pm)', staffed: true },
  { id: 'afternoon', label: 'Afternoon (2pm–5pm)', staffed: true },
  { id: 'evening', label: 'Evening (5pm–8pm)', staffed: false },
];

function listCatalog() { return { categories: CATEGORIES, timeWindows: TIME_WINDOWS }; }
function getCategory(id) { return CATEGORIES.find((c) => c.id === id) || null; }
function getTimeWindow(id) { return TIME_WINDOWS.find((w) => w.id === id) || null; }

module.exports = { listCatalog, getCategory, getTimeWindow };
