const roomTypes = new Map();

[
  { id: 'rt_standard_king', name: 'Standard King' },
  { id: 'rt_deluxe_suite', name: 'Deluxe Suite' },
  { id: 'rt_twin', name: 'Twin' },
].forEach((rt) => roomTypes.set(rt.id, rt));

function listRoomTypes() {
  return Array.from(roomTypes.values());
}

function getRoomType(id) {
  return roomTypes.get(id);
}

module.exports = { listRoomTypes, getRoomType };
