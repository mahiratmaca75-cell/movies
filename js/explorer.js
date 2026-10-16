/**
 * explorer.js - Interactive Reader Discovery Tool
 * Enables user-driven exploratory data analysis across the 8,807 title Netflix archive.
 * Includes interactive filters: Country dropdown, Type select, Year range slider, and search.
 * Supports window.NETFLIX_DATA for instant local execution and d3.json fallback.
 */

(function () {
  'use strict';

  let catalogData = [];
  let filteredData = [];
  let explorerSvg, explorerG, eWidth, eHeight, eMargin;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExplorer);
  } else {
    initExplorer();
  }

  async function initExplorer() {
    setupExplorerStage();

    try {
      if (window.NETFLIX_DATA && window.NETFLIX_DATA.catalog) {
        catalogData = window.NETFLIX_DATA.catalog;
      } else {
        catalogData = await d3.json('data/catalog_sample.json');
      }
      populateCountryDropdown();
      setupEventListeners();
      applyFilters();
    } catch (err) {
      console.error("Failed to load catalog data for explorer:", err);
    }

    window.addEventListener('resize', debounce(() => {
      setupExplorerStage();
      renderExplorerChart();
    }, 200));
  }

  function setupExplorerStage() {
    const container = document.getElementById('explorer-chart-stage');
    if (!container) return;

    eMargin = { top: 25, right: 25, bottom: 40, left: 50 };
    const rect = container.getBoundingClientRect();
    eWidth = Math.max(260, (rect.width || 500) - eMargin.left - eMargin.right);
    eHeight = Math.max(180, (rect.height || 360) - eMargin.top - eMargin.bottom);

    container.innerHTML = '';
    explorerSvg = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${eWidth + eMargin.left + eMargin.right} ${eHeight + eMargin.top + eMargin.bottom}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('class', 'chart-svg');

    explorerG = explorerSvg.append('g')
      .attr('transform', `translate(${eMargin.left},${eMargin.top})`);
  }

  function populateCountryDropdown() {
    const select = document.getElementById('filter-country');
    if (!select || !catalogData) return;

    // Get unique top countries
    const countryCounts = {};
    catalogData.forEach(d => {
      const c = d.c || 'Bilinmiyor';
      countryCounts[c] = (countryCounts[c] || 0) + 1;
    });

    const sortedCountries = Object.entries(countryCounts)
      .filter(([c]) => c !== 'Bilinmiyor')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);

    // Remove old options except first (All)
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add Turkey prominently
    const trOption = document.createElement('option');
    trOption.value = 'Turkey';
    trOption.textContent = '🇹🇷 Türkiye (113 Başlık)';
    select.appendChild(trOption);

    sortedCountries.forEach(([country, count]) => {
      if (country === 'Turkey') return;
      const opt = document.createElement('option');
      opt.value = country;
      opt.textContent = `${country} (${count} Başlık)`;
      select.appendChild(opt);
    });
  }

  function setupEventListeners() {
    const countrySelect = document.getElementById('filter-country');
    const typeSelect = document.getElementById('filter-type');
    const yearSlider = document.getElementById('filter-year');
    const yearDisplay = document.getElementById('slider-year-val');
    const searchInput = document.getElementById('filter-search');

    if (countrySelect) countrySelect.addEventListener('change', applyFilters);
    if (typeSelect) typeSelect.addEventListener('change', applyFilters);

    if (yearSlider) {
      yearSlider.addEventListener('input', (e) => {
        if (yearDisplay) yearDisplay.textContent = e.target.value;
        applyFilters();
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', debounce(applyFilters, 250));
    }
  }

  function applyFilters() {
    if (!catalogData || catalogData.length === 0) return;

    const country = document.getElementById('filter-country')?.value || 'all';
    const type = document.getElementById('filter-type')?.value || 'all';
    const minYear = parseInt(document.getElementById('filter-year')?.value || '2000', 10);
    const query = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();

    filteredData = catalogData.filter(d => {
      // Country match
      if (country !== 'all' && d.c !== country) return false;
      // Type match (d.tp is 'Movie' or 'TV Show')
      if (type !== 'all' && d.tp !== type) return false;
      // Release year match
      if (d.y < minYear) return false;
      // Text search in title or genre
      if (query && !d.t.toLowerCase().includes(query) && !d.g.toLowerCase().includes(query)) return false;
      return true;
    });

    updateExplorerKPIs();
    renderExplorerChart();
    renderMatchingList();
  }

  function updateExplorerKPIs() {
    const countEl = document.getElementById('exp-total-count');
    const moviePctEl = document.getElementById('exp-movie-pct');
    const avgDurationEl = document.getElementById('exp-avg-duration');
    const s1PctEl = document.getElementById('exp-s1-pct');

    const total = filteredData.length;
    if (countEl) countEl.textContent = total.toLocaleString('tr-TR');

    if (total === 0) {
      if (moviePctEl) moviePctEl.textContent = '-';
      if (avgDurationEl) avgDurationEl.textContent = '-';
      if (s1PctEl) s1PctEl.textContent = '-';
      return;
    }

    const movies = filteredData.filter(d => d.tp === 'Movie');
    const tvShows = filteredData.filter(d => d.tp === 'TV Show');

    // Movie share %
    if (moviePctEl) {
      const pct = Math.round((movies.length / total) * 100);
      moviePctEl.textContent = `%${pct}`;
    }

    // Movie avg duration
    if (avgDurationEl) {
      const durations = movies.map(d => {
        const m = (d.d || '').match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
      }).filter(Boolean);

      if (durations.length > 0) {
        const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
        avgDurationEl.textContent = `${avg} dk`;
      } else {
        avgDurationEl.textContent = 'Veri yok';
      }
    }

    // 1-Season TV %
    if (s1PctEl) {
      if (tvShows.length > 0) {
        const s1Count = tvShows.filter(d => (d.d || '').startsWith('1 Season')).length;
        const s1Pct = Math.round((s1Count / tvShows.length) * 100);
        s1PctEl.textContent = `%${s1Pct}`;
      } else {
        s1PctEl.textContent = 'Dizi yok';
      }
    }
  }

  function renderExplorerChart() {
    if (!explorerG) return;
    explorerG.selectAll('*').remove();

    // Group by year_added (or release_year)
    const yearCounts = {};
    filteredData.forEach(d => {
      const yr = d.a || d.y;
      if (yr && yr >= 2012 && yr <= 2021) {
        yearCounts[yr] = (yearCounts[yr] || 0) + 1;
      }
    });

    const years = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021];
    const chartData = years.map(yr => ({ year: yr, count: yearCounts[yr] || 0 }));

    const maxVal = Math.max(10, d3.max(chartData, d => d.count) || 10);

    const x = d3.scaleBand()
      .domain(years)
      .range([0, eWidth])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, maxVal * 1.1])
      .range([eHeight, 0]);

    // Gridlines
    explorerG.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(4).tickSize(-eWidth).tickFormat(''))
      .selectAll('line').attr('class', 'grid-line');

    // Axes
    explorerG.append('g')
      .attr('transform', `translate(0,${eHeight})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text').style('font-size', '10px');

    explorerG.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text');

    // Bars
    explorerG.selectAll('.exp-bar')
      .data(chartData)
      .enter()
      .append('rect')
      .attr('class', 'exp-bar')
      .attr('x', d => x(d.year))
      .attr('y', d => y(d.count))
      .attr('width', x.bandwidth())
      .attr('height', d => eHeight - y(d.count))
      .attr('fill', '#E50914')
      .attr('rx', 3);

    // Value text above bars
    explorerG.selectAll('.exp-bar-txt')
      .data(chartData)
      .enter()
      .append('text')
      .attr('x', d => x(d.year) + x.bandwidth() / 2)
      .attr('y', d => y(d.count) - 5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#A0A0B0')
      .attr('font-size', '10px')
      .text(d => d.count > 0 ? d.count : '');

    // Title inside chart
    explorerG.append('text')
      .attr('x', 0)
      .attr('y', -8)
      .attr('fill', '#E0E0E0')
      .attr('font-size', '11.5px')
      .attr('font-weight', '700')
      .text('Seçilen Kriterlere Göre Yıllık Kataloğa Giriş Sayısı');
  }

  function renderMatchingList() {
    const listContainer = document.getElementById('explorer-results-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const slice = filteredData.slice(0, 40);

    if (slice.length === 0) {
      listContainer.innerHTML = '<div style="color: #8C8C9A; padding: 2rem; text-align: center;">Kriterlere uygun yapım bulunamadı. Lütfen filtreleri gevşetin.</div>';
      return;
    }

    slice.forEach(d => {
      const item = document.createElement('div');
      item.className = 'result-item';
      const isMovie = d.tp === 'Movie';
      const badgeClass = isMovie ? 'movie' : 'tv';
      const badgeText = isMovie ? 'Film' : 'Dizi';

      item.innerHTML = `
        <div class="result-item-info">
          <h4>${escapeHtml(d.t)}</h4>
          <div class="result-item-meta">
            <span>${d.y}</span> · 
            <span>${escapeHtml(d.c || 'Bilinmiyor')}</span> · 
            <span>${escapeHtml(d.g || '')}</span>
          </div>
        </div>
        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
          <span class="result-badge ${badgeClass}">${badgeText}</span>
          <span style="font-size: 0.75rem; color: #9E9EB0;">${d.d || ''}</span>
        </div>
      `;
      listContainer.appendChild(item);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
})();
