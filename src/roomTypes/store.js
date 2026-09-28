const ROOM_TYPES = [
  { id: 'rt-queen', name: 'Standard Queen', baseRate: 120 },
  { id: 'rt-king', name: 'Deluxe King', baseRate: 150 },
  { id: 'rt-suite', name: 'Suite', baseRate: 240 },
  { id: 'rt-twin', name: 'Twin', baseRate: 110 },
];

function listRoomTypes() {
  return ROOM_TYPES.map((rt) => ({ ...rt }));
}

function getRoomType(id) {
  return ROOM_TYPES.find((rt) => rt.id === id);
}

module.exports = { listRoomTypes, getRoomType };
