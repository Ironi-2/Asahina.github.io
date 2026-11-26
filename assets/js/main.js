// Theme Toggle
(function() {
  const themeToggle = document.getElementById('theme-toggle');
  const html = document.documentElement;

  function getTheme() {
    return html.getAttribute('data-theme') || 'light';
  }

  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', theme === 'dark');
    }
  }

  function toggleTheme() {
    const current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  // Initialize theme
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
  setTheme(initialTheme);

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  // Toggle button click
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
})();

// Mobile Navigation
(function() {
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.getElementById('nav-menu');

  if (!navToggle || !navMenu) return;

  function toggleMenu() {
    const isOpen = navMenu.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }

  navToggle.addEventListener('click', toggleMenu);

  // Close menu when clicking a link
  navMenu.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
      navMenu.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });

  // Close menu on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('open')) {
      navMenu.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      navToggle.focus();
    }
  });
})();

// 视觉能力检测：仅桌面精确指针启用跟随/视差/倾斜等装饰动画
(function() {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (finePointer && !reduceMotion) {
    document.documentElement.classList.add('enable-fx');
  }
})();

// A1: 鼠标跟随光晕（仅桌面、尊重减少动态偏好）
(function() {
  if (!document.documentElement.classList.contains('enable-fx')) return;

  const root = document.documentElement;
  let rafId = 0;
  let pending = null;

  function onPointerMove(e) {
    pending = { x: e.clientX, y: e.clientY };
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!pending) return;
      root.style.setProperty('--mouse-x', `${pending.x}px`);
      root.style.setProperty('--mouse-y', `${pending.y}px`);
      root.classList.add('pointer-active');
    });
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', () => root.classList.remove('pointer-active'));
  window.addEventListener('blur', () => root.classList.remove('pointer-active'));
})();

// A2: Hero 交互式星点背景（仅桌面、尊重减少动态偏好）
(function() {
  if (!document.documentElement.classList.contains('enable-fx')) return;
  const canvas = document.getElementById('hero-particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const hero = canvas.closest('.hero');
  if (!hero) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let pointer = { x: -9999, y: -9999, active: false };
  let running = true;

  const style = getComputedStyle(document.documentElement);
  function themeColor() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    return (style.getPropertyValue(theme === 'dark' ? '--color-secondary' : '--color-primary') || '#6366f1').trim();
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '').trim();
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const num = parseInt(full, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(90, Math.max(35, Math.floor((width * height) / 18000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.6 + 0.6,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(Math.random() * 0.18 + 0.04)
    }));
  }

  function draw() {
    if (!running) return;
    ctx.clearRect(0, 0, width, height);
    const { r, g, b } = hexToRgb(style.getPropertyValue('--color-primary').trim() || '#6366f1');

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (pointer.active) {
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < 110) {
          const f = (1 - dist / 110) * 0.6;
          p.x -= (dx / dist) * f;
          p.y -= (dy / dist) * f;
        }
      }

      if (p.y < -5) { p.y = height + 5; p.x = Math.random() * width; }
      if (p.x < -5) p.x = width + 5;
      if (p.x > width + 5) p.x = -5;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }

  function onMove(e) {
    const rect = hero.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
    pointer.active = pointer.x >= 0 && pointer.x <= width && pointer.y >= 0 && pointer.y <= height;
    hero.style.setProperty('--hero-parallax-x', `${(e.clientX - rect.left - width / 2) * 0.012}px`);
    hero.style.setProperty('--hero-parallax-y', `${(e.clientY - rect.top - height / 2) * 0.012}px`);
  }

  function onLeave() {
    pointer.active = false;
    hero.style.setProperty('--hero-parallax-x', '0px');
    hero.style.setProperty('--hero-parallax-y', '0px');
  }

  resize();
  draw();
  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerleave', onLeave);

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resize(); });
  }, { passive: true });

  // 首屏滚出视口后暂停动画，避免长页面无谓耗电
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      running = entries[0].isIntersecting;
      if (running) requestAnimationFrame(draw);
    }, { threshold: 0 }).observe(hero);
  }
})();

// A3: 文章卡片 3D 倾斜 + 边缘高光（仅桌面、尊重减少动态偏好）
(function() {
  if (!document.documentElement.classList.contains('enable-fx')) return;
  const cards = document.querySelectorAll('.post-card');
  if (!cards.length) return;

  cards.forEach(card => {
    const onMove = (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      card.style.setProperty('--tilt-x', `${(0.5 - py) * 6}deg`);
      card.style.setProperty('--tilt-y', `${(px - 0.5) * 6}deg`);
      card.style.setProperty('--glow-x', `${px * 100}%`);
      card.style.setProperty('--glow-y', `${py * 100}%`);
    };
    const onLeave = () => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    };
    card.addEventListener('pointermove', onMove, { passive: true });
    card.addEventListener('pointerleave', onLeave);
  });
})();

// B1: 阅读进度条（渐变 + 模糊，平滑化）
(function() {
  const progressBar = document.getElementById('reading-progress') || (function() {
    const bar = document.createElement('div');
    bar.id = 'reading-progress';
    bar.className = 'reading-progress';
    document.body.appendChild(bar);
    return bar;
  })();

  let target = 0;
  let current = 0;
  let rafId = 0;

  function update() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    target = docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0;
  }

  function animate() {
    const diff = target - current;
    if (Math.abs(diff) > 0.0005) {
      current += diff * 0.2;
      progressBar.style.transform = `scaleX(${current})`;
      rafId = requestAnimationFrame(animate);
    } else {
      current = target;
      progressBar.style.transform = `scaleX(${current})`;
      rafId = 0;
    }
  }

  function onScroll() {
    update();
    if (!rafId) rafId = requestAnimationFrame(animate);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
})();

// B2: 锚点定位高亮（平滑滚动 + 目标区块短暂发光）
(function() {
  const header = document.querySelector('.site-header');
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      const headerHeight = header?.offsetHeight || 0;
      const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
      window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
      target.focus({ preventScroll: true });

      target.classList.remove('anchor-flash');
      // 强制重排，保证连续点击同一锚点时动画可重新播放
      void target.offsetWidth;
      target.classList.add('anchor-flash');
      window.setTimeout(() => target.classList.remove('anchor-flash'), 1400);
    });
  });
})();

// 滚动渐入动画（保留原有行为，但不再用内联样式覆盖 CSS）
(function() {
  const observerOptions = {
    root: null,
    // 只留 5% 的触发余量：标题刚进入视口就显示，
    // 避免首屏底部出现“标题还透明、下面的列表已经显示”的断层
    rootMargin: '0px 0px -5% 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.post-card, .highlight, .stat, .post-content h2, .post-content h3').forEach(el => {
    el.classList.add('reveal');
    observer.observe(el);
  });
})();

// Copy code blocks
(function() {
  document.querySelectorAll('pre').forEach(pre => {
    const button = document.createElement('button');
    button.className = 'copy-code-btn';
    button.textContent = '复制';
    button.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 4px 8px;
      font-size: 12px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;
    pre.style.position = 'relative';
    pre.appendChild(button);

    pre.addEventListener('mouseenter', () => button.style.opacity = '1');
    pre.addEventListener('mouseleave', () => button.style.opacity = '0');

    button.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.textContent || pre.textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = '已复制';
        button.style.background = 'var(--color-success)';
        button.style.color = 'white';
        button.style.borderColor = 'var(--color-success)';
        setTimeout(() => {
          button.textContent = '复制';
          button.style.background = '';
          button.style.color = '';
          button.style.borderColor = '';
        }, 2000);
      } catch (e) {
        button.textContent = '失败';
        setTimeout(() => button.textContent = '复制', 2000);
      }
    });
  });
})();
