/**
 * charts.js - D3.js Data Visualization Engine
 * Implements the sticky reactive scrollytelling chart (6 states) and deep dive charts.
 * Supports embedded data (window.NETFLIX_DATA) for instant local (file://) execution,
 * with graceful fallback to d3.json for web server environments.
 */

window.StickyVisualizer = (function () {
  'use strict';

  let currentStep = -1;
  let dataStore = {};
  let svg, contentG, width, height, margin;
  let tooltip;

  const config = {
    colors: {
      red: '#E50914',
      redLight: '#FF5A60',
      crimson: '#B81D24',
      darkGray: '#3A3A48',
      lightGray: '#8C8C9A',
      us: '#5E5E72',
      intl: '#E50914',
      accentGold: '#FFB800'
    }
  };

  // Step headers and subtitles
  const stepMeta = [
    {
      title: "Büyük Patlama: 2019'da Yıllık 2.016 Yeni İçerik",
      sub: "Kaynak: Kaggle Netflix Kataloğu | Birim: Eklenen başlık adedi",
      source: "Yıllık Eklenen İçerik Hacmi (2008–2021)"
    },
    {
      title: "Kataloğun %69,6'sı Film, Ancak Diziler 5 Kat Hızlandı",
      sub: "Filmler arşivin omurgası olsa da TV dizileri izleyiciyi ekrana bağlamanın anahtarı oldu.",
      source: "Film ve TV Dizisi Hacim Dağılımı (2014–2021)"
    },
    {
      title: "Süre Paradoksu: Filmler 20 Yılda Tam 27 Dakika Kısaldı",
      sub: "2002'deki 119,5 dakikalık ortalama, 2020 yapımlarında 92,1 dakikaya indi.",
      source: "Yapım Yıllarına Göre Ortalama Film Süresi (dk)"
    },
    {
      title: "Tek Sezon Laneti: Dizilerin %67'si 2. Sezonu Göremiyor",
      sub: "Kataloğun her 3 dizisinden 2'si tek bir sezondan ibaret; 5+ sezona ulaşanlar yalnızca %3,4.",
      source: "TV Dizilerinde Sezon Sayısı Dağılımı"
    },
    {
      title: "Hollywood'dan Çıkış: İçeriklerin %58'inden Fazlası Artık Küresel",
      sub: "2015'te %69,5 olan ABD payı, yerel üretim patlamasıyla 2018'de %36,4'e kadar geriledi.",
      source: "ABD vs Uluslararası İçerik Oranı (% 2015–2021)"
    },
    {
      title: "Lisans Arşivinden Orijinal Fabrikaya: Gecikme Sıfırlandı",
      sub: "Eski filmleri kiralayan Netflix'ten, yapımların %55+'inin üretildiği yıl girdiği fabrikaya geçiş.",
      source: "Aynı Yıl veya 1 Yıl İçinde Kataloğa Giren İçerik Oranı (%)"
    }
  ];

  function init() {
    setupStage();
    loadAllData().then(() => {
      goToStep(0, true);
      initDeepDiveCharts();
    }).catch(err => {
      console.error("Data loading error:", err);
    });

    window.addEventListener('resize', debounce(onResize, 200));
  }

  function setupStage() {
    const container = document.getElementById('sticky-chart-stage');
    if (!container) return;

    // Tooltip
    tooltip = d3.select('body').selectAll('.d3-tooltip').data([0]).join('div')
      .attr('class', 'd3-tooltip')
      .style('opacity', 0);

    margin = { top: 30, right: 35, bottom: 45, left: 55 };
    updateDimensions();

    container.innerHTML = '';
    svg = d3.select(container)
      .append('svg')
      .attr('class', 'chart-svg')
      .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', 'Netflix Dönüşüm Analizi Dinamik Grafiği');

    // Defs for gradients
    const defs = svg.append('defs');
    
    // Red Area Gradient
    const areaGrad = defs.append('linearGradient')
      .attr('id', 'red-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    areaGrad.append('stop').attr('offset', '0%').attr('stop-color', config.colors.red).attr('stop-opacity', 0.6);
    areaGrad.append('stop').attr('offset', '100%').attr('stop-color', config.colors.red).attr('stop-opacity', 0.02);

    contentG = svg.append('g')
      .attr('class', 'content-g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
  }

  function updateDimensions() {
    const container = document.getElementById('sticky-chart-stage');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    width = Math.max(300, (rect.width || 600) - margin.left - margin.right);
    height = Math.max(240, (rect.height || 420) - margin.top - margin.bottom);
  }

  function onResize() {
    updateDimensions();
    if (svg) {
      svg.attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`);
      if (currentStep >= 0) {
        goToStep(currentStep, true);
      }
    }
  }

  async function loadAllData() {
    // 1. Check if embedded data is available via window.NETFLIX_DATA
    if (window.NETFLIX_DATA) {
      dataStore = {
        timeline: window.NETFLIX_DATA.timeline,
        duration: window.NETFLIX_DATA.duration,
        tvSeasons: window.NETFLIX_DATA.tvSeasons,
        countries: window.NETFLIX_DATA.countries,
        genres: window.NETFLIX_DATA.genres,
        lag: window.NETFLIX_DATA.lag
      };
      return;
    }

    // 2. Fallback to external JSON fetch (works on HTTP/HTTPS servers)
    try {
      const [timeline, duration, tvSeasons, countries, genres, lag] = await Promise.all([
        d3.json('data/timeline_evolution.json'),
        d3.json('data/duration_trends.json'),
        d3.json('data/tv_seasons.json'),
        d3.json('data/country_stats.json'),
        d3.json('data/genre_stats.json'),
        d3.json('data/lag_trends.json')
      ]);

      dataStore = { timeline, duration, tvSeasons, countries, genres, lag };
    } catch (err) {
      console.warn("External fetch failed. If opening directly via file://, please ensure js/data.js is loaded.", err);
    }
  }

  function goToStep(stepIndex, isResize = false) {
    if (stepIndex === currentStep && !isResize) return;
    currentStep = stepIndex;

    // Update Header Text
    const meta = stepMeta[stepIndex] || stepMeta[0];
    const headlineEl = document.getElementById('sticky-headline');
    const subheadlineEl = document.getElementById('sticky-subheadline');
    const sourceEl = document.getElementById('sticky-source');
    
    if (headlineEl) headlineEl.textContent = meta.title;
    if (subheadlineEl) subheadlineEl.textContent = meta.sub;
    if (sourceEl) sourceEl.textContent = meta.source;

    // Clear previous elements immediately and cleanly
    if (!contentG) return;
    contentG.selectAll('*').interrupt().remove();

    // Render corresponding state
    switch (stepIndex) {
      case 0:
        renderState1_Timeline();
        break;
      case 1:
        renderState2_MoviesVsTv();
        break;
      case 2:
        renderState3_RuntimeDecline();
        break;
      case 3:
        renderState4_TvSeasonCliff();
        break;
      case 4:
        renderState5_HollywoodDecline();
        break;
      case 5:
        renderState6_ReleaseLag();
        break;
      default:
        renderState1_Timeline();
    }
  }

  // -------------------------------------------------------------
  // STATE 1: Timeline Evolution (2008–2021)
  // -------------------------------------------------------------
  function renderState1_Timeline() {
    const data = dataStore.timeline;
    if (!data || data.length === 0) return;

    const x = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, 2200])
      .range([height, 0]);

    // Gridlines
    contentG.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(''))
      .selectAll('line').attr('class', 'grid-line');

    // X Axis
    contentG.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text');

    // Y Axis
    contentG.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toLocaleString('tr-TR')))
      .selectAll('text').attr('class', 'axis-text');

    // Axis Labels
    contentG.append('text')
      .attr('x', width / 2)
      .attr('y', height + 36)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9090A0')
      .attr('font-size', '11px')
      .text('Kataloğa Eklenme Yılı');

    contentG.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -42)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9090A0')
      .attr('font-size', '11px')
      .text('Eklenen İçerik Sayısı');

    // Area Generator
    const area = d3.area()
      .x(d => x(d.year))
      .y0(height)
      .y1(d => y(d.total))
      .curve(d3.curveMonotoneX);

    // Line Generator
    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.total))
      .curve(d3.curveMonotoneX);

    // Draw Area
    contentG.append('path')
      .datum(data)
      .attr('fill', 'url(#red-gradient)')
      .attr('d', area)
      .style('opacity', 0)
      .transition().duration(600)
      .style('opacity', 1);

    // Draw Line
    const path = contentG.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', config.colors.red)
      .attr('stroke-width', 3)
      .attr('d', line);

    // Line drawing animation
    const totalLength = path.node().getTotalLength();
    path
      .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
      .attr('stroke-dashoffset', totalLength)
      .transition().duration(900).ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    // Data dots
    contentG.selectAll('.dot')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(d.year))
      .attr('cy', d => y(d.total))
      .attr('r', 4)
      .attr('fill', '#FFFFFF')
      .attr('stroke', config.colors.red)
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.year} Yılı</strong><br/>Toplam: <b>${d.total.toLocaleString('tr-TR')}</b> başlık<br/>Film: ${d.movies} | Dizi: ${d.tv_shows}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    // Annotations: 2016 and 2019
    const d2016 = data.find(d => d.year === 2016);
    const d2019 = data.find(d => d.year === 2019);

    if (d2016) {
      contentG.append('circle')
        .attr('cx', x(2016)).attr('cy', y(d2016.total))
        .attr('r', 7).attr('fill', 'none')
        .attr('stroke', '#FFB800').attr('stroke-width', 2);

      contentG.append('text')
        .attr('x', x(2016) - 8).attr('y', y(d2016.total) - 14)
        .attr('text-anchor', 'end')
        .attr('fill', '#FFB800').attr('font-size', '11px').attr('font-weight', '700')
        .text('2016: Küresel Açılım (429)');
    }

    if (d2019) {
      contentG.append('circle')
        .attr('cx', x(2019)).attr('cy', y(d2019.total))
        .attr('r', 7).attr('fill', 'none')
        .attr('stroke', '#FFFFFF').attr('stroke-width', 2);

      contentG.append('text')
        .attr('x', x(2019)).attr('y', y(d2019.total) - 14)
        .attr('text-anchor', 'middle')
        .attr('fill', '#FFFFFF').attr('font-size', '12px').attr('font-weight', '800')
        .text('Zirve: 2.016 Başlık');
    }
  }

  // -------------------------------------------------------------
  // STATE 2: Movies vs TV Shows Split
  // -------------------------------------------------------------
  function renderState2_MoviesVsTv() {
    const data = dataStore.timeline ? dataStore.timeline.filter(d => d.year >= 2014) : [];
    if (data.length === 0) return;

    const x0 = d3.scaleBand()
      .domain(data.map(d => d.year))
      .range([0, width])
      .padding(0.25);

    const y = d3.scaleLinear()
      .domain([0, 1600])
      .range([height, 0]);

    // Gridlines
    contentG.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(''))
      .selectAll('line').attr('class', 'grid-line');

    // Axes
    contentG.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x0).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text');

    contentG.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toLocaleString('tr-TR')))
      .selectAll('text').attr('class', 'axis-text');

    // Sub-scale for grouped bars
    const x1 = d3.scaleBand()
      .domain(['movies', 'tv_shows'])
      .range([0, x0.bandwidth()])
      .padding(0.1);

    const yearGroups = contentG.selectAll('.year-group')
      .data(data)
      .enter()
      .append('g')
      .attr('transform', d => `translate(${x0(d.year)},0)`);

    // Movie Bars (Red)
    yearGroups.append('rect')
      .attr('x', x1('movies'))
      .attr('y', height)
      .attr('width', x1.bandwidth())
      .attr('height', 0)
      .attr('fill', config.colors.red)
      .attr('rx', 3)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.year} - Film</strong><br/>Adet: <b>${d.movies}</b> (%${Math.round(d.movies/d.total*100)})`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0))
      .transition().duration(600)
      .attr('y', d => y(d.movies))
      .attr('height', d => height - y(d.movies));

    // TV Bars (Light Gray)
    yearGroups.append('rect')
      .attr('x', x1('tv_shows'))
      .attr('y', height)
      .attr('width', x1.bandwidth())
      .attr('height', 0)
      .attr('fill', config.colors.lightGray)
      .attr('rx', 3)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.year} - TV Dizisi</strong><br/>Adet: <b>${d.tv_shows}</b> (%${Math.round(d.tv_shows/d.total*100)})`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0))
      .transition().duration(600).delay(100)
      .attr('y', d => y(d.tv_shows))
      .attr('height', d => height - y(d.tv_shows));

    // Legend
    const legend = contentG.append('g').attr('transform', `translate(${width - 170}, 5)`);
    legend.append('rect').attr('x', 0).attr('y', 0).attr('width', 12).attr('height', 12).attr('fill', config.colors.red).attr('rx', 2);
    legend.append('text').attr('x', 18).attr('y', 10).attr('fill', '#fff').attr('font-size', '11px').text('Film (Toplam: 6.131)');

    legend.append('rect').attr('x', 0).attr('y', 18).attr('width', 12).attr('height', 12).attr('fill', config.colors.lightGray).attr('rx', 2);
    legend.append('text').attr('x', 18).attr('y', 28).attr('fill', '#fff').attr('font-size', '11px').text('TV Dizisi (2.676)');
  }

  // -------------------------------------------------------------
  // STATE 3: Movie Runtime Decline (2000–2021)
  // -------------------------------------------------------------
  function renderState3_RuntimeDecline() {
    const data = dataStore.duration ? dataStore.duration.filter(d => d.release_year >= 2000 && d.release_year <= 2021) : [];
    if (data.length === 0) return;

    const x = d3.scaleLinear()
      .domain([2000, 2021])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([80, 125])
      .range([height, 0]);

    // Gridlines
    contentG.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(''))
      .selectAll('line').attr('class', 'grid-line');

    // Axes
    contentG.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(10).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text');

    contentG.append('g')
      .call(d3.axisLeft(y).ticks(6).tickFormat(d => `${d} dk`))
      .selectAll('text').attr('class', 'axis-text');

    // Confidence / Interquartile Band (q25 to q75)
    const bandArea = d3.area()
      .x(d => x(d.release_year))
      .y0(d => y(d.q25))
      .y1(d => y(d.q75))
      .curve(d3.curveMonotoneX);

    contentG.append('path')
      .datum(data)
      .attr('fill', 'rgba(229, 9, 20, 0.12)')
      .attr('d', bandArea);

    // Mean runtime line
    const line = d3.line()
      .x(d => x(d.release_year))
      .y(d => y(d.mean))
      .curve(d3.curveMonotoneX);

    contentG.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', config.colors.red)
      .attr('stroke-width', 3)
      .attr('d', line);

    // Data points
    contentG.selectAll('.dot-run')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.release_year))
      .attr('cy', d => y(d.mean))
      .attr('r', 4.5)
      .attr('fill', '#FFFFFF')
      .attr('stroke', config.colors.red)
      .attr('stroke-width', 2)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.release_year} Yapımı Filmler</strong><br/>Ortalama: <b>${d.mean} dk</b><br/>Medyan: ${d.median} dk<br/>Başlık: ${d.count} adet`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    // Key Annotations
    const pt2002 = data.find(d => d.release_year === 2002);
    const pt2020 = data.find(d => d.release_year === 2020);

    if (pt2002 && pt2020) {
      // 2002 Callout
      contentG.append('text')
        .attr('x', x(2002) + 5).attr('y', y(pt2002.mean) - 12)
        .attr('fill', '#FFFFFF').attr('font-size', '11.5px').attr('font-weight', '700')
        .text('2002: 119,5 dk');

      // 2020 Callout
      contentG.append('text')
        .attr('x', x(2020) - 10).attr('y', y(pt2020.mean) + 20)
        .attr('text-anchor', 'end')
        .attr('fill', config.colors.redLight).attr('font-size', '12px').attr('font-weight', '800')
        .text('2020: 92,1 dk (-27,4 dk!)');

      // Drop arrow
      contentG.append('line')
        .attr('x1', x(2002)).attr('y1', y(pt2002.mean))
        .attr('x2', x(2020)).attr('y2', y(pt2020.mean))
        .attr('stroke', '#FFB800').attr('stroke-width', 1.5).attr('stroke-dasharray', '4,4');
    }
  }

  // -------------------------------------------------------------
  // STATE 4: TV Seasons Cliff (%67.0 1 Season)
  // -------------------------------------------------------------
  function renderState4_TvSeasonCliff() {
    const data = dataStore.tvSeasons || [];
    if (data.length === 0) return;

    const x = d3.scaleBand()
      .domain(data.map(d => d.category))
      .range([0, width])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, 80])
      .range([height, 0]);

    // Gridlines
    contentG.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(''))
      .selectAll('line').attr('class', 'grid-line');

    // Axes
    contentG.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text').attr('class', 'axis-text').style('font-size', '12px');

    contentG.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `%${d}`))
      .selectAll('text').attr('class', 'axis-text');

    // Bars
    contentG.selectAll('.cliff-bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'cliff-bar')
      .attr('x', d => x(d.category))
      .attr('y', height)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('fill', d => d.highlight ? config.colors.red : config.colors.lightGray)
      .attr('rx', 4)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.category}</strong><br/>Payı: <b>%${d.percentage}</b> (${d.count.toLocaleString('tr-TR')} dizi)<br/>${d.desc}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0))
      .transition().duration(700)
      .attr('y', d => y(d.percentage))
      .attr('height', d => height - y(d.percentage));

    // Bar percentage labels
    contentG.selectAll('.cliff-label')
      .data(data)
      .enter()
      .append('text')
      .attr('x', d => x(d.category) + x.bandwidth() / 2)
      .attr('y', d => y(d.percentage) - 8)
      .attr('text-anchor', 'middle')
      .attr('fill', d => d.highlight ? '#FFFFFF' : '#B3B3C2')
      .attr('font-size', '13px')
      .attr('font-weight', '700')
      .text(d => `%${d.percentage}`);

    // Callout box on Season 1
    contentG.append('text')
      .attr('x', x('1. Sezon') + x.bandwidth() + 15)
      .attr('y', y(67.0) + 15)
      .attr('fill', config.colors.redLight)
      .attr('font-size', '11.5px')
      .attr('font-weight', '700')
      .text('İptal Uçurumu: Dizilerin 2/3\'ü burada bitiyor');
  }

  // -------------------------------------------------------------
  // STATE 5: Hollywood Decline (US vs World 100% Stacked)
  // -------------------------------------------------------------
  function renderState5_HollywoodDecline() {
    const data = dataStore.timeline ? dataStore.timeline.filter(d => d.year >= 2015) : [];
    if (data.length === 0) return;

    const x = d3.scaleBand()
      .domain(data.map(d => d.year))
      .range([0, width])
      .padding(0.35);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([height, 0]);

    // Gridlines
    contentG.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(''))
      .selectAll('line').attr('class', 'grid-line');

    // Axes
    contentG.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text');

    contentG.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `%${d}`))
      .selectAll('text').attr('class', 'axis-text');

    const yearGroups = contentG.selectAll('.share-group')
      .data(data)
      .enter()
      .append('g')
      .attr('transform', d => `translate(${x(d.year)},0)`);

    // US segment (bottom)
    yearGroups.append('rect')
      .attr('x', 0)
      .attr('y', d => y(d.us_share_pct))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.us_share_pct))
      .attr('fill', config.colors.us)
      .attr('rx', 3)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.year} - ABD Payı</strong><br/>Oran: <b>%${d.us_share_pct}</b> (${d.us_count} başlık)`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    // International segment (top)
    yearGroups.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', x.bandwidth())
      .attr('height', d => y(d.us_share_pct))
      .attr('fill', config.colors.intl)
      .attr('rx', 3)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.year} - Uluslararası Payı</strong><br/>Oran: <b>%${d.non_us_share_pct}</b> (${d.non_us_count} başlık)`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    // Legend
    const legend = contentG.append('g').attr('transform', `translate(${width - 210}, 5)`);
    legend.append('rect').attr('x', 0).attr('y', 0).attr('width', 12).attr('height', 12).attr('fill', config.colors.intl).attr('rx', 2);
    legend.append('text').attr('x', 18).attr('y', 10).attr('fill', '#fff').attr('font-size', '11px').text('Uluslararası İçerik (%)');

    legend.append('rect').attr('x', 0).attr('y', 18).attr('width', 12).attr('height', 12).attr('fill', config.colors.us).attr('rx', 2);
    legend.append('text').attr('x', 18).attr('y', 28).attr('fill', '#fff').attr('font-size', '11px').text('ABD Menşeili İçerik (%)');

    // 50% equilibrium threshold line
    contentG.append('line')
      .attr('x1', 0).attr('y1', y(50))
      .attr('x2', width).attr('y2', y(50))
      .attr('stroke', '#FFFFFF').attr('stroke-dasharray', '3,3').attr('stroke-width', 1.5);

    contentG.append('text')
      .attr('x', 10).attr('y', y(50) - 6)
      .attr('fill', '#FFFFFF').attr('font-size', '10.5px').attr('font-weight', '700')
      .text('%50 Denge Eşiği');
  }

  // -------------------------------------------------------------
  // STATE 6: Release Lag / Original Production
  // -------------------------------------------------------------
  function renderState6_ReleaseLag() {
    const data = dataStore.lag || [];
    if (data.length === 0) return;

    const x = d3.scaleBand()
      .domain(data.map(d => d.year_added))
      .range([0, width])
      .padding(0.35);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([height, 0]);

    // Gridlines
    contentG.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(''))
      .selectAll('line').attr('class', 'grid-line');

    // Axes
    contentG.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text');

    contentG.append('g')
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `%${d}`))
      .selectAll('text').attr('class', 'axis-text');

    // Bars
    contentG.selectAll('.lag-bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'lag-bar')
      .attr('x', d => x(d.year_added))
      .attr('y', height)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('fill', config.colors.red)
      .attr('rx', 4)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.year_added} Girişli İçerikler</strong><br/>Taze İçerik Payı: <b>%${d.fresh_content_pct}</b><br/>Medyan Yayın Gecikmesi: <b>${d.median_lag_years} yıl</b>`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0))
      .transition().duration(700)
      .attr('y', d => y(d.fresh_content_pct))
      .attr('height', d => height - y(d.fresh_content_pct));

    // Labels
    contentG.selectAll('.lag-label')
      .data(data)
      .enter()
      .append('text')
      .attr('x', d => x(d.year_added) + x.bandwidth() / 2)
      .attr('y', d => y(d.fresh_content_pct) - 8)
      .attr('text-anchor', 'middle')
      .attr('fill', '#FFFFFF')
      .attr('font-size', '12px')
      .attr('font-weight', '700')
      .text(d => `%${Math.round(d.fresh_content_pct)}`);
  }

  // -------------------------------------------------------------
  // DEEP DIVE CHARTS 1 & 2
  // -------------------------------------------------------------
  function initDeepDiveCharts() {
    renderDeepDiveCountries();
    renderDeepDiveGenres();
  }

  // Deep Dive 1: Top 12 Countries Horizontal Bar Chart
  function renderDeepDiveCountries() {
    const container = document.getElementById('deepdive-countries-chart');
    if (!container || !dataStore.countries) return;

    container.innerHTML = '';
    const rect = container.getBoundingClientRect();
    const cWidth = Math.max(300, rect.width || 500);
    const cHeight = Math.max(260, rect.height || 380);
    const cMargin = { top: 20, right: 35, bottom: 40, left: 110 };
    const innerW = cWidth - cMargin.left - cMargin.right;
    const innerH = cHeight - cMargin.top - cMargin.bottom;

    const top12 = dataStore.countries.slice(0, 12);

    const svgC = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${cWidth} ${cHeight}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', 'En Çok İçerik Üreten İlk 12 Ülke');

    const gC = svgC.append('g')
      .attr('transform', `translate(${cMargin.left},${cMargin.top})`);

    const y = d3.scaleBand()
      .domain(top12.map(d => d.country))
      .range([0, innerH])
      .padding(0.25);

    const x = d3.scaleLinear()
      .domain([0, d3.max(top12, d => d.total_titles) * 1.05])
      .range([0, innerW]);

    gC.append('g')
      .call(d3.axisLeft(y))
      .selectAll('text')
      .attr('class', 'axis-text')
      .attr('font-size', '11px')
      .attr('fill', d => d === 'Turkey' ? '#FFB800' : '#FFFFFF');

    gC.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text');

    gC.selectAll('.country-bar')
      .data(top12)
      .enter()
      .append('rect')
      .attr('y', d => y(d.country))
      .attr('x', 0)
      .attr('height', y.bandwidth())
      .attr('width', d => x(d.total_titles))
      .attr('fill', d => d.country === 'Turkey' ? '#FFB800' : (d.country === 'United States' ? '#5E5E72' : config.colors.red))
      .attr('rx', 3)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.country}</strong><br/>Toplam: <b>${d.total_titles}</b> başlık<br/>Film: ${d.movies_count} (%${d.movie_pct})<br/>Dizi: ${d.tv_count} (%${d.tv_pct})`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    // Numbers at end of bars
    gC.selectAll('.country-val')
      .data(top12)
      .enter()
      .append('text')
      .attr('y', d => y(d.country) + y.bandwidth() / 2 + 4)
      .attr('x', d => x(d.total_titles) + 6)
      .attr('fill', '#B3B3C2')
      .attr('font-size', '10.5px')
      .attr('font-weight', '600')
      .text(d => d.total_titles.toLocaleString('tr-TR'));
  }

  // Deep Dive 2: Top Genres
  function renderDeepDiveGenres() {
    const container = document.getElementById('deepdive-genres-chart');
    if (!container) return;

    const data = dataStore.genres || (window.NETFLIX_DATA ? window.NETFLIX_DATA.genres : null);
    if (!data) return;

    container.innerHTML = '';
    const rect = container.getBoundingClientRect();
    const gWidth = Math.max(300, rect.width || 500);
    const gHeight = Math.max(260, rect.height || 380);
    const gMargin = { top: 20, right: 35, bottom: 40, left: 140 };
    const innerW = gWidth - gMargin.left - gMargin.right;
    const innerH = gHeight - gMargin.top - gMargin.bottom;

    const top10 = data.slice(0, 10);

    const svgG = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${gWidth} ${gHeight}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .attr('role', 'img')
      .attr('aria-label', 'En Yaygın 10 İçerik Türü');

    const gMain = svgG.append('g')
      .attr('transform', `translate(${gMargin.left},${gMargin.top})`);

    const y = d3.scaleBand()
      .domain(top10.map(d => d.genre))
      .range([0, innerH])
      .padding(0.25);

    const x = d3.scaleLinear()
      .domain([0, d3.max(top10, d => d.count) * 1.05])
      .range([0, innerW]);

    gMain.append('g')
      .call(d3.axisLeft(y))
      .selectAll('text').attr('class', 'axis-text').attr('font-size', '11px');

    gMain.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('d')))
      .selectAll('text').attr('class', 'axis-text');

    gMain.selectAll('.genre-bar')
      .data(top10)
      .enter()
      .append('rect')
      .attr('y', d => y(d.genre))
      .attr('x', 0)
      .attr('height', y.bandwidth())
      .attr('width', d => x(d.count))
      .attr('fill', d => d.type_dominant === 'Movie' ? config.colors.red : '#58A6FF')
      .attr('rx', 3)
      .on('mouseover', (event, d) => {
        tooltip.style('opacity', 1)
          .html(`<strong>${d.genre}</strong><br/>Toplam: <b>${d.count}</b> başlık<br/>Film: ${d.movie_count} | Dizi: ${d.tv_count}`)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 30) + 'px');
      })
      .on('mouseout', () => tooltip.style('opacity', 0));

    gMain.selectAll('.genre-val')
      .data(top10)
      .enter()
      .append('text')
      .attr('y', d => y(d.genre) + y.bandwidth() / 2 + 4)
      .attr('x', d => x(d.count) + 6)
      .attr('fill', '#B3B3C2')
      .attr('font-size', '10.5px')
      .attr('font-weight', '600')
      .text(d => d.count.toLocaleString('tr-TR'));
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  return {
    init,
    goToStep
  };
})();

// Auto-boot on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.StickyVisualizer.init());
} else {
  window.StickyVisualizer.init();
}
