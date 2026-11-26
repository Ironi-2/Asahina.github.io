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

// A2: 全站交互式粒子网络（固定视口底层，不遮挡正文；仅桌面、尊重减少动态偏好）
(function() {
  if (!document.documentElement.classList.contains('enable-fx')) return;
  const canvas = document.getElementById('site-particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  const ripples = [];
  const pointer = { x: -9999, y: -9999, active: false };
  let running = true;
  let rafId = 0;
  let linkDist = 120;
  // 文章/页面正文页进一步降低粒子存在感，避免干扰阅读
  const textPage = !!document.querySelector('.post-content, .page-content');
  const density = textPage ? 0.55 : 1;

  const rootStyle = getComputedStyle(document.documentElement);
  function hexToRgb(hex) {
    const clean = (hex || '').replace('#', '').trim();
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return { r: 99, g: 102, b: 241 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    linkDist = Math.max(100, Math.min(160, width / 9));
    const count = Math.min(80, Math.max(30, Math.floor((width * height) / 20000))) * density;
    particles = Array.from({ length: Math.round(count) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.8 + 0.7,
      vx: (Math.random() - 0.5) * 0.16,
      vy: -(Math.random() * 0.2 + 0.05),
      baseVx: 0,
      baseVy: 0
    }));
    particles.forEach(p => { p.baseVx = p.vx; p.baseVy = p.vy; });
  }

  function draw() {
    if (!running) { rafId = 0; return; }
    ctx.clearRect(0, 0, width, height);

    // 每帧读取当前主题色，明暗主题切换后粒子颜色自动跟随
    const { r, g, b } = hexToRgb(rootStyle.getPropertyValue('--color-primary'));
    const rgba = (a) => `rgba(${r}, ${g}, ${b}, ${a * density})`;
    const maxDist2 = linkDist * linkDist;

    ctx.lineWidth = 1;
    // 粒子之间连线：越近越清晰，形成网络感
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const p = particles[j];
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxDist2) {
          ctx.strokeStyle = rgba((1 - d2 / maxDist2) * 0.32);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
    }

    // 指针与附近粒子连线：鼠标移动成为画面焦点
    if (pointer.active) {
      const near2 = maxDist2 * 1.3;
      for (const p of particles) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < near2) {
          ctx.strokeStyle = rgba((1 - d2 / near2) * 0.55);
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
    }

    // 点击涟漪
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 2.4;
      const alpha = Math.max(0, 1 - rp.r / 130);
      if (alpha <= 0) { ripples.splice(i, 1); continue; }
      ctx.strokeStyle = rgba(alpha * 0.35);
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const p of particles) {
      // 被点击推开后缓慢回到原本的漂移速度
      p.vx += (p.baseVx - p.vx) * 0.02;
      p.vy += (p.baseVy - p.vy) * 0.02;
      p.x += p.vx;
      p.y += p.vy;

      if (pointer.active) {
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < 100) {
          const f = (1 - dist / 100) * 0.5;
          p.x -= (dx / dist) * f;
          p.y -= (dy / dist) * f;
        }
      }

      if (p.y < -5) { p.y = height + 5; p.x = Math.random() * width; }
      if (p.x < -5) p.x = width + 5;
      if (p.x > width + 5) p.x = -5;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0.55);
      ctx.fill();
    }
    rafId = requestAnimationFrame(draw);
  }

  function start() {
    if (running && !rafId) rafId = requestAnimationFrame(draw);
  }
  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  // 画布 fixed 定位，指针坐标即视口坐标，无需减去元素偏移
  function onMove(e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }
  function onLeave() { pointer.active = false; }
  function onDown(e) {
    const x = e.clientX;
    const y = e.clientY;
    ripples.push({ x, y, r: 0 });
    for (const p of particles) {
      const dx = p.x - x;
      const dy = p.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < 160) {
        const push = (1 - dist / 160) * 0.9;
        p.vx += (dx / dist) * push;
        p.vy += (dy / dist) * push;
      }
    }
  }

  resize();
  running = true;
  start();
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  window.addEventListener('pointerdown', onDown, { passive: true });

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resize(); });
  }, { passive: true });

  // 标签页切到后台时暂停，避免无谓耗电
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else { running = true; start(); }
  });
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
