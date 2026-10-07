const express = require('express');
const { DefectValidationError, createDefect, getDefect, listDefects } = require('./store');
const { requireAuthenticatedUser } = require('./auth');
const projectsStore = require('../projects/store');

const router = express.Router();
const PAGE_SIZE = 5;

function isVisibleTo(defect, memberProjectIds) {
  return !defect.projectId || memberProjectIds.includes(defect.projectId);
}

function present(defect) {
  const project = defect.projectId ? projectsStore.getProject(defect.projectId) : null;
  return { ...defect, projectName: project ? project.name : '' };
}

router.get('/', requireAuthenticatedUser, (req, res, next) => {
  try {
    const memberProjectIds = projectsStore.listProjectIdsForUser(req.userId);
    const visible = listDefects().filter((d) => isVisibleTo(d, memberProjectIds));
    const totalItems = visible.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const requested = Number.parseInt(req.query.page, 10);
    const page = Math.min(Math.max(Number.isNaN(requested) ? 1 : requested, 1), totalPages);
    const items = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(present);
    res.status(200).json({ items, page, pageSize: PAGE_SIZE, totalItems, totalPages });
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    res.status(201).json(present(createDefect(req.body)));
  } catch (err) {
    if (err instanceof DefectValidationError) {
      return res.status(400).json({ error: 'validation_error', fields: err.fields });
    }
    next(err);
  }
});

router.get('/:id', requireAuthenticatedUser, (req, res, next) => {
  try {
    const defect = getDefect(req.params.id);
    const memberProjectIds = projectsStore.listProjectIdsForUser(req.userId);
    // Missing and non-member defects share this single branch so they are indistinguishable.
    if (!defect || !isVisibleTo(defect, memberProjectIds)) {
      return res.status(404).json({ error: 'defect not found' });
    }
    res.status(200).json(present(defect));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
