import { Router } from 'express';
import multer from 'multer';
import { EmployeeRepository } from '../repository/employeeRepository';
import { registerEmployee } from '../services/employeeService';
import type { RegisterEmployeeInput, UploadedFileMeta } from '../types/employee';

const upload = multer({ storage: multer.memoryStorage() });

function toFileMeta(file: Express.Multer.File | undefined): UploadedFileMeta | undefined {
  if (!file) return undefined;
  return { originalName: file.originalname, mimeType: file.mimetype, size: file.size };
}

export function createEmployeesRouter(repo: EmployeeRepository): Router {
  const router = Router();

  router.post(
    '/',
    upload.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'idProof', maxCount: 1 },
    ]),
    (req, res, next) => {
      try {
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const body = req.body as Record<string, string>;

        const input: RegisterEmployeeInput = {
          firstName: body.firstName ?? '',
          lastName: body.lastName ?? '',
          email: body.email ?? '',
          mobile: body.mobile ?? '',
          department: body.department ?? '',
          designation: body.designation ?? '',
          joiningDate: body.joiningDate ?? '',
          dob: body.dob,
          photo: toFileMeta(files?.photo?.[0]),
          idProof: toFileMeta(files?.idProof?.[0]),
        };

        const employee = registerEmployee(input, repo);
        res.status(201).json(employee);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/', (_req, res) => {
    res.status(200).json(repo.list());
  });

  return router;
}
