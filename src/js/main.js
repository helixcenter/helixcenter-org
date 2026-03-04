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

  /* ---- Within-page search filter (works on paginated speakers and roundtables pages) ---- */
  const searchInput = document.getElementById('search-input');
  const filterSelect = document.getElementById('filter-select');
  const topicFilter = document.getElementById('topic-filter');
  const listingGrid = document.querySelector('.listing-grid');
  const pagination = document.getElementById('rt-pagination');

  if (searchInput && listingGrid) {
    const filterItems = () => {
      const query = searchInput.value.toLowerCase().trim();
      const filterValue = filterSelect ? filterSelect.value : '';
      const topicValue = topicFilter ? topicFilter.value : '';
      const cards = listingGrid.querySelectorAll('[data-searchable]');
      const isFiltering = query || filterValue || topicValue;

      cards.forEach(card => {
        const text = card.dataset.searchable.toLowerCase();
        const category = card.dataset.category || '';
        const topics = card.dataset.topics || '';
        const matchesSearch = !query || text.includes(query);
        const matchesFilter = !filterValue || category === filterValue;
        const matchesTopic = !topicValue || topics.split(',').includes(topicValue);
        card.style.display = (matchesSearch && matchesFilter && matchesTopic) ? '' : 'none';
      });

      // Hide pagination when filtering
      if (pagination) {
        pagination.style.display = isFiltering ? 'none' : '';
      }
    };

    searchInput.addEventListener('input', filterItems);
    if (filterSelect) filterSelect.addEventListener('change', filterItems);
    if (topicFilter) topicFilter.addEventListener('change', filterItems);
  }

  /* ---- Donate amount selector ---- */
  const donateAmounts = document.querySelectorAll('.donate-amount');
  const customAmount = document.getElementById('custom-amount');
  const donateBtn = document.getElementById('donate-btn');

  if (donateAmounts.length && donateBtn) {
    donateAmounts.forEach(btn => {
      btn.addEventListener('click', () => {
        donateAmounts.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (customAmount) customAmount.value = '';
      });
    });

    if (customAmount) {
      customAmount.addEventListener('focus', () => {
        donateAmounts.forEach(b => b.classList.remove('active'));
      });
    }
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

  /* ---- Donate modal ---- */
  const donateModalOverlay = document.getElementById('donate-modal-overlay');
  if (donateModalOverlay) {
    const openDonateModal = (e) => {
      e.preventDefault();
      donateModalOverlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    };
    const closeDonateModal = () => {
      donateModalOverlay.classList.remove('show');
      document.body.style.overflow = '';
    };

    // Intercept donate button on donate page
    const donateBtnPage = document.getElementById('donate-btn');
    if (donateBtnPage) donateBtnPage.addEventListener('click', openDonateModal);

    // Intercept nav donate button on ALL pages
    document.querySelectorAll('.nav-donate').forEach(btn => {
      btn.addEventListener('click', openDonateModal);
    });
    // Also intercept mobile nav donate link
    document.querySelectorAll('#mobile-nav a[href="/donate/"]').forEach(btn => {
      btn.addEventListener('click', openDonateModal);
    });

    document.getElementById('donate-modal-close')?.addEventListener('click', closeDonateModal);
    donateModalOverlay.addEventListener('click', (e) => {
      if (e.target === donateModalOverlay) closeDonateModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && donateModalOverlay.classList.contains('show')) closeDonateModal();
    });
  }

});
