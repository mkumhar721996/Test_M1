// Server-side source of truth for staff roles. A real deployment would back
// this with an identity provider; the role a staffId maps to is never taken
// from the client.
const STAFF_DIRECTORY = {
  staff_front_desk_1: 'front_desk',
  staff_housekeeping_1: 'housekeeping',
};

function getRoleForStaffId(staffId) {
  return STAFF_DIRECTORY[staffId];
}

module.exports = { getRoleForStaffId };
