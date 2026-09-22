import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

function validFields() {
  return {
    firstName: 'Meera',
    lastName: 'Nair',
    email: 'meera.nair@acmecorp.com',
    mobile: '9845123670',
    department: 'IT',
    designation: 'IT Support Engineer',
    joiningDate: '2026-09-21',
  };
}

describe('POST /api/employees', () => {
  it('AC1: creates a new employee record with an auto-generated Employee ID', async () => {
    const app = createApp();
    const res = await request(app).post('/api/employees').field(validFields());
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^EMP\d{5}$/);
  });

  it('AC4: rejects a registration whose email is already on file', async () => {
    const app = createApp();
    await request(app)
      .post('/api/employees')
      .field({ ...validFields(), email: 'john@co.com' });
    const res = await request(app)
      .post('/api/employees')
      .field({ ...validFields(), email: 'john@co.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DUPLICATE_EMAIL');
    expect(res.body.message).toMatch(/already on file/i);
  });

  it('AC5: creates the record when optional fields (dob/photo/idProof) are omitted', async () => {
    const app = createApp();
    const res = await request(app).post('/api/employees').field(validFields());
    expect(res.status).toBe(201);
    expect(res.body.dob).toBeNull();
    expect(res.body.photo).toBeNull();
    expect(res.body.idProof).toBeNull();
  });

  it('AC6: persists and returns optional fields when provided', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/employees')
      .field({ ...validFields(), dob: '1996-04-12' })
      .attach('photo', Buffer.from('fake'), { filename: 'p.jpg', contentType: 'image/jpeg' })
      .attach('idProof', Buffer.from('fake'), { filename: 'id.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.dob).toBe('1996-04-12');
    expect(res.body.photo.originalName).toBe('p.jpg');
    expect(res.body.idProof.originalName).toBe('id.pdf');
  });

  it('AC7: returns a 400 with a field error when a required field is blank', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/employees')
      .field({ ...validFields(), firstName: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.fieldErrors.firstName).toBe('First name is required.');
  });

  it('AC9/AC10 edge case: omitting the optional photo/idProof entirely does not trigger a file error', async () => {
    const app = createApp();
    const res = await request(app).post('/api/employees').field(validFields());
    expect(res.status).toBe(201);
    expect(res.body.photo).toBeNull();
    expect(res.body.idProof).toBeNull();
  });

  it('security: rejects an upload exceeding the hard multer size cap without a 500 or unbounded memory read', async () => {
    const app = createApp();
    const oversized = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await request(app)
      .post('/api/employees')
      .field(validFields())
      .attach('idProof', oversized, { filename: 'huge.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('AC9: rejects an invalid photo file type at the HTTP layer', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/employees')
      .field(validFields())
      .attach('photo', Buffer.from('fake'), { filename: 'scan.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.photo).toMatch(/must be a JPG or PNG file/);
  });

  it('AC12: two concurrent valid submissions with different emails each get a distinct sequential ID', async () => {
    const app = createApp();
    const [r1, r2] = await Promise.all([
      request(app)
        .post('/api/employees')
        .field({ ...validFields(), email: 'a@x.com' }),
      request(app)
        .post('/api/employees')
        .field({ ...validFields(), email: 'b@x.com' }),
    ]);
    const ids = [r1.body.id, r2.body.id].sort();
    expect(ids).toEqual(['EMP00001', 'EMP00002']);
  });

  it('AC4/AC12 edge case: two concurrent submissions with the SAME new email yield exactly one success and one duplicate rejection', async () => {
    const app = createApp();
    const [r1, r2] = await Promise.all([
      request(app)
        .post('/api/employees')
        .field({ ...validFields(), email: 'race@x.com' }),
      request(app)
        .post('/api/employees')
        .field({ ...validFields(), email: 'race@x.com' }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});

describe('GET /api/employees', () => {
  it('returns records in creation order', async () => {
    const app = createApp();
    await request(app)
      .post('/api/employees')
      .field({ ...validFields(), email: 'a@x.com' });
    await request(app)
      .post('/api/employees')
      .field({ ...validFields(), email: 'b@x.com' });
    const res = await request(app).get('/api/employees');
    expect(res.body.map((e: { email: string }) => e.email)).toEqual(['a@x.com', 'b@x.com']);
  });
});
