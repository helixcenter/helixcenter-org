document.addEventListener('DOMContentLoaded', () => {

  /* ---- Intersection Observer for fade-in animations ---- */
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  /* ---- Nav scroll behavior ---- */
  const nav = document.getElementById('main-nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 80) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  /* ---- Smooth scroll for anchor links ---- */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (href === '#') return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        const offset = 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  /* ---- Animate numbers on scroll ---- */
  const numberObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      if (el.dataset.animated) return;

      const text = el.textContent;
      const num = parseInt(text.replace(/[^0-9]/g, ''));
      if (isNaN(num) || num === 0) return;

      el.dataset.animated = 'true';
      const prefix = text.match(/^[^0-9]*/)?.[0] || '';
      const suffix = text.match(/[^0-9]*$/)?.[0] || '';
      const duration = 1200;
      const start = performance.now();

      const animate = (now) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = prefix + Math.round(num * eased).toLocaleString() + suffix;
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
      numberObserver.unobserve(el);
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.stat-number, .impact-number, .domain-count').forEach(el => {
    numberObserver.observe(el);
  });

  /* ---- Stat card modals ---- */
  const modalOverlay = document.getElementById('stat-modal-overlay');
  const modalContent = document.getElementById('stat-modal-content');
  if (modalOverlay && modalContent) {
    // Open modal on stat card click
    document.querySelectorAll('[data-stat-modal]').forEach(card => {
      card.addEventListener('click', () => {
        const key = card.dataset.statModal;
        const tmpl = document.getElementById('modal-' + key);
        if (tmpl) {
          modalContent.innerHTML = tmpl.innerHTML;
          modalOverlay.classList.add('show');
          document.body.style.overflow = 'hidden';
        }
      });
    });

    // Close modal
    const closeModal = () => {
      modalOverlay.classList.remove('show');
      document.body.style.overflow = '';
    };
    modalOverlay.querySelector('.stat-modal-close')?.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('show')) closeModal();
    });
  }

  /* ---- Register modal ---- */
  const registerBtn = document.getElementById('register-btn');
  const registerOverlay = document.getElementById('register-modal-overlay');
  if (registerBtn && registerOverlay) {
    registerBtn.addEventListener('click', () => {
      registerOverlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    });
    const closeRegister = () => {
      registerOverlay.classList.remove('show');
      document.body.style.overflow = '';
    };
    registerOverlay.querySelector('.register-modal-close')?.addEventListener('click', closeRegister);
    registerOverlay.addEventListener('click', (e) => {
      if (e.target === registerOverlay) closeRegister();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && registerOverlay.classList.contains('show')) closeRegister();
    });
  }

  /* ---- Close mobile nav on escape ---- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('mobile-nav')?.classList.remove('show');
    }
  });

  /* ---- Mobile nav toggle ---- */
  const hamburger = document.querySelector('.nav-hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const mobileNav = document.getElementById('mobile-nav');
      if (mobileNav) {
        mobileNav.classList.toggle('show');
        hamburger.setAttribute('aria-expanded',
          hamburger.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
      }
    });
  }

  /* ---- Close mobile nav on link click ---- */
  document.querySelectorAll('#mobile-nav a').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('mobile-nav')?.classList.remove('show');
    });
  });

  /* ---- Speaker/Roundtable search filter ---- */
  const searchInput = document.getElementById('search-input');
  const filterSelect = document.getElementById('filter-select');
  const listingGrid = document.querySelector('.listing-grid');

  if (searchInput && listingGrid) {
    const filterItems = () => {
      const query = searchInput.value.toLowerCase().trim();
      const filterValue = filterSelect ? filterSelect.value : '';
      const cards = listingGrid.querySelectorAll('[data-searchable]');
      const isSearching = query || filterValue;

      // When searching/filtering on speakers page, disable pagination to show all matches
      if (speakersPagination && isSearching) {
        if (speakersPagination) speakersPagination.style.display = 'none';
      }

      cards.forEach(card => {
        const text = card.dataset.searchable.toLowerCase();
        const category = card.dataset.category || '';
        const matchesSearch = !query || text.includes(query);
        const matchesFilter = !filterValue || category === filterValue;
        card.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
      });

      // Hide empty domain group headers/grids
      listingGrid.querySelectorAll('.domain-group-grid').forEach(grid => {
        const visible = grid.querySelectorAll('[data-searchable]:not([style*="display: none"])');
        const header = grid.previousElementSibling;
        const empty = visible.length === 0;
        grid.style.display = empty ? 'none' : '';
        if (header && header.classList.contains('domain-group-header')) {
          header.style.display = empty ? 'none' : '';
        }
      });

      // Re-enable pagination when search is cleared (if in A-Z mode)
      if (speakersPagination && !isSearching && speakersPaginationActive) {
        showSpeakersPage(1);
      }
    };

    searchInput.addEventListener('input', filterItems);
    if (filterSelect) filterSelect.addEventListener('change', filterItems);
  }

  /* ---- Sort toggle for speakers ---- */
  const sortToggle = document.getElementById('sort-toggle');
  const domainJump = document.getElementById('domain-jump');
  const alphaBtn = sortToggle ? sortToggle.querySelector('[data-sort="alpha"]') : null;
  const speakersPagination = document.getElementById('speakers-pagination');
  const SPEAKERS_PER_PAGE = 48;
  let speakersCurrentPage = 1;
  let speakersPaginationActive = true;

  // Extract last name from full name for sorting
  function lastNameKey(fullName) {
    const parts = (fullName || '').trim().split(/\s+/);
    const last = parts[parts.length - 1] || '';
    const first = parts[0] || '';
    return last.toLowerCase() + ', ' + first.toLowerCase();
  }

  // Remove domain headers and restore flat grid
  function clearDomainView() {
    if (!listingGrid) return;
    listingGrid.querySelectorAll('.domain-group-header').forEach(h => h.remove());
    listingGrid.querySelectorAll('.domain-group-grid').forEach(g => {
      while (g.firstChild) listingGrid.appendChild(g.firstChild);
      g.remove();
    });
    listingGrid.style.display = '';
  }

  // Show a specific page of speaker cards (A-Z view only)
  function showSpeakersPage(page) {
    if (!listingGrid || !speakersPagination) return;
    const cards = [...listingGrid.querySelectorAll('[data-sort-name]')];
    // Filter to only visible cards (respects search/filter)
    const visibleCards = cards.filter(c => c.style.display !== 'none' || !c.style.display);
    const totalPages = Math.ceil(visibleCards.length / SPEAKERS_PER_PAGE);
    page = Math.max(1, Math.min(page, totalPages));
    speakersCurrentPage = page;

    const start = (page - 1) * SPEAKERS_PER_PAGE;
    const end = start + SPEAKERS_PER_PAGE;
    cards.forEach((card, i) => {
      card.style.display = (i >= start && i < end) ? '' : 'none';
    });

    // Build pagination UI
    let html = '';
    if (totalPages > 1) {
      if (page > 1) html += '<a href="#" data-page="' + (page - 1) + '">&laquo; Prev</a>';
      const startPage = Math.max(1, page - 3);
      const endPage = Math.min(totalPages, page + 3);
      if (startPage > 1) { html += '<a href="#" data-page="1">1</a>'; if (startPage > 2) html += '<span class="pagination-ellipsis">&hellip;</span>'; }
      for (let i = startPage; i <= endPage; i++) {
        html += i === page ? '<span class="current">' + i + '</span>' : '<a href="#" data-page="' + i + '">' + i + '</a>';
      }
      if (endPage < totalPages) { if (endPage < totalPages - 1) html += '<span class="pagination-ellipsis">&hellip;</span>'; html += '<a href="#" data-page="' + totalPages + '">' + totalPages + '</a>'; }
      if (page < totalPages) html += '<a href="#" data-page="' + (page + 1) + '">Next &raquo;</a>';
    }
    speakersPagination.innerHTML = html;
    speakersPagination.style.display = totalPages > 1 ? '' : 'none';

    // Bind page clicks
    speakersPagination.querySelectorAll('a[data-page]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        showSpeakersPage(parseInt(a.dataset.page));
        const grid = document.getElementById('speakers-grid');
        if (grid) { const top = grid.getBoundingClientRect().top + window.scrollY - 100; window.scrollTo({ top, behavior: 'smooth' }); }
      });
    });
  }

  // Disable pagination (show all cards)
  function disableSpeakersPagination() {
    speakersPaginationActive = false;
    if (speakersPagination) speakersPagination.style.display = 'none';
    if (listingGrid) {
      listingGrid.querySelectorAll('[data-sort-name]').forEach(c => { c.style.display = ''; });
    }
  }

  // Enable pagination (A-Z mode)
  function enableSpeakersPagination() {
    speakersPaginationActive = true;
    showSpeakersPage(1);
  }

  // Build domain-grouped view, return map of domain -> header element
  function buildDomainView() {
    if (!listingGrid) return {};
    clearDomainView();

    const cards = [...listingGrid.querySelectorAll('[data-sort-name]')];
    cards.sort((a, b) => {
      const domA = (a.dataset.category || 'ZZZ').toLowerCase();
      const domB = (b.dataset.category || 'ZZZ').toLowerCase();
      if (domA !== domB) return domA.localeCompare(domB);
      return lastNameKey(a.dataset.sortName).localeCompare(lastNameKey(b.dataset.sortName));
    });

    listingGrid.style.display = 'block';
    const headers = {};
    let currentDomain = null;
    let groupGrid = null;

    cards.forEach(card => {
      card.style.display = '';
      const domain = card.dataset.category || 'Other/Interdisciplinary';
      if (domain !== currentDomain) {
        currentDomain = domain;
        const count = cards.filter(c => (c.dataset.category || 'Other/Interdisciplinary') === domain).length;
        const slug = domain.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const header = document.createElement('div');
        header.className = 'domain-group-header';
        header.id = 'domain-' + slug;
        header.innerHTML = '<h2>' + domain + '</h2><span class="domain-group-count">' + count + ' speaker' + (count !== 1 ? 's' : '') + '</span>';
        listingGrid.appendChild(header);
        headers[domain] = header;
        groupGrid = document.createElement('div');
        groupGrid.className = 'domain-group-grid';
        listingGrid.appendChild(groupGrid);
      }
      groupGrid.appendChild(card);
    });

    return headers;
  }

  if (sortToggle && listingGrid) {
    // Initialize A-Z pagination on page load
    if (speakersPagination) {
      const cards = [...listingGrid.querySelectorAll('[data-sort-name]')];
      cards.sort((a, b) => (a.dataset.sortName || '').localeCompare(b.dataset.sortName || ''));
      cards.forEach(card => listingGrid.appendChild(card));
      showSpeakersPage(1);
    }

    // A-Z button click
    if (alphaBtn) {
      alphaBtn.addEventListener('click', () => {
        alphaBtn.classList.add('active');
        if (domainJump) { domainJump.classList.remove('active'); domainJump.value = ''; }
        clearDomainView();
        const cards = [...listingGrid.querySelectorAll('[data-sort-name]')];
        cards.sort((a, b) => (a.dataset.sortName || '').localeCompare(b.dataset.sortName || ''));
        cards.forEach(card => listingGrid.appendChild(card));
        enableSpeakersPagination();
      });
    }

    // Domain dropdown change
    if (domainJump) {
      domainJump.addEventListener('change', () => {
        const selected = domainJump.value;
        if (alphaBtn) alphaBtn.classList.remove('active');
        domainJump.classList.add('active');
        disableSpeakersPagination();

        const headers = buildDomainView();

        if (selected && headers[selected]) {
          const offset = 100;
          const top = headers[selected].getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    }
  }

  /* ---- Media page video search/filter ---- */
  const videoSearch = document.getElementById('video-search');
  const videoYearFilter = document.getElementById('video-year-filter');
  const videoLibrary = document.getElementById('video-library');

  if (videoSearch && videoLibrary) {
    const filterVideos = () => {
      const query = videoSearch.value.toLowerCase().trim();
      const year = videoYearFilter ? videoYearFilter.value : '';
      videoLibrary.querySelectorAll('.video-library-card').forEach(card => {
        const text = card.dataset.searchable || '';
        const cardYear = card.dataset.year || '';
        const matchesSearch = !query || text.includes(query);
        const matchesYear = !year || cardYear === year;
        card.style.display = (matchesSearch && matchesYear) ? '' : 'none';
      });
    };
    videoSearch.addEventListener('input', filterVideos);
    if (videoYearFilter) videoYearFilter.addEventListener('change', filterVideos);
  }

  /* ---- Footer newsletter subscription (Netlify Forms) ---- */
  const subForm = document.getElementById('footer-subscribe-form');
  const subThankYou = document.getElementById('subscribe-thank-you');

  if (subForm && subThankYou) {
    subForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = subForm.querySelector('button');
      btn.textContent = 'Signing up...';
      btn.disabled = true;

      const formData = new URLSearchParams(new FormData(subForm)).toString();

      fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      })
        .then(res => {
          if (res.ok) {
            subForm.style.display = 'none';
            subThankYou.style.display = 'block';
          } else {
            btn.textContent = 'Try again';
            btn.disabled = false;
          }
        })
        .catch(() => {
          btn.textContent = 'Try again';
          btn.disabled = false;
        });
    });
  }

});
