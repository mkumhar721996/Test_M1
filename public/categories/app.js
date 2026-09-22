(function () {
  var state = { categories: [], uncategorisedCount: 0 };

  var emptyStateBlock = document.getElementById('empty-state-block');
  var listCard = document.getElementById('category-list-card');
  var listEl = document.getElementById('category-list');

  var createForm = document.getElementById('create-form');
  var createInput = document.getElementById('create-input');
  var createError = document.getElementById('create-error');
  var createSubmit = document.getElementById('create-submit');
  var createSaving = false;

  var simpleBackdrop = document.getElementById('delete-simple-backdrop');
  var simpleBody = document.getElementById('delete-simple-body');
  var simpleCancel = document.getElementById('delete-simple-cancel');
  var simpleConfirm = document.getElementById('delete-simple-confirm');

  var reassignBackdrop = document.getElementById('delete-reassign-backdrop');
  var reassignBody = document.getElementById('delete-reassign-body');
  var reassignTarget = document.getElementById('reassign-target');
  var reassignCancel = document.getElementById('delete-reassign-cancel');
  var reassignConfirm = document.getElementById('delete-reassign-confirm');
  var resolutionReassign = document.getElementById('resolution-reassign');
  var resolutionUncategorise = document.getElementById('resolution-uncategorise');

  var toast = document.getElementById('toast');
  var pendingDeleteId = null;

  function categoryLabel(count) {
    return count + ' expense' + (count === 1 ? '' : 's');
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toast.hidden = true;
    }, 3200);
  }

  function setButtonSaving(button, saving, label) {
    var spinner = button.querySelector('.spinner');
    var text = button.querySelector('span:last-child');
    button.disabled = saving;
    if (spinner) spinner.hidden = !saving;
    if (text && label) text.textContent = label;
  }

  function showFieldError(errorEl, message) {
    errorEl.querySelector('span:last-child').textContent = message;
    errorEl.hidden = false;
  }

  function parseJsonResponse(res) {
    return res.json().then(function (body) {
      return { ok: res.ok, status: res.status, body: body };
    });
  }

  function render() {
    if (state.categories.length === 0) {
      emptyStateBlock.hidden = false;
      listCard.hidden = true;
      return;
    }
    emptyStateBlock.hidden = true;
    listCard.hidden = false;

    listEl.innerHTML = '';
    state.categories.forEach(function (cat) {
      var li = document.createElement('li');
      li.className = 'card category-row';
      li.dataset.id = cat.id;
      li.innerHTML =
        '<span class="category-name"></span>' +
        '<span class="chip chip-count"></span>' +
        '<span class="category-row-actions">' +
        '<button class="btn btn-secondary btn-sm" type="button" data-action="rename">Rename</button>' +
        '<button class="btn btn-secondary btn-sm" type="button" data-action="delete">Delete</button>' +
        '</span>';
      li.querySelector('.category-name').textContent = cat.name;
      li.querySelector('.chip-count').textContent = categoryLabel(cat.expenseCount);
      listEl.appendChild(li);
    });

    var bucket = document.createElement('li');
    bucket.className = 'card category-row uncategorised';
    bucket.id = 'uncategorised-row';
    bucket.innerHTML =
      '<span class="category-name">Uncategorised</span>' +
      '<span class="chip chip-count" id="uncategorised-count"></span>';
    bucket.querySelector('#uncategorised-count').textContent = categoryLabel(state.uncategorisedCount);
    listEl.appendChild(bucket);
  }

  function loadCategories() {
    return fetch('/categories')
      .then(function (res) {
        return res.json();
      })
      .then(function (body) {
        state.categories = body.categories;
        state.uncategorisedCount = body.uncategorisedCount;
        render();
      });
  }

  // ---- Create ----
  createForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (createSaving) return; // AC12: ignore re-submission while saving
    var name = createInput.value.trim();
    createError.hidden = true;

    if (!name) {
      showFieldError(createError, 'Enter a category name.');
      return;
    }

    createSaving = true;
    setButtonSaving(createSubmit, true, 'Creating…'); // AC11

    fetch('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name }),
    })
      .then(parseJsonResponse)
      .then(function (result) {
        if (!result.ok) {
          showFieldError(createError, result.body.message); // AC3
          return;
        }
        createInput.value = '';
        showToast('"' + result.body.name + '" created.');
        return loadCategories();
      })
      .finally(function () {
        createSaving = false;
        setButtonSaving(createSubmit, false, 'Create category');
      });
  });

  // ---- Rename / Delete (event delegation) ----
  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var row = btn.closest('.category-row');
    var id = row.dataset.id;
    var cat = state.categories.find(function (c) {
      return c.id === id;
    });
    if (!cat) return;

    if (btn.dataset.action === 'rename') {
      startRename(row, cat);
    } else if (btn.dataset.action === 'delete') {
      startDelete(cat);
    }
  });

  function startRename(row, cat) {
    var currentName = cat.name;
    row.innerHTML =
      '<div class="rename-row">' +
      '<div class="field">' +
      '<label class="label visually-hidden" for="rename-input-' +
      cat.id +
      '">Category name</label>' +
      '<input class="input" id="rename-input-' +
      cat.id +
      '" type="text" />' +
      '<p class="field-error" hidden><span aria-hidden="true">⚠</span><span></span></p>' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" type="button" data-action="save-rename">' +
      '<span class="spinner" hidden aria-hidden="true"></span><span>Save</span>' +
      '</button>' +
      '<button class="btn btn-secondary btn-sm" type="button" data-action="cancel-rename">Cancel</button>' +
      '</div>';

    var input = row.querySelector('input');
    var errorEl = row.querySelector('.field-error');
    var saveBtn = row.querySelector('[data-action="save-rename"]');
    var cancelBtn = row.querySelector('[data-action="cancel-rename"]');
    var saving = false;

    input.value = currentName;
    input.focus();
    input.select();

    cancelBtn.addEventListener('click', function () {
      render();
    });

    function commit() {
      if (saving) return; // AC12
      var newName = input.value.trim();
      errorEl.hidden = true;

      if (!newName) {
        showFieldError(errorEl, 'Enter a category name.');
        return;
      }

      saving = true;
      setButtonSaving(saveBtn, true, 'Saving…'); // AC11

      fetch('/categories/' + cat.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
        .then(parseJsonResponse)
        .then(function (result) {
          if (!result.ok) {
            showFieldError(errorEl, result.body.message); // AC5
            return;
          }
          showToast('"' + currentName + '" renamed to "' + result.body.name + '".');
          return loadCategories();
        })
        .finally(function () {
          saving = false;
          setButtonSaving(saveBtn, false, 'Save');
        });
    }

    saveBtn.addEventListener('click', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        render();
      }
    });
  }

  // ---- Delete ----
  var deleteSaving = false;

  function startDelete(cat) {
    pendingDeleteId = cat.id;
    if (cat.expenseCount === 0) {
      simpleBody.textContent = 'Delete "' + cat.name + '"? This action can\'t be undone.'; // AC6
      simpleBackdrop.hidden = false;
      simpleCancel.focus();
    } else {
      openReassignDialog(cat); // AC7
    }
  }

  function openReassignDialog(cat) {
    reassignBody.textContent =
      cat.expenseCount +
      ' expense' +
      (cat.expenseCount === 1 ? '' : 's') +
      ' assigned to "' +
      cat.name +
      '". Choose what happens to them before this category is deleted.';

    reassignTarget.innerHTML = '';
    state.categories
      .filter(function (c) {
        return c.id !== cat.id;
      })
      .forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        reassignTarget.appendChild(opt);
      });
    resolutionReassign.checked = true;
    reassignBackdrop.hidden = false;
    reassignTarget.focus();
  }

  simpleCancel.addEventListener('click', function () {
    simpleBackdrop.hidden = true;
    pendingDeleteId = null;
  });

  simpleConfirm.addEventListener('click', function () {
    if (deleteSaving) return; // AC12
    var id = pendingDeleteId;
    var cat = state.categories.find(function (c) {
      return c.id === id;
    });
    if (!cat) return;

    deleteSaving = true;
    setButtonSaving(simpleConfirm, true, 'Deleting…'); // AC11

    fetch('/categories/' + id, { method: 'DELETE' })
      .then(parseJsonResponse)
      .then(function (result) {
        if (!result.ok) return;
        simpleBackdrop.hidden = true;
        pendingDeleteId = null;
        showToast('"' + cat.name + '" deleted.'); // AC6/AC10
        return loadCategories();
      })
      .finally(function () {
        deleteSaving = false;
        setButtonSaving(simpleConfirm, false, 'Delete category');
      });
  });

  reassignCancel.addEventListener('click', function () {
    reassignBackdrop.hidden = true;
    pendingDeleteId = null;
  });

  reassignConfirm.addEventListener('click', function () {
    if (deleteSaving) return; // AC12
    var id = pendingDeleteId;
    if (!id) return;
    var cat = state.categories.find(function (c) {
      return c.id === id;
    });
    if (!cat) return;
    var leaveUncategorised = resolutionUncategorise.checked;
    var payload = leaveUncategorised
      ? { resolution: 'uncategorise' } // AC9
      : { resolution: 'reassign', targetCategoryId: reassignTarget.value }; // AC8

    deleteSaving = true;
    setButtonSaving(reassignConfirm, true, 'Deleting…'); // AC11

    fetch('/categories/' + id, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(parseJsonResponse)
      .then(function (result) {
        if (!result.ok) return;
        var message;
        if (result.body.resolution === 'uncategorise') {
          message =
            result.body.uncategorisedCount +
            ' expense' +
            (result.body.uncategorisedCount === 1 ? '' : 's') +
            ' left uncategorised. "' +
            cat.name +
            '" deleted.';
        } else {
          var target = targetCategoryName(result.body.targetCategoryId);
          message =
            result.body.reassignedCount +
            ' expense' +
            (result.body.reassignedCount === 1 ? '' : 's') +
            ' moved to "' +
            target +
            '". "' +
            cat.name +
            '" deleted.';
        }
        reassignBackdrop.hidden = true; // AC10
        pendingDeleteId = null;
        showToast(message);
        return loadCategories();
      })
      .finally(function () {
        deleteSaving = false;
        setButtonSaving(reassignConfirm, false, 'Delete category');
      });
  });

  function targetCategoryName(targetId) {
    var option = Array.from(reassignTarget.options).find(function (o) {
      return o.value === targetId;
    });
    return option ? option.textContent : '';
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!simpleBackdrop.hidden) {
      simpleBackdrop.hidden = true;
      pendingDeleteId = null;
    }
    if (!reassignBackdrop.hidden) {
      reassignBackdrop.hidden = true;
      pendingDeleteId = null;
    }
  });

  loadCategories();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadCategories: loadCategories };
  }
})();
